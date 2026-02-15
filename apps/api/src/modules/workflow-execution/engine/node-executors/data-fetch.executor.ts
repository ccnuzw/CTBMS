import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { PrismaService } from '../../../../prisma';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

const LEGACY_DATA_SOURCE_CODE_MAP: Record<string, string> = {
    INTERNAL_DB: 'MARKET_INTEL_INTERNAL_DB',
    VOLATILITY_DB: 'MARKET_EVENT_INTERNAL_DB',
    INTERNAL_MARKET_DB: 'MARKET_INTEL_INTERNAL_DB',
    market_intel_db: 'MARKET_INTEL_INTERNAL_DB',
    inventory_db: 'MARKET_EVENT_INTERNAL_DB',
};

/**
 * 数据采集节点执行器
 *
 * 执行流程:
 * 1. 根据节点 config.dataSourceCode 查找 DataConnector
 * 2. 根据 connectorType 分发请求 (REST_API / INTERNAL_DB / FILE_IMPORT)
 * 3. 应用 timeRangeType + lookbackDays + filters 过滤
 * 4. 数据新鲜度检查 (freshnessMaxMinutes)
 * 5. 兜底 fallbackConnectorCode 容错
 * 6. 写入 NodeExecution.outputSnapshot
 */
@Injectable()
export class DataFetchNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'DataFetchNodeExecutor';
    private readonly logger = new Logger(DataFetchNodeExecutor.name);

    constructor(private readonly prisma: PrismaService) { }

    supports(node: WorkflowNode): boolean {
        return node.type === 'data-fetch';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = context.node.config as Record<string, unknown>;
        // Backward compatibility: early seeded templates used connectorCode on data-fetch nodes.
        const rawDataSourceCode =
            (config.dataSourceCode as string | undefined) ??
            (config.connectorCode as string | undefined);

        if (!rawDataSourceCode) {
            return {
                status: 'FAILED',
                output: {},
                message: '节点配置缺少 dataSourceCode',
            };
        }

        const dataSourceCode = LEGACY_DATA_SOURCE_CODE_MAP[rawDataSourceCode] ?? rawDataSourceCode;

        if (dataSourceCode !== rawDataSourceCode) {
            this.logger.warn(
                `DataFetch 使用兼容映射: ${rawDataSourceCode} -> ${dataSourceCode}`,
            );
        }

        // 1. 获取 DataConnector
        const connector = await this.prisma.dataConnector.findFirst({
            where: { connectorCode: dataSourceCode, isActive: true },
        });

        if (!connector) {
            return await this.tryFallback(dataSourceCode, config, context);
        }

        // 2. 根据类型分发
        try {
            const result = await this.fetchData(connector, config, context);

            // 3. 新鲜度检查
            const freshnessCheck = this.checkFreshness(result, config);
            if (!freshnessCheck.isFresh) {
                this.logger.warn(
                    `DataConnector[${dataSourceCode}] 数据不新鲜: ${freshnessCheck.message}`,
                );
            }

            return {
                status: 'SUCCESS',
                output: {
                    dataSourceCode,
                    connectorType: connector.connectorType,
                    category: connector.category,
                    isFresh: freshnessCheck.isFresh,
                    freshnessMessage: freshnessCheck.message,
                    fetchedAt: new Date().toISOString(),
                    recordCount: Array.isArray(result.data) ? result.data.length : 1,
                    data: result.data,
                    metadata: result.metadata,
                },
                message: `数据采集成功: ${dataSourceCode} (${connector.connectorType})`,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`DataConnector[${dataSourceCode}] 采集失败: ${errorMsg}`);

            // 尝试兜底连接器
            if (connector.fallbackConnectorCode) {
                this.logger.log(
                    `尝试兜底连接器: ${connector.fallbackConnectorCode}`,
                );
                return await this.tryFallback(connector.fallbackConnectorCode, config, context);
            }

            return {
                status: 'FAILED',
                output: { error: errorMsg },
                message: `数据采集失败: ${errorMsg}`,
            };
        }
    }

    /**
     * 根据连接器类型执行数据获取
     */
    private async fetchData(
        connector: Record<string, unknown>,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<{ data: unknown; metadata: Record<string, unknown> }> {
        const connectorType = connector.connectorType as string;

        switch (connectorType) {
            case 'REST_API':
                return this.fetchFromRestApi(connector, config, context);
            case 'INTERNAL_DB':
                return this.fetchFromInternalDb(connector, config, context);
            case 'FILE_IMPORT':
                return this.fetchFromFile(connector, config);
            default:
                throw new Error(`不支持的连接器类型: ${connectorType}`);
        }
    }

    /**
     * REST API 数据采集
     */
    private async fetchFromRestApi(
        connector: Record<string, unknown>,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<{ data: unknown; metadata: Record<string, unknown> }> {
        const endpointConfig = connector.endpointConfig as Record<string, unknown> | null;
        const url = endpointConfig?.url as string;
        if (!url) {
            throw new Error('REST_API 连接器缺少 endpointConfig.url');
        }

        const method = (endpointConfig?.method as string) ?? 'GET';
        const headers = (endpointConfig?.headers as Record<string, string>) ?? {};

        // 构建查询参数
        const queryParams = this.buildQueryParams(config, context);

        // 应用限流配置
        const rateLimitConfig = connector.rateLimitConfig as Record<string, unknown> | null;
        const timeoutMs = (rateLimitConfig?.timeoutMs as number) ?? 30000;

        const fullUrl = new URL(url);
        for (const [key, value] of Object.entries(queryParams)) {
            fullUrl.searchParams.set(key, String(value));
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(fullUrl.toString(), {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // 应用响应映射
            const responseMapping = connector.responseMapping as Record<string, string> | null;
            const mappedData = responseMapping ? this.applyResponseMapping(data, responseMapping) : data;

            return {
                data: mappedData,
                metadata: {
                    httpStatus: response.status,
                    url: fullUrl.toString(),
                    method,
                    fetchedAt: new Date().toISOString(),
                },
            };
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * 内部数据库数据采集
     */
    private async fetchFromInternalDb(
        connector: Record<string, unknown>,
        config: Record<string, unknown>,
        _context: NodeExecutionContext,
    ): Promise<{ data: unknown; metadata: Record<string, unknown> }> {
        const queryTemplates = connector.queryTemplates as Record<string, unknown> | null;
        const tableName = queryTemplates?.tableName as string;

        if (!tableName) {
            throw new Error('INTERNAL_DB 连接器缺少 queryTemplates.tableName');
        }

        // 构建时间范围过滤
        const timeFilter = this.buildTimeFilter(config);
        const filters = config.filters as Record<string, unknown> | undefined;

        // 根据表名执行对应 Prisma 查询
        // WHY: 使用 $queryRawUnsafe 因为表名是动态的，但会进行安全校验
        const allowedTables = [
            'MarketIntel', 'MarketEvent', 'MarketInsight',
            'CollectionPoint', 'IntelTask',
        ];

        if (!allowedTables.includes(tableName)) {
            throw new Error(`不允许查询的表: ${tableName}`);
        }

        const whereConditions: string[] = [];
        const params: unknown[] = [];

        if (timeFilter.field && timeFilter.from) {
            whereConditions.push(`"${timeFilter.field}" >= $${params.length + 1}`);
            params.push(timeFilter.from);
        }
        if (timeFilter.field && timeFilter.to) {
            whereConditions.push(`"${timeFilter.field}" <= $${params.length + 1}`);
            params.push(timeFilter.to);
        }

        // 应用额外过滤条件
        if (filters) {
            for (const [field, value] of Object.entries(filters)) {
                if (value !== undefined && value !== null) {
                    whereConditions.push(`"${field}" = $${params.length + 1}`);
                    params.push(value);
                }
            }
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        const limit = (config.limit as number) ?? 100;
        const query = `SELECT * FROM "${tableName}" ${whereClause} ORDER BY "createdAt" DESC LIMIT ${limit}`;

        const data = await this.prisma.$queryRawUnsafe(query, ...params);

        return {
            data,
            metadata: {
                source: 'INTERNAL_DB',
                tableName,
                query: query.replace(/\$\d+/g, '?'), // 隐藏参数
                recordCount: Array.isArray(data) ? data.length : 0,
                fetchedAt: new Date().toISOString(),
            },
        };
    }

    /**
     * 文件导入数据采集（占位实现）
     */
    private async fetchFromFile(
        connector: Record<string, unknown>,
        _config: Record<string, unknown>,
    ): Promise<{ data: unknown; metadata: Record<string, unknown> }> {
        const endpointConfig = connector.endpointConfig as Record<string, unknown> | null;
        const filePath = endpointConfig?.filePath as string;

        return {
            data: [],
            metadata: {
                source: 'FILE_IMPORT',
                filePath: filePath ?? 'unknown',
                message: 'FILE_IMPORT 类型暂未完整实现，请使用 REST_API 或 INTERNAL_DB',
                fetchedAt: new Date().toISOString(),
            },
        };
    }

    /**
     * 构建查询参数（时间范围 + 自定义过滤）
     */
    private buildQueryParams(
        config: Record<string, unknown>,
        _context: NodeExecutionContext,
    ): Record<string, string> {
        const params: Record<string, string> = {};

        const timeFilter = this.buildTimeFilter(config);
        if (timeFilter.from) {
            params.startDate = timeFilter.from.toISOString();
        }
        if (timeFilter.to) {
            params.endDate = timeFilter.to.toISOString();
        }

        // 附加自定义过滤
        const filters = config.filters as Record<string, unknown> | undefined;
        if (filters) {
            for (const [key, value] of Object.entries(filters)) {
                if (value !== undefined && value !== null) {
                    params[key] = String(value);
                }
            }
        }

        return params;
    }

    /**
     * 构建时间过滤
     */
    private buildTimeFilter(
        config: Record<string, unknown>,
    ): { field?: string; from?: Date; to?: Date } {
        const timeRangeType = config.timeRangeType as string | undefined;
        const lookbackDays = (config.lookbackDays as number) ?? 7;
        const timeField = (config.timeField as string) ?? 'createdAt';

        const now = new Date();
        const to = now;
        let from: Date | undefined;

        switch (timeRangeType) {
            case 'LAST_N_DAYS':
                from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
                break;
            case 'TODAY':
                from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'THIS_WEEK': {
                const dayOfWeek = now.getDay();
                from = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
                from.setHours(0, 0, 0, 0);
                break;
            }
            case 'THIS_MONTH':
                from = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'ALL':
                return { field: timeField };
            default:
                from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
                break;
        }

        return { field: timeField, from, to };
    }

    /**
     * 应用响应映射
     */
    private applyResponseMapping(
        data: unknown,
        mapping: Record<string, string>,
    ): unknown {
        const dataPath = mapping.dataPath;
        if (!dataPath) {
            return data;
        }

        // 简单的点分路径解析 (e.g., "data.records")
        let result: unknown = data;
        for (const segment of dataPath.split('.')) {
            if (result && typeof result === 'object' && segment in result) {
                result = (result as Record<string, unknown>)[segment];
            } else {
                return data; // 路径不匹配，返回原始数据
            }
        }
        return result;
    }

    /**
     * 新鲜度检查
     */
    private checkFreshness(
        result: { data: unknown; metadata: Record<string, unknown> },
        config: Record<string, unknown>,
    ): { isFresh: boolean; message?: string } {
        const freshnessMaxMinutes = config.freshnessMaxMinutes as number | undefined;
        if (!freshnessMaxMinutes) {
            return { isFresh: true };
        }

        // 检查数据中最新记录的时间戳
        const records = Array.isArray(result.data) ? result.data : [result.data];
        if (records.length === 0) {
            return { isFresh: false, message: '无数据记录' };
        }

        const latestRecord = records[0] as Record<string, unknown> | undefined;
        const timestamp = latestRecord?.createdAt ?? latestRecord?.updatedAt;

        if (!timestamp) {
            return { isFresh: true, message: '无法判断数据时间戳，默认视为新鲜' };
        }

        const recordTime = new Date(String(timestamp)).getTime();
        const ageMinutes = (Date.now() - recordTime) / (1000 * 60);

        if (ageMinutes > freshnessMaxMinutes) {
            return {
                isFresh: false,
                message: `最新数据距今 ${Math.round(ageMinutes)} 分钟，超过阈值 ${freshnessMaxMinutes} 分钟`,
            };
        }

        return { isFresh: true };
    }

    /**
     * 兜底连接器重试
     */
    private async tryFallback(
        fallbackCode: string,
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Promise<NodeExecutionResult> {
        const fallbackConnector = await this.prisma.dataConnector.findFirst({
            where: { connectorCode: fallbackCode, isActive: true },
        });

        if (!fallbackConnector) {
            return {
                status: 'FAILED',
                output: {},
                message: `数据连接器不存在或已禁用: ${fallbackCode}（含兜底）`,
            };
        }

        this.logger.log(`使用兜底连接器: ${fallbackCode}`);

        try {
            const result = await this.fetchData(
                fallbackConnector as unknown as Record<string, unknown>,
                config,
                context,
            );

            return {
                status: 'SUCCESS',
                output: {
                    dataSourceCode: fallbackCode,
                    connectorType: fallbackConnector.connectorType,
                    category: fallbackConnector.category,
                    isFallback: true,
                    fetchedAt: new Date().toISOString(),
                    recordCount: Array.isArray(result.data) ? result.data.length : 1,
                    data: result.data,
                    metadata: result.metadata,
                },
                message: `数据采集成功（兜底连接器）: ${fallbackCode}`,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                status: 'FAILED',
                output: { error: errorMsg },
                message: `兜底连接器也失败: ${errorMsg}`,
            };
        }
    }
}

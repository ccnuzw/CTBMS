import { Injectable, Logger } from '@nestjs/common';
import type { WorkflowNode } from '@packages/types';
import { PrismaService } from '../../../../prisma';
import { ConfigService } from '../../../config/config.service';
import {
  MarketDataService,
  type ReconciliationGateEvaluationResult,
} from '../../../market-data/market-data.service';
import {
  validateConnectorContract,
  validateConnectorPayloadBySchema,
  validateConnectorSchemaDefinitions,
} from '../../../connector/connector-contract.util';
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

const STANDARD_DATASET_BY_TABLE: Record<string, 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT'> = {
  PriceData: 'SPOT_PRICE',
  FuturesQuoteSnapshot: 'FUTURES_QUOTE',
  MarketIntel: 'MARKET_EVENT',
  MarketEvent: 'MARKET_EVENT',
  MarketInsight: 'MARKET_EVENT',
  ResearchReport: 'MARKET_EVENT',
};

/**
 * 数据采集节点执行器
 *
 * 执行流程:
 * 1. 根据节点 config.dataSourceCode 查找 DataConnector
 * 2. 根据 connectorType 分发请求 (REST_API / EXCHANGE_API / GRAPHQL / WEBHOOK / INTERNAL_DB / FILE_IMPORT)
 * 3. 应用 timeRangeType + lookbackDays + filters 过滤
 * 4. 数据新鲜度检查 (freshnessMaxMinutes)
 * 5. 兜底 fallbackConnectorCode 容错
 * 6. 写入 NodeExecution.outputSnapshot
 */
@Injectable()
export class DataFetchNodeExecutor implements WorkflowNodeExecutor {
  readonly name = 'DataFetchNodeExecutor';
  private readonly logger = new Logger(DataFetchNodeExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketDataService: MarketDataService,
    private readonly configService: ConfigService,
  ) { }

  supports(node: WorkflowNode): boolean {
    // external-api-fetch 本质上也是通过外部 API 获取数据，复用 data-fetch 逻辑
    return node.type === 'data-fetch' || node.type === 'external-api-fetch';
  }

  async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
    const config = context.node.config as Record<string, unknown>;
    // Backward compatibility: early seeded templates used connectorCode on data-fetch nodes.
    const rawDataSourceCode =
      (config.dataSourceCode as string | undefined) ?? (config.connectorCode as string | undefined);

    if (!rawDataSourceCode) {
      return {
        status: 'FAILED',
        output: {},
        message: '节点配置缺少 dataSourceCode',
      };
    }

    const dataSourceCode = LEGACY_DATA_SOURCE_CODE_MAP[rawDataSourceCode] ?? rawDataSourceCode;

    if (dataSourceCode !== rawDataSourceCode) {
      this.logger.warn(`DataFetch 使用兼容映射: ${rawDataSourceCode} -> ${dataSourceCode}`);
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
        this.logger.warn(`DataConnector[${dataSourceCode}] 数据不新鲜: ${freshnessCheck.message}`);
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
        this.logger.log(`尝试兜底连接器: ${connector.fallbackConnectorCode}`);
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
    const contractValidation = validateConnectorContract(connector, {
      additionalRequiredFields: this.resolveRequiredContractFields(config),
    });
    if (!contractValidation.valid) {
      throw new Error(`连接器契约缺失字段: ${contractValidation.missingFields.join(', ')}`);
    }

    const schemaDefinitionValidation = validateConnectorSchemaDefinitions(connector);
    if (!schemaDefinitionValidation.valid) {
      throw new Error(`连接器 schema 声明非法: ${schemaDefinitionValidation.issues.join('; ')}`);
    }

    const connectorType = connector.connectorType as string;

    switch (connectorType) {
      case 'REST_API':
      case 'EXCHANGE_API':
      case 'GRAPHQL':
      case 'WEBHOOK':
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

    const requestPayloadValidation = validateConnectorPayloadBySchema(
      connector,
      'request',
      queryParams,
    );
    if (!requestPayloadValidation.valid) {
      throw new Error(`连接器请求参数不符合 schema: ${requestPayloadValidation.issues.join('; ')}`);
    }

    // 应用限流配置
    const rateLimitConfig = connector.rateLimitConfig as Record<string, unknown> | null;
    const timeoutSeconds = (rateLimitConfig?.timeoutSeconds as number) ?? 30000;

    const fullUrl = new URL(url);
    for (const [key, value] of Object.entries(queryParams)) {
      fullUrl.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds);

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

      const responsePayloadValidation = validateConnectorPayloadBySchema(
        connector,
        'response',
        mappedData,
      );
      if (!responsePayloadValidation.valid) {
        throw new Error(`连接器响应不符合 schema: ${responsePayloadValidation.issues.join('; ')}`);
      }

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

    const filters = config.filters as Record<string, unknown> | undefined;

    // FR-DATA-008: 标准层读取默认开启。仅当 useStandardizedRead 显式设为 false 时跳过。
    const explicitlyDisabled =
      this.parseBooleanFlag(config.useStandardizedRead) === false ||
      this.parseBooleanFlag(queryTemplates?.useStandardizedRead) === false;

    const standardDatasetRaw =
      (config.standardDataset as string | undefined) ??
      (queryTemplates?.standardDataset as string | undefined);

    const standardDataset =
      this.normalizeStandardDataset(standardDatasetRaw) ??
      STANDARD_DATASET_BY_TABLE[tableName ?? ''];

    let reconciliationGate: ReconciliationGateEvaluationResult | undefined;

    if (standardDataset && !explicitlyDisabled) {
      const standardizedReadEnabled = await this.isWorkflowStandardizedReadEnabled();
      if (standardizedReadEnabled) {
        const nodeMaxAgeMinutes = this.parsePositiveInteger(config.reconciliationMaxAgeMinutes);
        const gateResult = await this.marketDataService.reconciliationService.evaluateReconciliationGate(
          standardDataset,
          {
            filters,
            maxAgeMinutes: nodeMaxAgeMinutes ?? undefined,
          },
        );
        reconciliationGate = gateResult;
        if (gateResult.passed) {
          return this.fetchFromStandardReadModel(standardDataset, config, gateResult);
        }

        this.logger.warn(`标准化读门禁未通过，回退 legacy INTERNAL_DB: ${gateResult.reason}`);
      } else {
        this.logger.warn(
          '标准层全局开关关闭，回退到 legacy INTERNAL_DB 读取',
        );
      }
    } else if (explicitlyDisabled && standardDataset) {
      this.logger.debug(`data-fetch 节点显式禁用标准层读取: ${tableName}`);
    }

    // 构建时间范围过滤
    const timeFilter = this.buildTimeFilter(config);

    // 根据表名执行对应 Prisma 查询
    // WHY: 使用 $queryRawUnsafe 因为表名是动态的，但会进行安全校验
    const allowedTables = [
      'MarketIntel',
      'MarketEvent',
      'MarketInsight',
      'CollectionPoint',
      'IntelTask',
      'PriceData',
      'FuturesQuoteSnapshot',
      'ResearchReport',
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
          if (!this.isSafeSqlIdentifier(field)) {
            this.logger.warn(`忽略不安全过滤字段: ${field}`);
            continue;
          }

          if (Array.isArray(value)) {
            if (value.length > 0) {
              const placeholders = value.map((_, i) => `$${params.length + i + 1}`).join(', ');
              whereConditions.push(`"${field}" IN (${placeholders})`);
              params.push(...value);
            }
          } else {
            whereConditions.push(`"${field}" = $${params.length + 1}`);
            params.push(value);
          }
        }
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const rawLimit = Number(config.limit);
    const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? rawLimit : 100;
    const query = `SELECT * FROM "${tableName}" ${whereClause} ORDER BY "createdAt" DESC LIMIT ${limit}`;

    const data = await this.prisma.$queryRawUnsafe(query, ...params);

    const responsePayloadValidation = validateConnectorPayloadBySchema(connector, 'response', data);
    if (!responsePayloadValidation.valid) {
      throw new Error(`连接器响应不符合 schema: ${responsePayloadValidation.issues.join('; ')}`);
    }

    return {
      data,
      metadata: {
        source: 'INTERNAL_DB',
        tableName,
        query: query.replace(/\$\d+/g, '?'), // 隐藏参数
        recordCount: Array.isArray(data) ? data.length : 0,
        fetchedAt: new Date().toISOString(),
        ...(reconciliationGate ? { reconciliationGate } : {}),
      },
    };
  }

  private async fetchFromStandardReadModel(
    dataset: 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT',
    config: Record<string, unknown>,
    reconciliationGate?: ReconciliationGateEvaluationResult,
  ): Promise<{ data: unknown; metadata: Record<string, unknown> }> {
    const timeFilter = this.buildTimeFilter(config);
    const filters = (config.filters as Record<string, unknown> | undefined) ?? {};
    const rawLimit = Number(config.limit);
    const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? rawLimit : 100;

    const result = await this.marketDataService.queryStandardizedData(dataset, {
      from: timeFilter.from,
      to: timeFilter.to,
      filters,
      limit,
    });

    return {
      data: result.rows,
      metadata: {
        source: 'STANDARD_READ_MODEL',
        dataset,
        ...(reconciliationGate ? { reconciliationGate } : {}),
        ...result.meta,
      },
    };
  }

  private toBoolean(value: unknown): boolean {
    const parsed = this.parseBooleanFlag(value);
    return parsed ?? false;
  }

  private async isWorkflowStandardizedReadEnabled(): Promise<boolean> {
    try {
      const setting = await this.configService.getWorkflowStandardizedReadMode();
      return setting.enabled;
    } catch {
      const fallback = this.parseBooleanFlag(
        process.env.WORKFLOW_STANDARDIZED_READ_MODE ??
        process.env.WORKFLOW_STANDARDIZED_READ_ENABLED,
      );
      if (fallback !== null) {
        this.logger.warn('读取 standardized read mode 配置失败，回退到环境变量');
        return fallback;
      }
      // FR-DATA-008: 默认启用标准层读取
      return true;
    }
  }

  private parsePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (Number.isInteger(value) && value > 0) {
        return value;
      }
      return null;
    }

    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private parseBooleanFlag(value: unknown): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      return null;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return null;
      }
      if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
        return true;
      }
      if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
        return false;
      }
    }
    return null;
  }

  private normalizeStandardDataset(
    raw: string | undefined,
  ): 'SPOT_PRICE' | 'FUTURES_QUOTE' | 'MARKET_EVENT' | undefined {
    if (!raw) {
      return undefined;
    }
    const normalized = raw.trim().toUpperCase();
    if (normalized === 'SPOT_PRICE') {
      return 'SPOT_PRICE';
    }
    if (normalized === 'FUTURES_QUOTE') {
      return 'FUTURES_QUOTE';
    }
    if (normalized === 'MARKET_EVENT') {
      return 'MARKET_EVENT';
    }
    return undefined;
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
  private buildTimeFilter(config: Record<string, unknown>): {
    field?: string;
    from?: Date;
    to?: Date;
  } {
    const timeRangeType = config.timeRangeType as string | undefined;
    const lookbackDays = (config.lookbackDays as number) ?? 7;
    const requestedTimeField = (config.timeField as string | undefined) ?? 'createdAt';
    const timeField = this.isSafeSqlIdentifier(requestedTimeField)
      ? requestedTimeField
      : 'createdAt';

    if (timeField !== requestedTimeField) {
      this.logger.warn(`timeField 非法，已回退为 createdAt: ${requestedTimeField}`);
    }

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
  private applyResponseMapping(data: unknown, mapping: Record<string, string>): unknown {
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
    const timestamp =
      latestRecord?.createdAt ??
      latestRecord?.updatedAt ??
      latestRecord?.dataTime ??
      latestRecord?.publishedAt ??
      latestRecord?.snapshotAt ??
      latestRecord?.effectiveDate ??
      latestRecord?.eventDate ??
      latestRecord?.timestamp;

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

  private isSafeSqlIdentifier(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
  }

  private resolveRequiredContractFields(config: Record<string, unknown>): string[] {
    const raw = config.requiredContractFields;
    if (!Array.isArray(raw)) {
      return [];
    }
    const uniqueFields = new Set<string>();
    for (const item of raw) {
      if (typeof item !== 'string') {
        continue;
      }
      const normalized = item.trim();
      if (!normalized) {
        continue;
      }
      uniqueFields.add(normalized);
    }
    return [...uniqueFields];
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
        fallbackConnector as Record<string, unknown>,
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

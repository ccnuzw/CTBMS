import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { PrismaService } from '../../../../prisma';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

/**
 * 期货/交易所数据获取节点执行器
 *
 * 支持模式:
 * - useMockData=true (默认): 生成模拟 K 线数据，用于开发调试
 * - useMockData=false: 通过 DataConnector (EXCHANGE_API) 从交易所获取真实数据
 *
 * 配置字段:
 * - exchange: 交易所代码 (DCE, CZCE, SHFE, INE, CFFEX)
 * - symbol: 合约代码 (如 c2501, m2505)
 * - contractType: FUTURES | OPTION | SPOT
 * - dataType: KLINE | TICK | DEPTH | FUNDING_RATE
 * - interval: K 线周期 (1m, 5m, 15m, 1h, 4h, 1d, 1w)
 * - lookbackDays: 回看天数
 * - connectorCode: 关联的 DataConnector 编码 (真实模式必填)
 */
@Injectable()
export class FuturesDataFetchNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'FuturesDataFetchNodeExecutor';
    private readonly logger = new Logger(FuturesDataFetchNodeExecutor.name);

    constructor(private readonly prisma: PrismaService) { }

    supports(node: WorkflowNode): boolean {
        return node.type === 'futures-data-fetch';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = context.node.config as Record<string, unknown>;
        const exchange = (config.exchange as string) ?? 'DCE';
        const symbol = (config.symbol as string) ?? 'c2501';
        const contractType = (config.contractType as string) ?? 'FUTURES';
        const dataType = (config.dataType as string) ?? 'KLINE';
        const interval = (config.interval as string) ?? '1d';
        const lookbackDays = (config.lookbackDays as number) ?? 30;
        const useMockData = (config.useMockData as boolean) ?? true;
        const connectorCode = config.connectorCode as string | undefined;

        this.logger.log(
            `期货数据获取: ${exchange}/${symbol} ${dataType} ${interval} lookback=${lookbackDays}d mock=${useMockData}`,
        );

        try {
            if (useMockData || !connectorCode) {
                // Mock 模式：生成模拟数据
                const mockData = this.generateMockKlineData(exchange, symbol, interval, lookbackDays);

                return {
                    status: 'SUCCESS',
                    output: {
                        exchange,
                        symbol,
                        contractType,
                        dataType,
                        interval,
                        isMock: true,
                        fetchedAt: new Date().toISOString(),
                        recordCount: mockData.length,
                        data: mockData,
                        metadata: {
                            source: 'MOCK',
                            exchange,
                            symbol,
                            message: '当前使用模拟数据。接入真实交易所数据源后，请将 useMockData 设为 false 并配置 connectorCode。',
                        },
                    },
                    message: `期货模拟数据生成成功: ${exchange}/${symbol} ${mockData.length} 条 ${interval} K线`,
                };
            }

            // 真实模式：通过 DataConnector 获取数据
            const connector = await this.prisma.dataConnector.findFirst({
                where: { connectorCode, isActive: true },
            });

            if (!connector) {
                return {
                    status: 'FAILED',
                    output: { error: `DataConnector 不存在或已禁用: ${connectorCode}` },
                    message: `数据连接器不存在: ${connectorCode}`,
                };
            }

            const connectorType = (connector as Record<string, unknown>).connectorType as string;

            if (connectorType !== 'EXCHANGE_API' && connectorType !== 'REST_API') {
                return {
                    status: 'FAILED',
                    output: { error: `期货数据节点仅支持 EXCHANGE_API 或 REST_API 类型连接器，当前: ${connectorType}` },
                    message: `连接器类型不兼容: ${connectorType}`,
                };
            }

            // 构建交易所 API 请求
            const endpointConfig = (connector as Record<string, unknown>).endpointConfig as Record<string, unknown> | null;
            const baseUrl = endpointConfig?.url as string;

            if (!baseUrl) {
                return {
                    status: 'FAILED',
                    output: { error: '连接器缺少 endpointConfig.url' },
                    message: '交易所 API URL 未配置',
                };
            }

            const url = new URL(baseUrl);
            url.searchParams.set('exchange', exchange);
            url.searchParams.set('symbol', symbol);
            url.searchParams.set('contractType', contractType);
            url.searchParams.set('dataType', dataType);
            url.searchParams.set('interval', interval);
            url.searchParams.set('lookbackDays', String(lookbackDays));

            const headers = (endpointConfig?.headers as Record<string, string>) ?? {};
            const rateLimitConfig = (connector as Record<string, unknown>).rateLimitConfig as Record<string, unknown> | null;
            const timeoutMs = (rateLimitConfig?.timeoutMs as number) ?? 30000;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const responseData = await response.json();

                // 应用响应映射
                const responseMapping = (connector as Record<string, unknown>).responseMapping as Record<string, string> | null;
                const dataPath = responseMapping?.dataPath;
                let data = responseData;
                if (dataPath) {
                    for (const segment of dataPath.split('.')) {
                        if (data && typeof data === 'object' && segment in data) {
                            data = (data as Record<string, unknown>)[segment];
                        }
                    }
                }

                return {
                    status: 'SUCCESS',
                    output: {
                        exchange,
                        symbol,
                        contractType,
                        dataType,
                        interval,
                        isMock: false,
                        fetchedAt: new Date().toISOString(),
                        recordCount: Array.isArray(data) ? data.length : 1,
                        data,
                        metadata: {
                            source: 'EXCHANGE_API',
                            exchange,
                            symbol,
                            connectorCode,
                            httpStatus: response.status,
                            url: url.toString(),
                        },
                    },
                    message: `期货数据获取成功: ${exchange}/${symbol}`,
                };
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`期货数据获取失败: ${errorMsg}`);
            return {
                status: 'FAILED',
                output: { error: errorMsg },
                message: `期货数据获取失败: ${errorMsg}`,
            };
        }
    }

    /**
     * 生成模拟 K 线数据
     * WHY: 在无真实数据源的开发阶段，提供合理的模拟数据以支持工作流调试
     */
    private generateMockKlineData(
        exchange: string,
        symbol: string,
        interval: string,
        lookbackDays: number,
    ): Record<string, unknown>[] {
        const data: Record<string, unknown>[] = [];
        const now = Date.now();
        const intervalMs = this.getIntervalMs(interval);
        const totalBars = Math.min(
            Math.ceil((lookbackDays * 24 * 60 * 60 * 1000) / intervalMs),
            500,
        );

        // 基准价格（玉米期货约 2600 元/吨）
        const basePrice = this.getBasePrice(symbol);
        let currentPrice = basePrice;

        for (let i = totalBars - 1; i >= 0; i--) {
            const timestamp = now - i * intervalMs;
            const volatility = basePrice * 0.015; // 1.5% 波动率

            const open = currentPrice;
            const change = (Math.random() - 0.48) * volatility; // 略微偏多
            const high = open + Math.abs(change) + Math.random() * volatility * 0.5;
            const low = open - Math.abs(change) - Math.random() * volatility * 0.5;
            const close = open + change;
            const volume = Math.round(50000 + Math.random() * 100000);
            const openInterest = Math.round(200000 + Math.random() * 50000);

            currentPrice = close;

            data.push({
                exchange,
                symbol,
                timestamp: new Date(timestamp).toISOString(),
                open: Number(open.toFixed(1)),
                high: Number(high.toFixed(1)),
                low: Number(low.toFixed(1)),
                close: Number(close.toFixed(1)),
                volume,
                openInterest,
                turnover: Number((close * volume).toFixed(0)),
                interval,
            });
        }

        return data;
    }

    private getIntervalMs(interval: string): number {
        const map: Record<string, number> = {
            '1m': 60_000,
            '5m': 300_000,
            '15m': 900_000,
            '30m': 1_800_000,
            '1h': 3_600_000,
            '4h': 14_400_000,
            '1d': 86_400_000,
            '1w': 604_800_000,
        };
        return map[interval] ?? 86_400_000;
    }

    /**
     * 根据合约代码推算基准价格
     * WHY: 不同品种价格差异大(玉米~2600, 豆粕~3200, 螺纹~3800)
     */
    private getBasePrice(symbol: string): number {
        const prefix = symbol.replace(/\d+/g, '').toLowerCase();
        const priceMap: Record<string, number> = {
            c: 2600,    // 玉米
            cs: 2800,   // 玉米淀粉
            m: 3200,    // 豆粕
            y: 8200,    // 豆油
            p: 7600,    // 棕榈油
            a: 4800,    // 豆一
            b: 3600,    // 豆二
            jd: 4200,   // 鸡蛋
            rb: 3800,   // 螺纹钢
            i: 900,     // 铁矿石
            cu: 68000,  // 铜
            al: 19000,  // 铝
            au: 480,    // 黄金
            ag: 6200,   // 白银
            sr: 6500,   // 白糖
            cf: 15000,  // 棉花
        };
        return priceMap[prefix] ?? 3000;
    }
}

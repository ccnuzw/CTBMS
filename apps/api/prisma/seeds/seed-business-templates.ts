/**
 * 核心业务模板种子数据 — PRD §5.2
 *
 * 4 个 Quickstart 业务模板的 Workflow DSL 定义：
 * 1. WEEKLY_MARKET_REVIEW — 周度市场复盘
 * 2. PRICE_ALERT_MONITORING — 价格异动预警
 * 3. WEATHER_LOGISTICS_IMPACT — 天气与物流影响评估
 * 4. STRATEGY_BACKTEST — 策略回测与解释
 *
 * 用法: npx ts-node apps/api/prisma/seeds/seed-business-templates.ts
 */
import { Prisma, PrismaClient, WorkflowMode, WorkflowUsageMethod } from '@prisma/client';

const prisma = new PrismaClient();

// ─────────── Helper: 生成唯一 nodeId ───────────
let counter = 0;
const nid = (prefix: string) => `${prefix}-${++counter}`;

/**
 * 周度市场复盘 DSL
 */
interface WorkflowDslNode {
    id: string;
    type: string;
    config: Record<string, unknown>;
    position: {
        x: number;
        y: number;
    };
}

interface WorkflowDslEdge {
    source: string;
    target: string;
    sourceHandle?: string;
}

interface WorkflowDslSnapshot {
    mode: WorkflowMode;
    usageMethod: WorkflowUsageMethod;
    nodes: WorkflowDslNode[];
    edges: WorkflowDslEdge[];
}

function weeklyMarketReviewDsl(): WorkflowDslSnapshot {
    const trigger = nid('cron-trigger');
    const fetchSpot = nid('data-fetch');
    const fetchFutures = nid('futures-data-fetch');
    const fetchReport = nid('report-fetch');
    const parallel = nid('parallel-split');
    const join1 = nid('join');
    const context = nid('context-builder');
    const analyst = nid('agent-call');
    const reporter = nid('agent-call');
    const report = nid('report-generate');
    const notify1 = nid('notify');

    return {
        mode: 'LINEAR' as WorkflowMode,
        usageMethod: 'HEADLESS' as WorkflowUsageMethod,
        nodes: [
            { id: trigger, type: 'cron-trigger', config: { cronExpression: '0 9 * * 1' }, position: { x: 0, y: 200 } },
            { id: parallel, type: 'parallel-split', config: {}, position: { x: 200, y: 200 } },
            { id: fetchSpot, type: 'data-fetch', config: { dataSourceCode: 'SPOT_PRICE', timeRangeType: 'LAST_N_DAYS', lookbackDays: 7 }, position: { x: 400, y: 100 } },
            { id: fetchFutures, type: 'futures-data-fetch', config: { exchange: 'DCE', symbol: 'c2501', dataType: 'KLINE', interval: '1d', lookbackDays: 7, useMockData: true }, position: { x: 400, y: 200 } },
            { id: fetchReport, type: 'report-fetch', config: { category: 'daily', limit: 5 }, position: { x: 400, y: 300 } },
            { id: join1, type: 'join', config: { joinMode: 'ALL' }, position: { x: 600, y: 200 } },
            { id: context, type: 'context-builder', config: { sources: ['spotData', 'futuresData', 'reports'], format: 'markdown', maxTokens: 4000 }, position: { x: 800, y: 200 } },
            { id: analyst, type: 'agent-call', config: { agentCode: 'MARKET_ANALYST' }, position: { x: 1000, y: 200 } },
            { id: reporter, type: 'agent-call', config: { agentCode: 'REPORT_WRITER' }, position: { x: 1200, y: 200 } },
            { id: report, type: 'report-generate', config: { format: 'MARKDOWN', titleTemplate: '{{year}}-W{{week}} 市场周报' }, position: { x: 1400, y: 200 } },
            { id: notify1, type: 'notify', config: { channel: 'EMAIL', messageTemplateCode: 'WEEKLY_REVIEW' }, position: { x: 1600, y: 200 } },
        ],
        edges: [
            { source: trigger, target: parallel },
            { source: parallel, target: fetchSpot },
            { source: parallel, target: fetchFutures },
            { source: parallel, target: fetchReport },
            { source: fetchSpot, target: join1 },
            { source: fetchFutures, target: join1 },
            { source: fetchReport, target: join1 },
            { source: join1, target: context },
            { source: context, target: analyst },
            { source: analyst, target: reporter },
            { source: reporter, target: report },
            { source: report, target: notify1 },
        ],
    };
}

/**
 * 价格异动预警 DSL
 */
function priceAlertDsl(): WorkflowDslSnapshot {
    const trigger = nid('cron-trigger');
    const fetchPrice = nid('data-fetch');
    const featureCalc = nid('feature-calc');
    const alertCheck = nid('alert-check');
    const ifElse = nid('if-else');
    const evidenceAgent = nid('agent-call');
    const riskGate = nid('risk-gate');
    const notify1 = nid('notify');

    return {
        mode: 'LINEAR' as WorkflowMode,
        usageMethod: 'HEADLESS' as WorkflowUsageMethod,
        nodes: [
            { id: trigger, type: 'cron-trigger', config: { cronExpression: '*/30 * * * 1-5' }, position: { x: 0, y: 200 } },
            { id: fetchPrice, type: 'data-fetch', config: { dataSourceCode: 'SPOT_PRICE', timeRangeType: 'LAST_N_DAYS', lookbackDays: 3 }, position: { x: 200, y: 200 } },
            { id: featureCalc, type: 'feature-calc', config: { featureType: 'change_rate', dataKey: 'data' }, position: { x: 400, y: 200 } },
            { id: alertCheck, type: 'alert-check', config: { alertType: 'PRICE_SPIKE', threshold: 3.0, operator: 'GT' }, position: { x: 600, y: 200 } },
            { id: ifElse, type: 'if-else', config: { condition: { field: 'alertTriggered', operator: 'EQ', value: true } }, position: { x: 800, y: 200 } },
            { id: evidenceAgent, type: 'agent-call', config: { agentCode: 'EVIDENCE_ANALYST' }, position: { x: 1000, y: 100 } },
            { id: riskGate, type: 'risk-gate', config: { riskProfileCode: 'PRICE_ANOMALY', action: 'ALERT' }, position: { x: 1200, y: 100 } },
            { id: notify1, type: 'notify', config: { channels: ['EMAIL', 'WEBHOOK'], messageTemplateCode: 'PRICE_ALERT' }, position: { x: 1400, y: 100 } },
        ],
        edges: [
            { source: trigger, target: fetchPrice },
            { source: fetchPrice, target: featureCalc },
            { source: featureCalc, target: alertCheck },
            { source: alertCheck, target: ifElse },
            { source: ifElse, target: evidenceAgent, sourceHandle: 'true' },
            { source: evidenceAgent, target: riskGate },
            { source: riskGate, target: notify1 },
        ],
    };
}

/**
 * 天气与物流影响评估 DSL
 */
function weatherLogisticsDsl(): WorkflowDslSnapshot {
    const trigger = nid('cron-trigger');
    const parallel = nid('parallel-split');
    const fetchWeather = nid('external-api-fetch');
    const fetchLogistics = nid('external-api-fetch');
    const fetchInventory = nid('data-fetch');
    const join1 = nid('join');
    const context = nid('context-builder');
    const debateRound = nid('debate-round');
    const judgeAgent = nid('judge-agent');
    const riskGate = nid('risk-gate');
    const report = nid('report-generate');
    const dashPub = nid('dashboard-publish');

    return {
        mode: 'LINEAR' as WorkflowMode,
        usageMethod: 'HEADLESS' as WorkflowUsageMethod,
        nodes: [
            { id: trigger, type: 'cron-trigger', config: { cronExpression: '0 8 * * *' }, position: { x: 0, y: 200 } },
            { id: parallel, type: 'parallel-split', config: {}, position: { x: 200, y: 200 } },
            { id: fetchWeather, type: 'external-api-fetch', config: { url: '${WEATHER_API_URL}', method: 'GET' }, position: { x: 400, y: 100 } },
            { id: fetchLogistics, type: 'external-api-fetch', config: { url: '${LOGISTICS_API_URL}', method: 'GET' }, position: { x: 400, y: 200 } },
            { id: fetchInventory, type: 'data-fetch', config: { dataSourceCode: 'INVENTORY', timeRangeType: 'LAST_N_DAYS', lookbackDays: 14 }, position: { x: 400, y: 300 } },
            { id: join1, type: 'join', config: { joinMode: 'ALL' }, position: { x: 600, y: 200 } },
            { id: context, type: 'context-builder', config: { sources: ['weather', 'logistics', 'inventory'], format: 'structured' }, position: { x: 800, y: 200 } },
            { id: debateRound, type: 'debate-round', config: { participants: [{ agentCode: 'SUPPLY_OPTIMIST', role: 'bull', weight: 1 }, { agentCode: 'SUPPLY_PESSIMIST', role: 'bear', weight: 1 }], maxRounds: 2, judgePolicy: 'WEIGHTED' }, position: { x: 1000, y: 200 } },
            { id: judgeAgent, type: 'judge-agent', config: { agentCode: 'JUDGE_V1' }, position: { x: 1200, y: 200 } },
            { id: riskGate, type: 'risk-gate', config: { riskProfileCode: 'SUPPLY_DISRUPTION', scoreThreshold: 70 }, position: { x: 1400, y: 200 } },
            { id: report, type: 'report-generate', config: { format: 'MARKDOWN', titleTemplate: '天气物流影响评估 {{date}}' }, position: { x: 1600, y: 200 } },
            { id: dashPub, type: 'dashboard-publish', config: { dashboardId: 'weather-logistics', datasetName: 'impact_scorecard' }, position: { x: 1800, y: 200 } },
        ],
        edges: [
            { source: trigger, target: parallel },
            { source: parallel, target: fetchWeather },
            { source: parallel, target: fetchLogistics },
            { source: parallel, target: fetchInventory },
            { source: fetchWeather, target: join1 },
            { source: fetchLogistics, target: join1 },
            { source: fetchInventory, target: join1 },
            { source: join1, target: context },
            { source: context, target: debateRound },
            { source: debateRound, target: judgeAgent },
            { source: judgeAgent, target: riskGate },
            { source: riskGate, target: report },
            { source: report, target: dashPub },
        ],
    };
}

/**
 * 策略回测与解释 DSL
 */
function strategyBacktestDsl(): WorkflowDslSnapshot {
    const trigger = nid('manual-trigger');
    const fetchHistorical = nid('data-fetch');
    const fetchFutures = nid('futures-data-fetch');
    const parallel = nid('parallel-split');
    const join1 = nid('join');
    const formulaCalc = nid('formula-calc');
    const quantileCalc = nid('quantile-calc');
    const context = nid('context-builder');
    const backtestAgent = nid('agent-call');
    const explanationAgent = nid('agent-call');
    const report = nid('report-generate');

    return {
        mode: 'LINEAR' as WorkflowMode,
        usageMethod: 'HEADLESS' as WorkflowUsageMethod,
        nodes: [
            { id: trigger, type: 'manual-trigger', config: {}, position: { x: 0, y: 200 } },
            { id: parallel, type: 'parallel-split', config: {}, position: { x: 200, y: 200 } },
            { id: fetchHistorical, type: 'data-fetch', config: { dataSourceCode: 'SPOT_PRICE', timeRangeType: 'LAST_N_DAYS', lookbackDays: 180 }, position: { x: 400, y: 100 } },
            { id: fetchFutures, type: 'futures-data-fetch', config: { exchange: 'DCE', dataType: 'KLINE', interval: '1d', lookbackDays: 180, useMockData: true }, position: { x: 400, y: 300 } },
            { id: join1, type: 'join', config: { joinMode: 'ALL' }, position: { x: 600, y: 200 } },
            { id: formulaCalc, type: 'formula-calc', config: { expression: 'pnl = sum(trades.map(t => t.exitPrice - t.entryPrice))', precision: 2, roundingMode: 'HALF_UP', nullPolicy: 'SKIP' }, position: { x: 800, y: 200 } },
            { id: quantileCalc, type: 'quantile-calc', config: { quantileType: 'percentile', percentiles: [5, 25, 50, 75, 95] }, position: { x: 1000, y: 200 } },
            { id: context, type: 'context-builder', config: { sources: ['historicalData', 'futuresData', 'pnl', 'quantiles'], format: 'structured' }, position: { x: 1200, y: 200 } },
            { id: backtestAgent, type: 'agent-call', config: { agentCode: 'BACKTEST_ANALYST' }, position: { x: 1400, y: 200 } },
            { id: explanationAgent, type: 'agent-call', config: { agentCode: 'STRATEGY_EXPLAINER' }, position: { x: 1600, y: 200 } },
            { id: report, type: 'report-generate', config: { format: 'PDF', titleTemplate: '策略回测报告 {{strategyName}}' }, position: { x: 1800, y: 200 } },
        ],
        edges: [
            { source: trigger, target: parallel },
            { source: parallel, target: fetchHistorical },
            { source: parallel, target: fetchFutures },
            { source: fetchHistorical, target: join1 },
            { source: fetchFutures, target: join1 },
            { source: join1, target: formulaCalc },
            { source: formulaCalc, target: quantileCalc },
            { source: quantileCalc, target: context },
            { source: context, target: backtestAgent },
            { source: backtestAgent, target: explanationAgent },
            { source: explanationAgent, target: report },
        ],
    };
}

// ─────────── SEED RUNNER ───────────

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

interface TemplateDefinition {
    templateCode: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    dsl: WorkflowDslSnapshot;
}

const TEMPLATES: TemplateDefinition[] = [
    {
        templateCode: 'WEEKLY_MARKET_REVIEW',
        name: '周度市场复盘',
        description: '自动聚合现货、期货和市场事件，输出周度价格走势、基差变化和关键驱动因素复盘。',
        category: 'REPORTING',
        tags: ['weekly', 'report', 'spot', 'futures'],
        dsl: weeklyMarketReviewDsl(),
    },
    {
        templateCode: 'PRICE_ALERT_MONITORING',
        name: '价格异动预警',
        description: '按品类和区域监控价格与波动阈值，触发告警并附带证据链和建议动作。',
        category: 'MONITORING',
        tags: ['alert', 'monitoring', 'price'],
        dsl: priceAlertDsl(),
    },
    {
        templateCode: 'WEATHER_LOGISTICS_IMPACT',
        name: '天气与物流影响评估',
        description: '融合天气、运费与库存变化，评估未来供需冲击并形成风险等级。',
        category: 'ANALYSIS',
        tags: ['weather', 'logistics', 'supply-risk'],
        dsl: weatherLogisticsDsl(),
    },
    {
        templateCode: 'STRATEGY_BACKTEST',
        name: '策略回测与解释',
        description: '对采购/套保策略做历史回测，输出收益、回撤与关键场景解释。',
        category: 'RISK_MANAGEMENT',
        tags: ['backtest', 'strategy', 'hedging'],
        dsl: strategyBacktestDsl(),
    },
];

async function main() {
    console.log('🌱 开始种子化核心业务模板...\n');

    for (const tpl of TEMPLATES) {
        const dslSnapshot = tpl.dsl as unknown as Prisma.InputJsonValue;
        const existingTpl = await prisma.templateCatalog.findFirst({
            where: { templateCode: tpl.templateCode },
        });

        if (existingTpl) {
            console.log(`  ⏭️  模板 ${tpl.templateCode} 已存在，跳过`);
            continue;
        }

        // 1. 创建 WorkflowDefinition
        const definition = await prisma.workflowDefinition.create({
            data: {
                workflowId: `tpl-${tpl.templateCode.toLowerCase().replace(/_/g, '-')}`,
                name: `[模板] ${tpl.name}`,
                description: tpl.description,
                ownerUserId: SYSTEM_USER_ID,
                templateSource: 'PUBLIC',
                mode: tpl.dsl.mode,
                usageMethod: tpl.dsl.usageMethod,
            },
        });

        // 2. 创建 WorkflowVersion
        const version = await prisma.workflowVersion.create({
            data: {
                workflowDefinitionId: definition.id,
                versionCode: 'v1.0.0',
                dslSnapshot: dslSnapshot,
                status: 'PUBLISHED',
                createdByUserId: SYSTEM_USER_ID,
            },
        });

        // 3. 创建 TemplateCatalog
        await prisma.templateCatalog.create({
            data: {
                templateCode: tpl.templateCode,
                name: tpl.name,
                description: tpl.description,
                category: tpl.category,
                tags: tpl.tags,
                dslSnapshot: dslSnapshot,
                nodeCount: tpl.dsl.nodes.length,
                edgeCount: tpl.dsl.edges.length,
                authorUserId: SYSTEM_USER_ID,
                authorName: 'System',
                isOfficial: true,
                status: 'PUBLISHED',
            },
        });

        console.log(
            `  ✅ ${tpl.templateCode} — ${tpl.dsl.nodes.length} 节点, ${tpl.dsl.edges.length} 条边 (def: ${definition.id}, ver: ${version.id})`,
        );
    }

    console.log('\n🎉 核心业务模板种子化完成！');
}

main()
    .catch((err) => {
        console.error('种子脚本失败:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

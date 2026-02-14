import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_USER_ID = 'b0000000-0000-0000-0000-000000000001';

function toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// ─────────────────────────────────────────────────────────
// 模板 1: 套利猎手 (Arbitrage Hunter)
// 模式: DAG
// 流程: 双数据源 → 价差计算 → 套利信号Agent → 风控Agent → 输出通知
// ─────────────────────────────────────────────────────────

const ARB_HUNTER_DSL = {
    workflowId: 'tpl_arb_hunter_v1',
    name: '套利猎手',
    mode: 'DAG',
    usageMethod: 'HEADLESS',
    version: '1.0.0',
    status: 'ACTIVE',
    nodes: [
        {
            id: 'trigger',
            type: 'cron-trigger',
            name: '定时触发(每5分钟)',
            enabled: true,
            config: { cronExpression: '*/5 * * * *' },
        },
        {
            id: 'fetch-spot',
            type: 'futures-data-fetch',
            name: '获取现货价格',
            enabled: true,
            config: {
                exchange: 'DCE',
                symbol: 'c2501',
                contractType: 'SPOT',
                dataType: 'KLINE',
                interval: '1h',
                lookbackDays: 3,
                useMockData: true,
            },
        },
        {
            id: 'fetch-futures',
            type: 'futures-data-fetch',
            name: '获取期货价格',
            enabled: true,
            config: {
                exchange: 'DCE',
                symbol: 'c2505',
                contractType: 'FUTURES',
                dataType: 'KLINE',
                interval: '1h',
                lookbackDays: 3,
                useMockData: true,
            },
        },
        {
            id: 'spread-calc',
            type: 'formula-calc',
            name: '价差计算',
            enabled: true,
            config: {
                expression: 'futures_close - spot_close',
                description: '期现价差 = 期货收盘价 - 现货收盘价',
                outputKey: 'spread',
            },
            inputBindings: {
                futures_close: '${fetch-futures.output.data[-1].close}',
                spot_close: '${fetch-spot.output.data[-1].close}',
            },
        },
        {
            id: 'arb-signal-agent',
            type: 'agent-call',
            name: '套利信号分析Agent',
            enabled: true,
            config: {
                agentProfileCode: 'arb_signal_analyst',
                systemPrompt:
                    '你是一位专业的套利分析师。根据期现价差数据，分析是否存在套利机会。\n' +
                    '输出格式: { "signal": "BUY_SPREAD" | "SELL_SPREAD" | "NO_SIGNAL", "confidence": 0-1, "reason": "..." }',
            },
        },
        {
            id: 'risk-gate',
            type: 'risk-gate',
            name: '风控校验',
            enabled: true,
            config: {
                maxRiskLevel: 'MEDIUM',
                checkItems: ['position_limit', 'margin_ratio'],
            },
        },
        {
            id: 'notify-output',
            type: 'notify',
            name: '发送套利信号通知',
            enabled: true,
            config: {
                channels: ['WEBHOOK'],
                template: '套利信号: {{arb-signal-agent.output.signal}} | 置信度: {{arb-signal-agent.output.confidence}} | 原因: {{arb-signal-agent.output.reason}}',
            },
        },
    ],
    edges: [
        { id: 'e1', from: 'trigger', to: 'fetch-spot', edgeType: 'control-edge' },
        { id: 'e2', from: 'trigger', to: 'fetch-futures', edgeType: 'control-edge' },
        { id: 'e3', from: 'fetch-spot', to: 'spread-calc', edgeType: 'data-edge' },
        { id: 'e4', from: 'fetch-futures', to: 'spread-calc', edgeType: 'data-edge' },
        { id: 'e5', from: 'spread-calc', to: 'arb-signal-agent', edgeType: 'data-edge' },
        { id: 'e6', from: 'arb-signal-agent', to: 'risk-gate', edgeType: 'data-edge' },
        { id: 'e7', from: 'risk-gate', to: 'notify-output', edgeType: 'control-edge' },
    ],
};

// ─────────────────────────────────────────────────────────
// 模板 2: 舆情分析师 (Sentiment Analyst)
// 模式: DEBATE
// 流程: 情报采集 → 多角度辩论(看多/看空/中性) → 裁判综合 → 报告生成
// ─────────────────────────────────────────────────────────

const SENTIMENT_ANALYST_DSL = {
    workflowId: 'tpl_sentiment_analyst_v1',
    name: '舆情分析师',
    mode: 'DEBATE',
    usageMethod: 'ON_DEMAND',
    version: '1.0.0',
    status: 'ACTIVE',
    nodes: [
        {
            id: 'trigger',
            type: 'manual-trigger',
            name: '手动触发',
            enabled: true,
            config: {},
        },
        {
            id: 'intel-fetch',
            type: 'data-fetch',
            name: '采集市场情报',
            enabled: true,
            config: {
                dataSourceCode: 'market_intel_db',
                timeRangeType: 'LAST_N_DAYS',
                lookbackDays: 7,
                filters: { status: 'APPROVED' },
            },
        },
        {
            id: 'context-build',
            type: 'context-builder',
            name: '构建分析上下文',
            enabled: true,
            config: {
                contextTemplate: '以下是最近一周的玉米市场情报摘要:\n{{intel-fetch.output.data}}',
            },
        },
        {
            id: 'debate-round-1',
            type: 'debate-round',
            name: '第一轮辩论: 多空博弈',
            enabled: true,
            config: {
                roundNumber: 1,
                maxRounds: 3,
                participants: [
                    { code: 'bull_analyst', role: 'DEBATER', agentProfileCode: 'sentiment_bull', stance: '看多' },
                    { code: 'bear_analyst', role: 'DEBATER', agentProfileCode: 'sentiment_bear', stance: '看空' },
                    { code: 'neutral_analyst', role: 'DEBATER', agentProfileCode: 'sentiment_neutral', stance: '中性' },
                ],
                convergenceThreshold: 0.8,
            },
        },
        {
            id: 'judge',
            type: 'judge-agent',
            name: '裁判综合研判',
            enabled: true,
            config: {
                agentProfileCode: 'sentiment_judge',
                verdictFormat: '{ "direction": "BULLISH" | "BEARISH" | "NEUTRAL", "confidence": 0-1, "summary": "...", "keyFactors": [...] }',
            },
        },
        {
            id: 'report-gen',
            type: 'report-generate',
            name: '生成舆情分析报告',
            enabled: true,
            config: {
                reportType: 'SENTIMENT_ANALYSIS',
                title: '玉米市场舆情多空辩论分析报告',
                includeDebateTimeline: true,
            },
        },
    ],
    edges: [
        { id: 'e1', from: 'trigger', to: 'intel-fetch', edgeType: 'control-edge' },
        { id: 'e2', from: 'intel-fetch', to: 'context-build', edgeType: 'data-edge' },
        { id: 'e3', from: 'context-build', to: 'debate-round-1', edgeType: 'data-edge' },
        { id: 'e4', from: 'debate-round-1', to: 'judge', edgeType: 'data-edge' },
        { id: 'e5', from: 'judge', to: 'report-gen', edgeType: 'data-edge' },
    ],
};

// ─────────────────────────────────────────────────────────
// 模板 3: 库存优化军师 (Inventory Optimizer)
// 模式: LINEAR
// 流程: 数据采集 → 特征计算 → 预测Agent → 优化Agent → 风控 → 建议输出
// ─────────────────────────────────────────────────────────

const INVENTORY_OPTIMIZER_DSL = {
    workflowId: 'tpl_inventory_optimizer_v1',
    name: '库存优化军师',
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'ACTIVE',
    nodes: [
        {
            id: 'trigger',
            type: 'manual-trigger',
            name: '手动触发/API触发',
            enabled: true,
            config: {},
        },
        {
            id: 'inventory-fetch',
            type: 'data-fetch',
            name: '采集库存数据',
            enabled: true,
            config: {
                dataSourceCode: 'inventory_db',
                timeRangeType: 'LAST_N_DAYS',
                lookbackDays: 90,
            },
        },
        {
            id: 'price-fetch',
            type: 'futures-data-fetch',
            name: '采集价格数据',
            enabled: true,
            config: {
                exchange: 'DCE',
                symbol: 'c2505',
                contractType: 'FUTURES',
                dataType: 'KLINE',
                interval: '1d',
                lookbackDays: 90,
                useMockData: true,
            },
        },
        {
            id: 'feature-calc',
            type: 'feature-calc',
            name: '特征工程',
            enabled: true,
            config: {
                features: ['inventory_turnover_days', 'price_ma20_ratio', 'seasonal_factor', 'basis_rate'],
                description: '计算库存周转天数、价格与20日均线比值、季节性因子、基差率',
            },
        },
        {
            id: 'forecast-agent',
            type: 'agent-call',
            name: '需求预测Agent',
            enabled: true,
            config: {
                agentProfileCode: 'demand_forecaster',
                systemPrompt:
                    '你是一位经验丰富的玉米贸易需求预测分析师。\n' +
                    '根据历史库存数据、价格走势和特征因子，预测未来30天的需求走势。\n' +
                    '输出: { "forecast": "INCREASE" | "STABLE" | "DECREASE", "magnitude": 0-1, "reason": "..." }',
            },
        },
        {
            id: 'optimize-agent',
            type: 'agent-call',
            name: '库存优化Agent',
            enabled: true,
            config: {
                agentProfileCode: 'inventory_optimizer',
                systemPrompt:
                    '你是资深的库存管理优化师。根据需求预测结果和当前库存水平，给出补货/减仓建议。\n' +
                    '重点考虑: 资金成本、仓储成本、到货周期、季节性需求变化。\n' +
                    '输出: { "action": "BUILD" | "HOLD" | "REDUCE", "targetDays": number, "urgency": "HIGH" | "MEDIUM" | "LOW", "details": "..." }',
            },
        },
        {
            id: 'risk-check',
            type: 'risk-gate',
            name: '风控审核',
            enabled: true,
            config: {
                maxRiskLevel: 'HIGH',
                checkItems: ['capital_utilization', 'storage_capacity'],
            },
        },
        {
            id: 'output-notify',
            type: 'notify',
            name: '输出建议报告',
            enabled: true,
            config: {
                channels: ['WEBHOOK', 'EMAIL'],
                template: '库存优化建议: {{optimize-agent.output.action}} | 目标天数: {{optimize-agent.output.targetDays}} | 紧急度: {{optimize-agent.output.urgency}}',
            },
        },
    ],
    edges: [
        { id: 'e1', from: 'trigger', to: 'inventory-fetch', edgeType: 'control-edge' },
        { id: 'e2', from: 'inventory-fetch', to: 'price-fetch', edgeType: 'control-edge' },
        { id: 'e3', from: 'price-fetch', to: 'feature-calc', edgeType: 'data-edge' },
        { id: 'e4', from: 'feature-calc', to: 'forecast-agent', edgeType: 'data-edge' },
        { id: 'e5', from: 'forecast-agent', to: 'optimize-agent', edgeType: 'data-edge' },
        { id: 'e6', from: 'optimize-agent', to: 'risk-check', edgeType: 'data-edge' },
        { id: 'e7', from: 'risk-check', to: 'output-notify', edgeType: 'control-edge' },
    ],
};

// ─────────────────────────────────────────────────────────
// Seed 函数
// ─────────────────────────────────────────────────────────

const SCENARIO_TEMPLATES = [
    {
        templateCode: 'TPL_ARB_HUNTER_V1',
        name: '套利猎手',
        description:
            '期现套利自动化模板。通过并行获取现货和期货数据，计算价差，由AI分析套利信号，经风控审核后输出交易建议。适用于基差交易策略。',
        category: 'TRADING' as const,
        tags: ['套利', '期现价差', 'DAG', '自动化', '期货数据'],
        dsl: ARB_HUNTER_DSL,
    },
    {
        templateCode: 'TPL_SENTIMENT_ANALYST_V1',
        name: '舆情分析师',
        description:
            '多角色辩论式舆情分析模板。采集市场情报后，看多、看空、中性三方Agent进行多轮辩论，由裁判综合研判，生成舆情分析报告。适用于重大行情研判。',
        category: 'ANALYSIS' as const,
        tags: ['舆情', '辩论', 'DEBATE', '多Agent', '情报分析'],
        dsl: SENTIMENT_ANALYST_DSL,
    },
    {
        templateCode: 'TPL_INVENTORY_OPTIMIZER_V1',
        name: '库存优化军师',
        description:
            '智能库存管理模板。采集历史库存和价格数据，进行特征工程，由需求预测Agent和库存优化Agent协同分析，给出补建/持有/减仓建议。适用于现货贸易商。',
        category: 'TRADING' as const,
        tags: ['库存', '优化', 'LINEAR', '需求预测', '风控'],
        dsl: INVENTORY_OPTIMIZER_DSL,
    },
];

async function seedScenarioTemplates() {
    console.log('🌱 开始播种场景模板数据...');

    for (const template of SCENARIO_TEMPLATES) {
        const nodes = template.dsl.nodes;
        const edges = template.dsl.edges;

        await prisma.templateCatalog.upsert({
            where: { templateCode: template.templateCode },
            update: {
                name: template.name,
                description: template.description,
                category: template.category,
                status: 'PUBLISHED',
                tags: toJsonValue(template.tags),
                dslSnapshot: toJsonValue(template.dsl),
                nodeCount: nodes.length,
                edgeCount: edges.length,
                authorUserId: DEFAULT_ADMIN_USER_ID,
                authorName: '系统管理员',
                isOfficial: true,
            },
            create: {
                templateCode: template.templateCode,
                name: template.name,
                description: template.description,
                category: template.category,
                status: 'PUBLISHED',
                tags: toJsonValue(template.tags),
                dslSnapshot: toJsonValue(template.dsl),
                nodeCount: nodes.length,
                edgeCount: edges.length,
                usageCount: 0,
                authorUserId: DEFAULT_ADMIN_USER_ID,
                authorName: '系统管理员',
                isOfficial: true,
            },
        });

        console.log(`  ✅ ${template.name} (${template.templateCode})`);
    }

    console.log(`✅ 场景模板播种完成，共 ${SCENARIO_TEMPLATES.length} 条`);
}

seedScenarioTemplates()
    .catch((error) => {
        console.error('❌ 场景模板播种失败', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

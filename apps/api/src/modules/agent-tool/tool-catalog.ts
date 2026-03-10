import { AgentToolDefinition } from '@packages/types';

type ToolParam = AgentToolDefinition['parameters'][number];

/**
 * 预置工具目录
 *
 * 每个工具对应一个或多个 WorkflowNodeExecutor。
 * LLM Agent 通过这些定义来了解可以调用什么能力。
 *
 * 设计原则：
 *   1. toolId 用英文小写+下划线（function calling 兼容）
 *   2. displayName / description 用纯中文
 *   3. parameters 尽量简化，隐藏工作流节点的内部实现细节
 */
export const BUILTIN_TOOL_CATALOG: AgentToolDefinition[] = [
    // ═══════════════════════════════════════════════
    //  数据查询类 (DATA_QUERY)
    // ═══════════════════════════════════════════════
    {
        toolId: 'query_market_data',
        displayName: '查询市场行情',
        description: '获取粮食现货市场的价格、成交量等行情数据。可按品种、地域、时间范围筛选。',
        category: 'DATA_QUERY',
        parameters: [
            { name: 'commodity', type: 'string', description: '品种代码，如 CORN/WHEAT/SOYBEAN', required: true, enum: ['CORN', 'WHEAT', 'SOYBEAN', 'RICE', 'SORGHUM', 'BARLEY'] },
            { name: 'regionCode', type: 'string', description: '地域代码，如省份编码', required: false },
            { name: 'lookbackDays', type: 'number', description: '回溯天数，默认7天', required: false, default: 7 },
        ],
        outputDescription: '返回行情数据列表，包含日期、价格、涨跌幅等字段',
        usageExamples: [
            { scenario: '查看最近一周玉米行情', params: { commodity: 'CORN', lookbackDays: 7 } },
            { scenario: '查看山东大豆近30天价格', params: { commodity: 'SOYBEAN', regionCode: 'SD', lookbackDays: 30 } },
        ],
        _nodeType: 'market-data-fetch',
    },
    {
        toolId: 'query_futures_data',
        displayName: '查询期货行情',
        description: '获取粮食期货合约的行情数据，支持主力合约和指定合约查询。',
        category: 'DATA_QUERY',
        parameters: [
            { name: 'commodity', type: 'string', description: '品种代码', required: true },
            { name: 'contractCode', type: 'string', description: '合约代码（如 C2501），留空查主力合约', required: false },
            { name: 'lookbackDays', type: 'number', description: '回溯天数', required: false, default: 7 },
        ],
        outputDescription: '返回期货行情数据，含开盘/收盘/最高/最低/成交量/持仓量',
        _nodeType: 'futures-data-fetch',
    },
    {
        toolId: 'search_knowledge',
        displayName: '搜索知识库',
        description: '在行业知识库中语义搜索，获取政策文件、研报摘要、历史分析等参考资料。',
        category: 'DATA_QUERY',
        parameters: [
            { name: 'query', type: 'string', description: '搜索关键词或问题', required: true },
            { name: 'category', type: 'string', description: '知识分类：POLICY/RESEARCH/NEWS/ANALYSIS', required: false },
            { name: 'topK', type: 'number', description: '返回条数，默认5', required: false, default: 5 },
        ],
        outputDescription: '返回匹配的知识条目列表，含标题、摘要、相关度评分',
        _nodeType: 'knowledge-fetch',
    },
    {
        toolId: 'fetch_reports',
        displayName: '获取历史报告',
        description: '查询系统内已生成的历史报告，如日报、周报、研报等。',
        category: 'DATA_QUERY',
        parameters: [
            { name: 'reportType', type: 'string', description: '报告类型：DAILY/WEEKLY/RESEARCH/RISK', required: false },
            { name: 'commodity', type: 'string', description: '相关品种', required: false },
            { name: 'lookbackDays', type: 'number', description: '回溯天数', required: false, default: 30 },
        ],
        outputDescription: '返回报告列表，含标题、摘要、生成时间',
        _nodeType: 'report-fetch',
    },

    // ═══════════════════════════════════════════════
    //  计算分析类 (COMPUTE)
    // ═══════════════════════════════════════════════
    {
        toolId: 'calculate_formula',
        displayName: '公式计算',
        description: '执行自定义公式计算，如价差（基差 = 现货价 - 期货价）、环比增长率等。',
        category: 'COMPUTE',
        parameters: [
            { name: 'formula', type: 'string', description: '计算公式表达式，支持基本数学运算', required: true },
            { name: 'variables', type: 'object', description: '公式中的变量值', required: false },
        ],
        outputDescription: '返回计算结果和中间过程',
        usageExamples: [
            { scenario: '计算玉米基差', params: { formula: 'spot_price - futures_price', variables: { spot_price: 2850, futures_price: 2780 } } },
        ],
        _nodeType: 'formula-calc',
    },
    {
        toolId: 'calculate_quantile',
        displayName: '分位数分析',
        description: '计算价格或指标在历史区间中的分位数水平，判断当前处于高位还是低位。',
        category: 'COMPUTE',
        parameters: [
            { name: 'values', type: 'array', description: '历史数据序列', required: true, items: { type: 'number' } },
            { name: 'currentValue', type: 'number', description: '当前值', required: true },
        ],
        outputDescription: '返回分位数百分比和所处区间判断',
        _nodeType: 'quantile-calc',
    },
    {
        toolId: 'calculate_features',
        displayName: '特征工程',
        description: '从原始数据中提取技术指标和统计特征，如移动平均、波动率、趋势斜率等。',
        category: 'COMPUTE',
        parameters: [
            { name: 'dataSource', type: 'string', description: '数据来源标识', required: true },
            { name: 'features', type: 'array', description: '要计算的特征列表：MA/VOLATILITY/TREND/RSI', required: true, items: { type: 'string' } },
            { name: 'window', type: 'number', description: '计算窗口天数', required: false, default: 20 },
        ],
        outputDescription: '返回计算出的各项特征值',
        _nodeType: 'feature-calc',
    },

    // ═══════════════════════════════════════════════
    //  AI分析类 (AI_ANALYSIS)
    // ═══════════════════════════════════════════════
    {
        toolId: 'ai_analyze',
        displayName: 'AI智能分析',
        description: '使用AI智能体对数据或文本进行分析，生成研判结论。可指定分析角度和输出要求。',
        category: 'AI_ANALYSIS',
        parameters: [
            { name: 'agentCode', type: 'string', description: '使用的AI角色代码（留空用默认分析师）', required: false },
            { name: 'analysisGoal', type: 'string', description: '分析目标，如"判断玉米短期走势"', required: true },
            { name: 'context', type: 'string', description: '提供给AI的参考数据和背景信息', required: false },
            { name: 'temperature', type: 'number', description: '创意度0-1，越高越发散', required: false, default: 0.7 },
        ],
        outputDescription: '返回AI分析结论，含推理过程和研判结果',
        usageExamples: [
            { scenario: '分析玉米走势', params: { analysisGoal: '根据近期行情判断玉米下周走势', temperature: 0.5 } },
        ],
        _nodeType: 'single-agent',
    },
    {
        toolId: 'multi_perspective_discuss',
        displayName: '多方讨论',
        description: '让多个AI角色从不同立场对一个议题进行多轮讨论，综合裁判后输出结论。适合需要多角度分析的复杂研判。',
        category: 'AI_ANALYSIS',
        parameters: [
            { name: 'topic', type: 'string', description: '讨论议题', required: true },
            { name: 'perspectives', type: 'array', description: '参与者立场列表，如 ["看多: 关注需求增长", "看空: 关注供给压力"]', required: true, items: { type: 'string' } },
            { name: 'maxRounds', type: 'number', description: '最多讨论轮次', required: false, default: 3 },
            { name: 'judgePolicy', type: 'string', description: '裁决方式：WEIGHTED/MAJORITY/VETO', required: false, default: 'WEIGHTED' },
        ],
        outputDescription: '返回各方观点摘要和最终裁判结论',
        _nodeType: 'debate-round',
    },

    // ═══════════════════════════════════════════════
    //  规则引擎类 (RULE_ENGINE)
    // ═══════════════════════════════════════════════
    {
        toolId: 'evaluate_rules',
        displayName: '规则评估',
        description: '使用预设的业务规则包对数据进行评估打分，判断是否触发风控或交易信号。',
        category: 'RULE_ENGINE',
        parameters: [
            { name: 'rulePackCode', type: 'string', description: '规则包代码', required: true },
            { name: 'inputData', type: 'object', description: '待评估的数据', required: true },
            { name: 'minHitScore', type: 'number', description: '通过分数阈值', required: false, default: 60 },
        ],
        outputDescription: '返回评估总分、命中的规则列表和通过/不通过判定',
        _nodeType: 'rule-pack-eval',
    },
    {
        toolId: 'risk_check',
        displayName: '风险检查',
        description: '对操作建议或交易信号进行风险评估，判断是否需要拦截或发出预警。',
        category: 'RULE_ENGINE',
        parameters: [
            { name: 'action', type: 'string', description: '待检查的操作：BUY/SELL/HOLD', required: true },
            { name: 'context', type: 'object', description: '风控上下文数据（仓位、风险敞口等）', required: false },
        ],
        outputDescription: '返回风险等级、是否放行、风险提示',
        _nodeType: 'risk-gate',
    },

    // ═══════════════════════════════════════════════
    //  输出类 (OUTPUT)
    // ═══════════════════════════════════════════════
    {
        toolId: 'generate_report',
        displayName: '生成报告',
        description: '将分析结果整合为结构化报告，支持日报、周报、研报等多种格式。',
        category: 'OUTPUT',
        parameters: [
            { name: 'reportType', type: 'string', description: '报告类型：DAILY/WEEKLY/RESEARCH/RISK/STRATEGY', required: true },
            { name: 'title', type: 'string', description: '报告标题', required: true },
            { name: 'sections', type: 'array', description: '报告章节数据', required: true, items: { type: 'object' } },
            { name: 'commodity', type: 'string', description: '相关品种', required: false },
        ],
        outputDescription: '返回生成的报告内容和ID',
        _nodeType: 'report-generate',
    },
    {
        toolId: 'send_notification',
        displayName: '发送通知',
        description: '将重要信息或预警发送通知给相关人员。',
        category: 'OUTPUT',
        parameters: [
            { name: 'channel', type: 'string', description: '通知渠道：EMAIL/SMS/WECHAT/INTERNAL', required: true, enum: ['EMAIL', 'SMS', 'WECHAT', 'INTERNAL'] },
            { name: 'title', type: 'string', description: '通知标题', required: true },
            { name: 'content', type: 'string', description: '通知内容', required: true },
            { name: 'recipients', type: 'array', description: '接收人ID列表', required: false, items: { type: 'string' } },
        ],
        outputDescription: '返回发送状态',
        _nodeType: 'notify',
    },

    // ═══════════════════════════════════════════════
    //  流程类 (WORKFLOW)
    // ═══════════════════════════════════════════════
    {
        toolId: 'run_workflow',
        displayName: '运行工作流',
        description: '调用一个已发布的完整工作流来执行特定任务，如执行"晨间综判流程"生成日报。',
        category: 'WORKFLOW',
        parameters: [
            { name: 'workflowId', type: 'string', description: '工作流编号', required: true },
            { name: 'inputParams', type: 'object', description: '工作流输入参数', required: false },
        ],
        outputDescription: '返回工作流执行结果',
        usageExamples: [
            { scenario: '运行晨间综判', params: { workflowId: 'scene-morning_market_overview-xxx' } },
        ],
        _nodeType: 'subflow-call',
    },
    {
        toolId: 'build_context',
        displayName: '构建讨论背景',
        description: '汇总收集到的多方数据，组装成AI分析或讨论所需的上下文材料。',
        category: 'WORKFLOW',
        parameters: [
            { name: 'dataSources', type: 'array', description: '数据来源引用', required: true, items: { type: 'string' } },
            { name: 'focusPoints', type: 'array', description: '重点关注问题', required: false, items: { type: 'string' } },
        ],
        outputDescription: '返回结构化的上下文文本',
        _nodeType: 'context-builder',
    },
];

// ── 查询辅助函数 ──────────────────────────────────────────

/** 获取所有工具（按分类分组） */
export const getToolsByCategory = () => {
    const result: Record<string, AgentToolDefinition[]> = {};
    BUILTIN_TOOL_CATALOG.forEach((tool) => {
        if (!result[tool.category]) result[tool.category] = [];
        result[tool.category].push(tool);
    });
    return result;
};

/** 根据 toolId 查找工具定义 */
export const findToolById = (toolId: string): AgentToolDefinition | undefined =>
    BUILTIN_TOOL_CATALOG.find((t) => t.toolId === toolId);

/** 转换为 OpenAI function calling 格式 */
export const toOpenAIFunctions = (tools: AgentToolDefinition[]) =>
    tools.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.toolId,
            description: tool.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    tool.parameters.map((p: ToolParam) => [
                        p.name,
                        {
                            type: p.type,
                            description: p.description,
                            ...(p.enum ? { enum: p.enum } : {}),
                            ...(p.items ? { items: p.items } : {}),
                        },
                    ]),
                ),
                required: tool.parameters
                    .filter((p: ToolParam) => p.required)
                    .map((p: ToolParam) => p.name),
            },
        },
    }));

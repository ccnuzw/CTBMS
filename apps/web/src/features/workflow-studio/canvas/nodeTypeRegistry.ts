import {
    RobotOutlined,
    DatabaseOutlined,
    CalculatorOutlined,
    SafetyOutlined,
    ThunderboltOutlined,
    BellOutlined,
    BranchesOutlined,
    CheckCircleOutlined,
    PlayCircleOutlined,
    ApiOutlined,
    ClockCircleOutlined,
    TeamOutlined,
    FileSearchOutlined,
    ExperimentOutlined,
    FileTextOutlined,
    GlobalOutlined,
    AuditOutlined,
    FileDoneOutlined,
    PartitionOutlined,
    AlertOutlined,
    SolutionOutlined,
    ClusterOutlined,
    GroupOutlined,
    SendOutlined,
    UndoOutlined,
} from '@ant-design/icons';

/**
 * 节点类型分类
 */
export type NodeCategory =
    | 'TRIGGER'
    | 'DATA'
    | 'COMPUTE'
    | 'RULE'
    | 'AGENT'
    | 'CONTROL'
    | 'DECISION'
    | 'OUTPUT'
    | 'GROUP';

/**
 * 节点类型注册信息
 */
export interface NodeTypeConfig {
    type: string;
    label: string;
    category: NodeCategory;
    color: string;
    icon: React.ComponentType;
    description: string;
    defaultConfig: Record<string, unknown>;
    outputFields?: { name: string; label: string; type: string }[];
    inputsSchema?: { name: string; type: string; required?: boolean }[];
    outputsSchema?: { name: string; type: string }[];
}

import React from 'react';

/**
 * 分类标签、颜色和图标映射
 */
export const NODE_CATEGORIES: Record<NodeCategory, { label: string; color: string; icon: React.ComponentType }> = {
    TRIGGER: { label: '触发', color: '#722ED1', icon: ThunderboltOutlined },
    DATA: { label: '数据', color: '#1677FF', icon: DatabaseOutlined },
    COMPUTE: { label: '计算', color: '#FA8C16', icon: CalculatorOutlined },
    RULE: { label: '规则', color: '#EB2F96', icon: SafetyOutlined },
    AGENT: { label: '智能体', color: '#13C2C2', icon: RobotOutlined },
    CONTROL: { label: '控制', color: '#8C8C8C', icon: BranchesOutlined },
    DECISION: { label: '决策', color: '#F5222D', icon: SolutionOutlined },
    OUTPUT: { label: '输出', color: '#52C41A', icon: BellOutlined },
    GROUP: { label: '分组', color: '#FAFAFA', icon: GroupOutlined },
};

/**
 * 节点类型注册表
 *
 * 定义所有可用的节点类型，包含图标、颜色、默认配置
 * 用于: 节点面板(拖拽) + 画布渲染 + 属性面板
 */
export const NODE_TYPE_REGISTRY: NodeTypeConfig[] = [
    // ── 触发节点 ──
    {
        type: 'manual-trigger',
        label: '手动触发',
        category: 'TRIGGER',
        color: NODE_CATEGORIES.TRIGGER.color,
        icon: PlayCircleOutlined,
        description: '手动点击触发流程',
        defaultConfig: {},
        outputFields: [{ name: 'triggerUser', label: '触发用户', type: 'string' }],
    },
    {
        type: 'cron-trigger',
        label: '定时触发',
        category: 'TRIGGER',
        color: NODE_CATEGORIES.TRIGGER.color,
        icon: ClockCircleOutlined,
        description: '按 cron 表达式定时触发',
        defaultConfig: { cronExpression: '0 9 * * 1-5' },
    },
    {
        type: 'api-trigger',
        label: 'API 触发',
        category: 'TRIGGER',
        color: NODE_CATEGORIES.TRIGGER.color,
        icon: ApiOutlined,
        description: '外部 API 调用触发',
        defaultConfig: { rateLimitQpm: 60 },
    },
    {
        type: 'event-trigger',
        label: '事件触发',
        category: 'TRIGGER',
        color: NODE_CATEGORIES.TRIGGER.color,
        icon: ThunderboltOutlined,
        description: '基于事件总线的消息触发',
        defaultConfig: { eventType: '', topic: '' },
    },

    // ── 数据节点 ──
    {
        type: 'data-fetch',
        label: '数据采集',
        category: 'DATA',
        color: NODE_CATEGORIES.DATA.color,
        icon: DatabaseOutlined,
        description: '从数据连接器获取数据',
        defaultConfig: { connectorCode: '', timeRangeType: 'LAST_N_DAYS', lookbackDays: 7 },
        outputFields: [{ name: 'data', label: '采集数据', type: 'array' }],
    },
    {
        type: 'report-fetch',
        label: '研报获取',
        category: 'DATA',
        color: NODE_CATEGORIES.DATA.color,
        icon: FileTextOutlined,
        description: '获取最新的研究报告',
        defaultConfig: { category: 'daily', limit: 1 },
    },
    {
        type: 'external-api-fetch',
        label: '外部 API 获取',
        category: 'DATA',
        color: NODE_CATEGORIES.DATA.color,
        icon: GlobalOutlined,
        description: '调用外部数据源 API',
        defaultConfig: { url: '', method: 'GET' },
    },
    {
        type: 'knowledge-fetch',
        label: '知识检索',
        category: 'DATA',
        color: NODE_CATEGORIES.DATA.color,
        icon: FileSearchOutlined,
        description: '从知识库检索相关文档',
        defaultConfig: { topK: 5 },
        outputFields: [{ name: 'documents', label: '检索文档', type: 'array' }],
    },

    // ── 计算节点 ──
    {
        type: 'formula-calc',
        label: '公式计算',
        category: 'COMPUTE',
        color: NODE_CATEGORIES.COMPUTE.color,
        icon: CalculatorOutlined,
        description: '自定义公式或引用公式库',
        defaultConfig: { expression: '', precision: 2, roundingMode: 'HALF_UP', nullPolicy: 'FAIL' },
        outputFields: [{ name: 'result', label: '计算结果', type: 'number' }],
    },
    {
        type: 'feature-calc',
        label: '特征工程',
        category: 'COMPUTE',
        color: NODE_CATEGORIES.COMPUTE.color,
        icon: ExperimentOutlined,
        description: '同比/环比/移动平均/Z-Score',
        defaultConfig: { featureType: 'change_rate', dataKey: 'data' },
        outputFields: [{ name: 'feature', label: '特征值', type: 'number' }],
    },
    {
        type: 'quantile-calc',
        label: '分位数',
        category: 'COMPUTE',
        color: NODE_CATEGORIES.COMPUTE.color,
        icon: CalculatorOutlined,
        description: '百分位/排名/直方图',
        defaultConfig: { quantileType: 'percentile', percentiles: [25, 50, 75, 90, 95] },
    },

    // ── 规则节点 ──
    {
        type: 'rule-eval',
        label: '规则评估',
        category: 'RULE',
        color: NODE_CATEGORIES.RULE.color,
        icon: AuditOutlined,
        description: '单规则逻辑评估',
        defaultConfig: { ruleCode: '', operator: 'EQ', value: '' },
    },
    {
        type: 'alert-check',
        label: '告警检查',
        category: 'RULE',
        color: NODE_CATEGORIES.RULE.color,
        icon: AlertOutlined,
        description: '检查是否触发市场告警',
        defaultConfig: { alertType: '', threshold: 0 },
    },
    {
        type: 'rule-pack-eval',
        label: '规则包评估',
        category: 'RULE',
        color: NODE_CATEGORIES.RULE.color,
        icon: SafetyOutlined,
        description: '执行规则包评分',
        defaultConfig: { rulePackCode: '', ruleVersionPolicy: 'LOCKED', minHitScore: 60 },
    },
    {
        type: 'decision-merge',
        label: '决策合成',
        category: 'DECISION',
        color: NODE_CATEGORIES.DECISION.color,
        icon: SolutionOutlined,
        description: '多路信号合成最终决策',
        defaultConfig: { strategy: 'WEIGHTED_SUM', threshold: 0.8 },
    },
    {
        type: 'approval',
        label: '人工审批',
        category: 'DECISION',
        color: NODE_CATEGORIES.DECISION.color,
        icon: FileDoneOutlined,
        description: '人工介入审批确认',
        defaultConfig: { approverRole: 'RISK_MANAGER', timeoutAction: 'REJECT' },
    },
    {
        type: 'risk-gate',
        label: '风控门禁',
        category: 'DECISION',
        color: NODE_CATEGORIES.DECISION.color,
        icon: ThunderboltOutlined,
        description: '风险等级判定与降级',
        defaultConfig: {},
    },

    // ── Agent 节点 ──
    {
        type: 'agent-call',
        label: '智能体调用',
        category: 'AGENT',
        color: NODE_CATEGORIES.AGENT.color,
        icon: RobotOutlined,
        description: '调用 AI Agent 进行分析',
        defaultConfig: { agentCode: '' },
        outputFields: [
            { name: 'response', label: '回复内容', type: 'string' },
            { name: 'reasoning', label: '思考过程', type: 'string' },
        ],
    },
    {
        type: 'debate-round',
        label: '辩论轮次',
        category: 'AGENT',
        color: NODE_CATEGORIES.AGENT.color,
        icon: TeamOutlined,
        description: '多 Agent 辩论',
        defaultConfig: { participants: [], maxRounds: 3, judgePolicy: 'WEIGHTED' },
        outputFields: [
            { name: 'conclusion', label: '最终结论', type: 'string' },
            { name: 'transcript', label: '辩论记录', type: 'array' },
        ],
    },

    // ── 控制节点 ──
    {
        type: 'control-branch',
        label: '分支控制',
        category: 'CONTROL',
        color: NODE_CATEGORIES.CONTROL.color,
        icon: BranchesOutlined,
        description: '条件分支控制',
        defaultConfig: {},
    },
    {
        type: 'control-loop',
        label: '循环控制',
        category: 'CONTROL',
        color: NODE_CATEGORIES.CONTROL.color,
        icon: UndoOutlined,
        description: '循环执行',
        defaultConfig: { maxLoops: 10 },
    },
    {
        type: 'control-delay',
        label: '延时等待',
        category: 'CONTROL',
        color: NODE_CATEGORIES.CONTROL.color,
        icon: ClockCircleOutlined,
        description: '等待一段时间',
        defaultConfig: { delaySeconds: 60 },
    },
    {
        type: 'control-join',
        label: '汇聚等待',
        category: 'CONTROL',
        color: NODE_CATEGORIES.CONTROL.color,
        icon: PartitionOutlined,
        description: '等待多路汇聚',
        defaultConfig: { joinMode: 'ALL' },
    },

    // ── 输出节点 ──
    {
        type: 'notify',
        label: '消息通知',
        category: 'OUTPUT',
        color: NODE_CATEGORIES.OUTPUT.color,
        icon: BellOutlined,
        description: '发送通知消息',
        defaultConfig: { channel: 'EMAIL' },
    },
    {
        type: 'dashboard-publish',
        label: '看板发布',
        category: 'OUTPUT',
        color: NODE_CATEGORIES.OUTPUT.color,
        icon: SolutionOutlined, // Reusing Solution or finding better one
        description: '发布数据到看板',
        defaultConfig: {},
    },
    {
        type: 'report-generate',
        label: '报告生成',
        category: 'OUTPUT',
        color: NODE_CATEGORIES.OUTPUT.color,
        icon: FileDoneOutlined,
        description: '生成分析报告',
        defaultConfig: { format: 'PDF' },
    },
    {
        type: 'group',
        label: '分组',
        category: 'GROUP',
        color: NODE_CATEGORIES.GROUP.color,
        icon: GroupOutlined,
        description: '将相关节点进行可视化分组',
        defaultConfig: {
            width: 300,
            height: 200,
            label: 'Group',
        },
    },
];

/**
 * 按类型查找注册信息
 */
export const getNodeTypeConfig = (type: string): NodeTypeConfig | undefined => {
    return NODE_TYPE_REGISTRY.find((c) => c.type === type);
};

/**
 * 按分类分组
 */
export const getNodesByCategory = (): Record<NodeCategory, NodeTypeConfig[]> => {
    // Initialize with all categories to ensure order
    const result: Partial<Record<NodeCategory, NodeTypeConfig[]>> = {};
    (Object.keys(NODE_CATEGORIES) as NodeCategory[]).forEach(cat => {
        result[cat] = [];
    });

    NODE_TYPE_REGISTRY.forEach((config) => {
        if (!result[config.category]) {
            result[config.category] = [];
        }
        result[config.category]?.push(config);
    });
    return result as Record<NodeCategory, NodeTypeConfig[]>;
};

export const getCategoryConfig = (category: NodeCategory) => {
    return NODE_CATEGORIES[category] || { label: category, color: '#999', icon: RobotOutlined };
};

/**
 * 分类标签映射
 */
export const CATEGORY_LABELS: Record<NodeCategory, string> = {
    TRIGGER: '触发节点',
    DATA: '数据节点',
    COMPUTE: '计算节点',
    RULE: '规则节点',
    AGENT: '智能体节点',
    CONTROL: '控制节点',
    DECISION: '决策节点',
    OUTPUT: '输出节点',
    GROUP: '分组节点',
};

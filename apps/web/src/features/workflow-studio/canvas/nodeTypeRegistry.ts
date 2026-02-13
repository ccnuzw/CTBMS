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
} from '@ant-design/icons';

/**
 * 节点类型分类
 */
export type NodeCategory =
    | 'trigger'
    | 'data'
    | 'compute'
    | 'rule'
    | 'agent'
    | 'control'
    | 'decision'
    | 'output';

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
}

/**
 * 分类颜色映射 (使用 Ant Design 语义色调)
 */
const CATEGORY_COLORS: Record<NodeCategory, string> = {
    trigger: '#722ED1',
    data: '#1677FF',
    compute: '#FA8C16',
    rule: '#EB2F96',
    agent: '#13C2C2',
    control: '#8C8C8C',
    decision: '#F5222D',
    output: '#52C41A',
};

import React from 'react';

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
        category: 'trigger',
        color: CATEGORY_COLORS.trigger,
        icon: PlayCircleOutlined,
        description: '手动点击触发流程',
        defaultConfig: {},
    },
    {
        type: 'cron-trigger',
        label: '定时触发',
        category: 'trigger',
        color: CATEGORY_COLORS.trigger,
        icon: ClockCircleOutlined,
        description: '按 cron 表达式定时触发',
        defaultConfig: { cronExpression: '0 9 * * 1-5' },
    },
    {
        type: 'api-trigger',
        label: 'API 触发',
        category: 'trigger',
        color: CATEGORY_COLORS.trigger,
        icon: ApiOutlined,
        description: '外部 API 调用触发',
        defaultConfig: { rateLimitQpm: 60 },
    },

    // ── 数据节点 ──
    {
        type: 'data-fetch',
        label: '数据采集',
        category: 'data',
        color: CATEGORY_COLORS.data,
        icon: DatabaseOutlined,
        description: '从数据连接器获取数据',
        defaultConfig: { connectorCode: '', timeRangeType: 'LAST_N_DAYS', lookbackDays: 7 },
    },
    {
        type: 'knowledge-fetch',
        label: '知识检索',
        category: 'data',
        color: CATEGORY_COLORS.data,
        icon: FileSearchOutlined,
        description: '从知识库检索相关文档',
        defaultConfig: { topK: 5 },
    },

    // ── 计算节点 ──
    {
        type: 'formula-calc',
        label: '公式计算',
        category: 'compute',
        color: CATEGORY_COLORS.compute,
        icon: CalculatorOutlined,
        description: '自定义公式或引用公式库',
        defaultConfig: { expression: '', precision: 2, roundingMode: 'HALF_UP', nullPolicy: 'FAIL' },
    },
    {
        type: 'feature-calc',
        label: '特征工程',
        category: 'compute',
        color: CATEGORY_COLORS.compute,
        icon: ExperimentOutlined,
        description: '同比/环比/移动平均/Z-Score',
        defaultConfig: { featureType: 'change_rate', dataKey: 'data' },
    },
    {
        type: 'quantile-calc',
        label: '分位数',
        category: 'compute',
        color: CATEGORY_COLORS.compute,
        icon: CalculatorOutlined,
        description: '百分位/排名/直方图',
        defaultConfig: { quantileType: 'percentile', percentiles: [25, 50, 75, 90, 95] },
    },

    // ── 规则节点 ──
    {
        type: 'rule-pack-eval',
        label: '规则包评估',
        category: 'rule',
        color: CATEGORY_COLORS.rule,
        icon: SafetyOutlined,
        description: '执行规则包评分',
        defaultConfig: { rulePackCode: '', ruleVersionPolicy: 'LOCKED', minHitScore: 60 },
    },
    {
        type: 'risk-gate',
        label: '风控门禁',
        category: 'decision',
        color: CATEGORY_COLORS.decision,
        icon: ThunderboltOutlined,
        description: '风险等级判定与降级',
        defaultConfig: {},
    },

    // ── Agent 节点 ──
    {
        type: 'agent-call',
        label: '智能体调用',
        category: 'agent',
        color: CATEGORY_COLORS.agent,
        icon: RobotOutlined,
        description: '调用 AI Agent 进行分析',
        defaultConfig: { agentCode: '' },
    },
    {
        type: 'debate-round',
        label: '辩论轮次',
        category: 'agent',
        color: CATEGORY_COLORS.agent,
        icon: TeamOutlined,
        description: '多 Agent 辩论',
        defaultConfig: { participants: [], maxRounds: 3, judgePolicy: 'WEIGHTED' },
    },

    // ── 控制节点 ──
    {
        type: 'if-else',
        label: '条件分支',
        category: 'control',
        color: CATEGORY_COLORS.control,
        icon: BranchesOutlined,
        description: 'IF-ELSE 条件判断',
        defaultConfig: { condition: '' },
    },
    {
        type: 'parallel-split',
        label: '并行拆分',
        category: 'control',
        color: CATEGORY_COLORS.control,
        icon: BranchesOutlined,
        description: '拆分为多个并行分支',
        defaultConfig: {},
    },
    {
        type: 'join',
        label: '并行汇聚',
        category: 'control',
        color: CATEGORY_COLORS.control,
        icon: CheckCircleOutlined,
        description: '等待所有并行分支完成',
        defaultConfig: {},
    },

    // ── 输出节点 ──
    {
        type: 'notify',
        label: '通知',
        category: 'output',
        color: CATEGORY_COLORS.output,
        icon: BellOutlined,
        description: '发送通知/消息',
        defaultConfig: { channel: 'SYSTEM', message: '' },
    },
];

/**
 * 按类型查找注册信息
 */
export const getNodeTypeConfig = (type: string): NodeTypeConfig | undefined => {
    return NODE_TYPE_REGISTRY.find((config) => config.type === type);
};

/**
 * 按分类分组
 */
export const getNodeTypesByCategory = (): Record<NodeCategory, NodeTypeConfig[]> => {
    const grouped: Record<NodeCategory, NodeTypeConfig[]> = {
        trigger: [],
        data: [],
        compute: [],
        rule: [],
        agent: [],
        control: [],
        decision: [],
        output: [],
    };

    for (const config of NODE_TYPE_REGISTRY) {
        grouped[config.category].push(config);
    }

    return grouped;
};

/**
 * 分类标签映射
 */
export const CATEGORY_LABELS: Record<NodeCategory, string> = {
    trigger: '触发节点',
    data: '数据节点',
    compute: '计算节点',
    rule: '规则节点',
    agent: '智能体节点',
    control: '控制节点',
    decision: '决策节点',
    output: '输出节点',
};

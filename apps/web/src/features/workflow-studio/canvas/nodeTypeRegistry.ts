import React from 'react';
import {
    RobotOutlined,
    DatabaseOutlined,
    CalculatorOutlined,
    SafetyOutlined,
    ThunderboltOutlined,
    BellOutlined,
    BranchesOutlined,
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
    UndoOutlined,
    NodeIndexOutlined,
    SplitCellsOutlined,
    BuildOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
    getWorkflowNodeContract,
    normalizeWorkflowNodeType,
    type WorkflowCanonicalNodeType,
} from '@packages/types';

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
    aliases?: string[];
}

interface NodeUiMeta {
    label: string;
    category: NodeCategory;
    icon: React.ComponentType;
    description: string;
    aliases?: string[];
}

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

const NODE_UI_META: Record<WorkflowCanonicalNodeType, NodeUiMeta> = {
    'manual-trigger': {
        label: '手动触发',
        category: 'TRIGGER',
        icon: PlayCircleOutlined,
        description: '手动点击触发流程',
        aliases: ['trigger'],
    },
    'cron-trigger': {
        label: '定时触发',
        category: 'TRIGGER',
        icon: ClockCircleOutlined,
        description: '按 cron 表达式定时触发',
    },
    'api-trigger': {
        label: 'API 触发',
        category: 'TRIGGER',
        icon: ApiOutlined,
        description: '外部 API 调用触发',
        aliases: ['on-demand-trigger'],
    },
    'event-trigger': {
        label: '事件触发',
        category: 'TRIGGER',
        icon: ThunderboltOutlined,
        description: '基于事件总线的消息触发',
    },
    'data-fetch': {
        label: '数据采集',
        category: 'DATA',
        icon: DatabaseOutlined,
        description: '从数据连接器获取数据',
        aliases: ['market-data-fetch', 'mock-fetch'],
    },
    'report-fetch': {
        label: '研报获取',
        category: 'DATA',
        icon: FileTextOutlined,
        description: '获取最新研究报告',
    },
    'knowledge-fetch': {
        label: '知识检索',
        category: 'DATA',
        icon: FileSearchOutlined,
        description: '从知识库检索文档',
    },
    'external-api-fetch': {
        label: '外部 API 获取',
        category: 'DATA',
        icon: GlobalOutlined,
        description: '调用外部数据源 API',
    },
    'formula-calc': {
        label: '公式计算',
        category: 'COMPUTE',
        icon: CalculatorOutlined,
        description: '自定义公式或引用公式库',
        aliases: ['compute'],
    },
    'feature-calc': {
        label: '特征工程',
        category: 'COMPUTE',
        icon: ExperimentOutlined,
        description: '同比/环比/移动平均/Z-Score',
    },
    'quantile-calc': {
        label: '分位数',
        category: 'COMPUTE',
        icon: CalculatorOutlined,
        description: '百分位/排名/直方图',
    },
    'rule-eval': {
        label: '规则评估',
        category: 'RULE',
        icon: AuditOutlined,
        description: '单规则逻辑评估',
    },
    'rule-pack-eval': {
        label: '规则包评估',
        category: 'RULE',
        icon: SafetyOutlined,
        description: '执行规则包评分',
    },
    'alert-check': {
        label: '告警检查',
        category: 'RULE',
        icon: AlertOutlined,
        description: '检查是否触发市场告警',
    },
    'agent-call': {
        label: '智能体调用',
        category: 'AGENT',
        icon: RobotOutlined,
        description: '调用 AI Agent 执行分析',
        aliases: ['single-agent'],
    },
    'agent-group': {
        label: '智能体组',
        category: 'AGENT',
        icon: TeamOutlined,
        description: '多 Agent 协同组',
    },
    'context-builder': {
        label: '上下文构建',
        category: 'AGENT',
        icon: BuildOutlined,
        description: '构建辩论/决策上下文',
        aliases: ['debate-topic'],
    },
    'debate-round': {
        label: '辩论轮次',
        category: 'AGENT',
        icon: TeamOutlined,
        description: '多 Agent 辩论流程',
        aliases: ['debate-agent-a', 'debate-agent-b'],
    },
    'judge-agent': {
        label: '裁判 Agent',
        category: 'AGENT',
        icon: SafetyCertificateOutlined,
        description: '对辩论结果进行裁决',
        aliases: ['debate-judge'],
    },
    'if-else': {
        label: '条件分支',
        category: 'CONTROL',
        icon: BranchesOutlined,
        description: '条件分支控制 (If-Else)',
        aliases: ['control-branch'],
    },
    switch: {
        label: '多路分支',
        category: 'CONTROL',
        icon: NodeIndexOutlined,
        description: '多路 Switch 分支',
    },
    'parallel-split': {
        label: '并行拆分',
        category: 'CONTROL',
        icon: SplitCellsOutlined,
        description: '并行执行分支',
    },
    join: {
        label: '汇聚等待',
        category: 'CONTROL',
        icon: PartitionOutlined,
        description: '等待多路汇聚',
        aliases: ['control-join'],
    },
    'control-loop': {
        label: '循环控制',
        category: 'CONTROL',
        icon: UndoOutlined,
        description: '循环执行',
    },
    'control-delay': {
        label: '延时等待',
        category: 'CONTROL',
        icon: ClockCircleOutlined,
        description: '等待一段时间',
    },
    'subflow-call': {
        label: '子流程调用',
        category: 'CONTROL',
        icon: ClusterOutlined,
        description: '调用已发布子流程（策略组件）',
    },
    'decision-merge': {
        label: '决策合成',
        category: 'DECISION',
        icon: SolutionOutlined,
        description: '多路信号合成最终决策',
    },
    'risk-gate': {
        label: '风控门禁',
        category: 'DECISION',
        icon: ThunderboltOutlined,
        description: '风险等级判定与降级',
    },
    approval: {
        label: '人工审批',
        category: 'DECISION',
        icon: FileDoneOutlined,
        description: '人工介入审批确认',
    },
    notify: {
        label: '消息通知',
        category: 'OUTPUT',
        icon: BellOutlined,
        description: '发送通知消息',
    },
    'report-generate': {
        label: '报告生成',
        category: 'OUTPUT',
        icon: FileDoneOutlined,
        description: '生成分析报告',
    },
    'dashboard-publish': {
        label: '看板发布',
        category: 'OUTPUT',
        icon: SolutionOutlined,
        description: '发布数据到看板',
    },
    group: {
        label: '分组',
        category: 'GROUP',
        icon: GroupOutlined,
        description: '将相关节点进行可视化分组',
    },
};

const NODE_ORDER: WorkflowCanonicalNodeType[] = [
    'manual-trigger',
    'cron-trigger',
    'api-trigger',
    'event-trigger',
    'data-fetch',
    'report-fetch',
    'knowledge-fetch',
    'external-api-fetch',
    'formula-calc',
    'feature-calc',
    'quantile-calc',
    'rule-eval',
    'rule-pack-eval',
    'alert-check',
    'agent-call',
    'agent-group',
    'context-builder',
    'debate-round',
    'judge-agent',
    'if-else',
    'switch',
    'parallel-split',
    'join',
    'control-loop',
    'control-delay',
    'subflow-call',
    'decision-merge',
    'risk-gate',
    'approval',
    'notify',
    'report-generate',
    'dashboard-publish',
    'group',
];

const buildNodeTypeConfig = (nodeType: WorkflowCanonicalNodeType): NodeTypeConfig => {
    const ui = NODE_UI_META[nodeType];
    const contract = getWorkflowNodeContract(nodeType);
    const categoryColor = NODE_CATEGORIES[ui.category].color;

    return {
        type: nodeType,
        label: ui.label,
        category: ui.category,
        color: categoryColor,
        icon: ui.icon,
        description: ui.description,
        aliases: ui.aliases,
        defaultConfig: { ...(contract?.defaultConfig ?? {}) },
        inputsSchema: contract?.inputsSchema ?? [],
        outputsSchema: contract?.outputsSchema ?? [],
        outputFields: (contract?.outputsSchema ?? []).map((field) => ({
            name: field.name,
            label: field.name,
            type: field.type,
        })),
    };
};

export const NODE_TYPE_REGISTRY: NodeTypeConfig[] = NODE_ORDER.map(buildNodeTypeConfig);

export const getNodeTypeConfig = (type: string): NodeTypeConfig | undefined => {
    const normalizedType = normalizeWorkflowNodeType(type);
    const found = NODE_TYPE_REGISTRY.find(
        (config) => config.type === normalizedType || config.aliases?.includes(normalizedType),
    );
    if (!found) {
        return undefined;
    }

    return {
        ...found,
        defaultConfig: { ...found.defaultConfig },
        inputsSchema: found.inputsSchema ?? [],
        outputsSchema: found.outputsSchema ?? [],
    };
};

export const getNodesByCategory = (): Record<NodeCategory, NodeTypeConfig[]> => {
    const result: Partial<Record<NodeCategory, NodeTypeConfig[]>> = {};
    (Object.keys(NODE_CATEGORIES) as NodeCategory[]).forEach((category) => {
        result[category] = [];
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

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
import { theme } from 'antd';
const { getDesignToken } = theme;
const token = getDesignToken();
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
    recommendedNextNodes?: string[];
}

interface NodeUiMeta {
    label: string;
    category: NodeCategory;
    icon: React.ComponentType;
    description: string;
    aliases?: string[];
    recommendedNextNodes?: string[];
}

export const NODE_CATEGORIES: Record<NodeCategory, { label: string; color: string; icon: React.ComponentType }> = {
    TRIGGER: { label: '触发', color: (token as any).purple || token.colorPrimary, icon: ThunderboltOutlined },
    DATA: { label: '数据', color: token.blue, icon: DatabaseOutlined },
    COMPUTE: { label: '计算', color: (token as any).orange || token.colorWarningActive, icon: CalculatorOutlined },
    RULE: { label: '规则', color: token.magenta, icon: SafetyOutlined },
    AGENT: { label: '智能体', color: token.cyan, icon: RobotOutlined },
    CONTROL: { label: '控制', color: token.colorTextSecondary, icon: BranchesOutlined },
    DECISION: { label: '决策', color: token.red, icon: SolutionOutlined },
    OUTPUT: { label: '输出', color: token.green, icon: BellOutlined },
    GROUP: { label: '分组', color: token.colorFillAlter, icon: GroupOutlined },
};

const NODE_UI_META: Record<WorkflowCanonicalNodeType, NodeUiMeta> = {
    'manual-trigger': {
        label: '手动触发',
        category: 'TRIGGER',
        icon: PlayCircleOutlined,
        description: '手动点击触发流程',
        aliases: ['trigger'],
        recommendedNextNodes: ['data-fetch', 'agent-call', 'rule-pack-eval'],
    },
    'cron-trigger': {
        label: '定时触发',
        category: 'TRIGGER',
        icon: ClockCircleOutlined,
        description: '按设定的时间表自动启动',
        recommendedNextNodes: ['data-fetch', 'market-data-fetch', 'report-fetch'],
    },
    'api-trigger': {
        label: '接口触发',
        category: 'TRIGGER',
        icon: ApiOutlined,
        description: '由外部系统调用启动',
        aliases: ['on-demand-trigger'],
        recommendedNextNodes: ['data-fetch', 'rule-pack-eval'],
    },
    'event-trigger': {
        label: '事件触发',
        category: 'TRIGGER',
        icon: ThunderboltOutlined,
        description: '当特定事件发生时自动启动',
        recommendedNextNodes: ['data-fetch', 'feature-calc'],
    },
    'data-fetch': {
        label: '数据获取',
        category: 'DATA',
        icon: DatabaseOutlined,
        description: '从已配置的数据源获取数据',
        aliases: ['market-data-fetch', 'mock-fetch'],
        recommendedNextNodes: ['formula-calc', 'rule-pack-eval', 'agent-call'],
    },
    'futures-data-fetch': {
        label: '期货数据获取',
        category: 'DATA',
        icon: DatabaseOutlined,
        description: '获取期货行情与基差信息',
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
        description: '从知识库中搜索相关文档',
    },
    'external-api-fetch': {
        label: '外部数据获取',
        category: 'DATA',
        icon: GlobalOutlined,
        description: '从外部系统获取数据',
    },
    'formula-calc': {
        label: '公式计算',
        category: 'COMPUTE',
        icon: CalculatorOutlined,
        description: '自定义公式或引用公式库',
        aliases: ['compute'],
        recommendedNextNodes: ['rule-eval', 'decision-merge', 'agent-call'],
    },
    'feature-calc': {
        label: '统计分析',
        category: 'COMPUTE',
        icon: ExperimentOutlined,
        description: '计算同比/环比/移动平均等统计指标',
    },
    'quantile-calc': {
        label: '分位数计算',
        category: 'COMPUTE',
        icon: CalculatorOutlined,
        description: '计算百分位、排名与分布',
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
        description: '执行一组规则并给出综合评分',
        recommendedNextNodes: ['decision-merge', 'risk-gate', 'agent-call'],
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
        description: '让 AI 智能体执行分析任务',
        aliases: ['single-agent'],
        recommendedNextNodes: ['decision-merge', 'risk-gate', 'notify'],
    },
    'agent-group': {
        label: '智能体组',
        category: 'AGENT',
        icon: TeamOutlined,
        description: '多智能体协同组',
    },
    'context-builder': {
        label: '上下文构建',
        category: 'AGENT',
        icon: BuildOutlined,
        description: '为智能体讨论或决策准备背景信息',
        aliases: ['debate-topic'],
    },
    'debate-round': {
        label: '多方讨论',
        category: 'AGENT',
        icon: TeamOutlined,
        description: '多个智能体进行讨论交流',
        aliases: ['debate-agent-a', 'debate-agent-b'],
    },
    'judge-agent': {
        label: '裁判智能体',
        category: 'AGENT',
        icon: SafetyCertificateOutlined,
        description: '对辩论结果进行裁决',
        aliases: ['debate-judge'],
    },
    'if-else': {
        label: '条件分支',
        category: 'CONTROL',
        icon: BranchesOutlined,
        description: '根据条件走不同的处理路径',
        aliases: ['control-branch'],
    },
    switch: {
        label: '多路分支',
        category: 'CONTROL',
        icon: NodeIndexOutlined,
        description: '根据多个条件走不同分支',
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
        description: '调用已发布的子工作流',
    },
    'decision-merge': {
        label: '决策合成',
        category: 'DECISION',
        icon: SolutionOutlined,
        description: '多路信号合成最终决策',
    },
    'risk-gate': {
        label: '风控检查',
        category: 'DECISION',
        icon: ThunderboltOutlined,
        description: '判断风险等级并决定是否继续',
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
    'futures-data-fetch',
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
        recommendedNextNodes: ui.recommendedNextNodes,
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
    return NODE_CATEGORIES[category] || { label: category, color: token.colorTextSecondary, icon: RobotOutlined };
};

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
    TRIGGER: '启动方式',
    DATA: '数据获取',
    COMPUTE: '数据计算',
    RULE: '规则判断',
    AGENT: 'AI 智能体',
    CONTROL: '流程控制',
    DECISION: '决策与审批',
    OUTPUT: '结果输出',
    GROUP: '分组',
};

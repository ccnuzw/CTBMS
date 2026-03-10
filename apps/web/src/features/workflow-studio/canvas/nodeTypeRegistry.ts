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
    /** 业务场景举例，帮助行业用户理解节点用途 */
    businessTip?: string;
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
    businessTip?: string;
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
        description: '点击按钮即可启动分析流程',
        businessTip: '如：交易员在开盘前手动启动晨间综判',
        aliases: ['trigger'],
        recommendedNextNodes: ['data-fetch', 'agent-call', 'rule-pack-eval'],
    },
    'cron-trigger': {
        label: '定时触发',
        category: 'TRIGGER',
        icon: ClockCircleOutlined,
        description: '设好时间，每天/每周自动运行',
        businessTip: '如：每天早上7点自动生成日报',
        recommendedNextNodes: ['data-fetch', 'market-data-fetch', 'report-fetch'],
    },
    'api-trigger': {
        label: '接口触发',
        category: 'TRIGGER',
        icon: ApiOutlined,
        description: '其他系统或页面按钮一键调用',
        businessTip: '如：在交易界面点击“智能风险评估”按钮自动触发',
        aliases: ['on-demand-trigger'],
        recommendedNextNodes: ['data-fetch', 'rule-pack-eval'],
    },
    'event-trigger': {
        label: '事件触发',
        category: 'TRIGGER',
        icon: ThunderboltOutlined,
        description: '价格异动、政策发布等事件发生时自动启动',
        businessTip: '如：玉米价格波动超过3%时自动触发异动速报',
        recommendedNextNodes: ['data-fetch', 'feature-calc'],
    },
    'data-fetch': {
        label: '数据获取',
        category: 'DATA',
        icon: DatabaseOutlined,
        description: '获取价格、库存、情报等业务数据',
        businessTip: '如：获取最近7天华北地区玉米现货价格',
        aliases: ['market-data-fetch', 'mock-fetch'],
        recommendedNextNodes: ['formula-calc', 'rule-pack-eval', 'agent-call'],
    },
    'futures-data-fetch': {
        label: '期货数据获取',
        category: 'DATA',
        icon: DatabaseOutlined,
        description: '获取期货合约价格、持仓和基差数据',
        businessTip: '如：获取大连玉米主力合约最新行情',
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
        description: '计算价差、利润、成本等业务指标',
        businessTip: '如：计算 南港价 - 北港价 - 运费 = 套利利润',
        aliases: ['compute'],
        recommendedNextNodes: ['rule-eval', 'decision-merge', 'agent-call'],
    },
    'feature-calc': {
        label: '统计分析',
        category: 'COMPUTE',
        icon: ExperimentOutlined,
        description: '计算涨跌幅、同比环比、趋势走向等',
        businessTip: '如：计算本周玉米现货价格的周环比和月同比',
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
        label: '规则评估',
        category: 'RULE',
        icon: SafetyOutlined,
        description: '按预设的业务规则自动打分判断',
        businessTip: '如：检查价差是否达到套利阈值、库存是否触发预警线',
        recommendedNextNodes: ['decision-merge', 'risk-gate', 'agent-call'],
    },
    'alert-check': {
        label: '告警检查',
        category: 'RULE',
        icon: AlertOutlined,
        description: '检查是否触发市场告警',
    },
    'agent-call': {
        label: 'AI分析',
        category: 'AGENT',
        icon: RobotOutlined,
        description: 'AI自动分析数据并给出研判意见',
        businessTip: '如：让AI分析师综合价格和情报，写出行情研判',
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
        label: '准备讨论背景',
        category: 'AGENT',
        icon: BuildOutlined,
        description: '收集相关信息，为多方讨论做准备',
        businessTip: '如：汇总最新政策、市场数据和历史事件作为讨论依据',
        aliases: ['debate-topic'],
    },
    'debate-round': {
        label: '多方讨论',
        category: 'AGENT',
        icon: TeamOutlined,
        description: '多个AI角色从不同角度讨论分析',
        businessTip: '如：看多方和看空方分别阐述观点，相互质询',
        aliases: ['debate-agent-a', 'debate-agent-b'],
    },
    'judge-agent': {
        label: '综合裁判',
        category: 'AGENT',
        icon: SafetyCertificateOutlined,
        description: '汇总各方观点，给出最终判断和依据',
        businessTip: '如：综合看多看空双方意见，给出行情方向的最终判断',
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
        label: '综合研判',
        category: 'DECISION',
        icon: SolutionOutlined,
        description: '综合各方面分析结果，形成最终结论',
        businessTip: '如：综合价格分析、供需判断和规则评估，给出操作建议',
    },
    'risk-gate': {
        label: '风控检查',
        category: 'DECISION',
        icon: ThunderboltOutlined,
        description: '检查结果是否存在风险，给出风险提示',
        businessTip: '如：检查建议是否违反仓位上限或止损规则',
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
        label: '生成报告',
        category: 'OUTPUT',
        icon: FileDoneOutlined,
        description: '将分析结果整理为可阅读、可分享的中文报告',
        businessTip: '如：生成日报、周报、研报、辩论纪要等',
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
        businessTip: ui.businessTip,
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
    TRIGGER: '如何启动',
    DATA: '获取数据',
    COMPUTE: '计算分析',
    RULE: '规则检查',
    AGENT: 'AI分析',
    CONTROL: '流程控制',
    DECISION: '研判决策',
    OUTPUT: '输出结果',
    GROUP: '分组',
};

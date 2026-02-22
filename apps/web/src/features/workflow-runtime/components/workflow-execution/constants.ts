import {
    WorkflowFailureCategory,
    WorkflowRiskDegradeAction,
    WorkflowRiskLevel,
    WorkflowExecutionStatus,
    WorkflowRuntimeEventLevel,
    WorkflowTriggerType,
} from '@packages/types';

export const runtimeEventLevelLabelMap: Record<WorkflowRuntimeEventLevel, string> = {
    INFO: '信息',
    WARN: '警告',
    ERROR: '错误',
};

export const riskLevelColorMap: Record<string, string> = {
    LOW: 'green',
    MEDIUM: 'gold',
    HIGH: 'orange',
    EXTREME: 'red',
};

export const riskLevelPriorityMap: Record<string, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    EXTREME: 4,
};

export const riskGateMismatchFieldLabelMap: Record<string, string> = {
    riskLevel: '风险等级',
    riskGateBlocked: '阻断标记',
    degradeAction: '降级动作',
    blockReason: '阻断原因',
};

export const executionStatusColorMap: Record<string, string> = {
    PENDING: 'default',
    RUNNING: 'processing',
    SUCCESS: 'success',
    FAILED: 'error',
    CANCELED: 'warning',
};

export const workflowExecutionStatusLabelMap: Record<WorkflowExecutionStatus, string> = {
    PENDING: '等待中',
    RUNNING: '运行中',
    SUCCESS: '成功',
    FAILED: '失败',
    CANCELED: '已取消',
};

export const workflowTriggerTypeLabelMap: Record<WorkflowTriggerType, string> = {
    MANUAL: '手动触发',
    API: 'API 触发',
    SCHEDULE: '定时触发',
    EVENT: '事件触发',
    ON_DEMAND: '按需触发',
};

export const workflowFailureCategoryLabelMap: Record<WorkflowFailureCategory, string> = {
    VALIDATION: '参数校验',
    EXECUTOR: '执行器异常',
    TIMEOUT: '超时',
    CANCELED: '已取消',
    INTERNAL: '内部错误',
};

export const workflowRiskLevelLabelMap: Record<WorkflowRiskLevel, string> = {
    LOW: '低',
    MEDIUM: '中',
    HIGH: '高',
    EXTREME: '极高',
};

export const workflowRiskDegradeActionLabelMap: Record<WorkflowRiskDegradeAction, string> = {
    HOLD: '观望',
    REDUCE: '降仓',
    REVIEW_ONLY: '仅复核',
};

export const nodeStatusLabelMap: Record<string, string> = {
    PENDING: '等待中',
    RUNNING: '运行中',
    SUCCESS: '成功',
    FAILED: '失败',
    SKIPPED: '已跳过',
};

export const nodeTypeLabelMap: Record<string, string> = {
    'manual-trigger': '手动触发',
    'cron-trigger': '定时触发',
    'event-trigger': '事件触发',
    'api-trigger': 'API 触发',
    'data-fetch': '数据采集',
    'futures-data-fetch': '期货数据采集',
    'report-fetch': '研报获取',
    'knowledge-fetch': '知识检索',
    'external-api-fetch': '外部 API 获取',
    'formula-calc': '公式计算',
    'feature-calc': '特征工程',
    'quantile-calc': '分位数',
    'rule-eval': '规则评估',
    'rule-pack-eval': '规则包评估',
    'alert-check': '告警检查',
    'agent-call': '智能体调用',
    'single-agent': '单智能体',
    'agent-group': '智能体组',
    'context-builder': '上下文构建',
    'debate-round': '辩论轮次',
    'judge-agent': '裁判智能体',
    'if-else': '条件分支',
    switch: '多路分支',
    'parallel-split': '并行拆分',
    join: '汇聚等待',
    'control-loop': '循环控制',
    'control-delay': '延时等待',
    'subflow-call': '子流程调用',
    'decision-merge': '决策合成',
    'risk-gate': '风控门禁',
    approval: '人工审批',
    notify: '消息通知',
    'report-generate': '报告生成',
    'dashboard-publish': '看板发布',
};

export const nodeStatusColorMap: Record<string, string> = {
    PENDING: 'default',
    RUNNING: 'processing',
    SUCCESS: 'success',
    FAILED: 'error',
    SKIPPED: 'warning',
};

export const executionStatusOptions: { label: string; value: WorkflowExecutionStatus }[] = [
    { label: '等待中', value: 'PENDING' },
    { label: '运行中', value: 'RUNNING' },
    { label: '成功', value: 'SUCCESS' },
    { label: '失败', value: 'FAILED' },
    { label: '已取消', value: 'CANCELED' },
];

export const triggerTypeOptions: { label: string; value: WorkflowTriggerType }[] = [
    { label: '手动触发', value: 'MANUAL' },
    { label: 'API 触发', value: 'API' },
    { label: '定时触发', value: 'SCHEDULE' },
    { label: '事件触发', value: 'EVENT' },
    { label: '按需触发', value: 'ON_DEMAND' },
];

export const failureCategoryOptions: { label: string; value: WorkflowFailureCategory }[] = [
    { label: '参数校验', value: 'VALIDATION' },
    { label: '执行器异常', value: 'EXECUTOR' },
    { label: '超时', value: 'TIMEOUT' },
    { label: '已取消', value: 'CANCELED' },
    { label: '内部错误', value: 'INTERNAL' },
];

export const runtimeEventLevelColorMap: Record<WorkflowRuntimeEventLevel, string> = {
    INFO: 'default',
    WARN: 'warning',
    ERROR: 'error',
};

export const riskLevelOptions: { label: string; value: WorkflowRiskLevel }[] = [
    { label: '低', value: 'LOW' },
    { label: '中', value: 'MEDIUM' },
    { label: '高', value: 'HIGH' },
    { label: '极高', value: 'EXTREME' },
];

export const degradeActionOptions: { label: string; value: WorkflowRiskDegradeAction }[] = [
    { label: '观望', value: 'HOLD' },
    { label: '降仓', value: 'REDUCE' },
    { label: '仅复核', value: 'REVIEW_ONLY' },
];

export const riskGatePresenceOptions: { label: string; value: boolean }[] = [
    { label: '有风控链路', value: true },
    { label: '无风控链路', value: false },
];

export const riskSummaryPresenceOptions: { label: string; value: boolean }[] = [
    { label: '摘要存在', value: true },
    { label: '摘要缺失', value: false },
];

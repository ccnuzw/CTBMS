import { AgentRoleType } from '@packages/types';

export const AGENT_ROLE_OPTIONS: AgentRoleType[] = [
  'ANALYST',
  'COST_SPREAD',
  'FUTURES_EXPERT',
  'SPOT_EXPERT',
  'LOGISTICS_EXPERT',
  'RISK_OFFICER',
  'EXECUTION_ADVISOR',
  'JUDGE',
  'RISK_INSPECTOR',
  'SENTIMENT_ANALYST',
  'POLICY_ANALYST',
  'INVENTORY_ANALYST',
  'BASIS_ARBITRAGE',
  'COMPLIANCE_GUARD',
  'POSITION_SIZING',
  'EVENT_IMPACT',
  'CASHFLOW_RISK',
  'SCENARIO_STRESS',
];

export const AGENT_ROLE_LABEL_MAP: Record<AgentRoleType, string> = {
  ANALYST: '市场分析',
  COST_SPREAD: '成本价差',
  FUTURES_EXPERT: '期货专家',
  SPOT_EXPERT: '现货专家',
  LOGISTICS_EXPERT: '物流专家',
  RISK_OFFICER: '风控官',
  EXECUTION_ADVISOR: '执行顾问',
  JUDGE: '裁判',
  RISK_INSPECTOR: '风险审查',
  SENTIMENT_ANALYST: '舆情分析',
  POLICY_ANALYST: '政策分析',
  INVENTORY_ANALYST: '库存分析',
  BASIS_ARBITRAGE: '基差套利',
  COMPLIANCE_GUARD: '合规守门',
  POSITION_SIZING: '仓位管理',
  EVENT_IMPACT: '事件冲击',
  CASHFLOW_RISK: '资金流风险',
  SCENARIO_STRESS: '情景压力测试',
};

export const AGENT_NAME_LABEL_MAP: Record<string, string> = {
  MarketAnalystAgent: '市场分析智能体',
  CostSpreadAgent: '成本价差智能体',
  FuturesExpertAgent: '期货专家智能体',
  SpotExpertAgent: '现货专家智能体',
  LogisticsExpertAgent: '物流专家智能体',
  RiskOfficerAgent: '风控官智能体',
  ExecutionAdvisorAgent: '执行顾问智能体',
  JudgeAgent: '裁判智能体',
  MARKET_ANALYST_AGENT_V1: '市场分析智能体',
  COST_SPREAD_AGENT_V1: '成本价差智能体',
  FUTURES_EXPERT_AGENT_V1: '期货专家智能体',
  SPOT_EXPERT_AGENT_V1: '现货专家智能体',
  LOGISTICS_EXPERT_AGENT_V1: '物流专家智能体',
  RISK_OFFICER_AGENT_V1: '风控官智能体',
  EXECUTION_ADVISOR_AGENT_V1: '执行顾问智能体',
  JUDGE_AGENT_V1: '裁判智能体',
};

export const AGENT_MEMORY_POLICY_LABEL_MAP: Record<string, string> = {
  none: '无记忆',
  'short-term': '短期记忆',
  windowed: '窗口记忆',
};

export const TEMPLATE_SOURCE_LABEL_MAP: Record<string, string> = {
  PRIVATE: '私有',
  PUBLIC: '公共',
};

export const getAgentRoleLabel = (roleType?: AgentRoleType | string | null): string => {
  if (!roleType) {
    return '-';
  }
  return AGENT_ROLE_LABEL_MAP[roleType as AgentRoleType] || roleType;
};

export const getAgentStatusLabel = (isActive: boolean): string => (isActive ? '启用' : '停用');

export const getAgentDisplayName = (agentName?: string | null, agentCode?: string | null): string => {
  if (!agentName) {
    return '-';
  }
  return AGENT_NAME_LABEL_MAP[agentName] || (agentCode ? AGENT_NAME_LABEL_MAP[agentCode] : undefined) || agentName;
};

export const getMemoryPolicyLabel = (policy?: string | null): string => {
  if (!policy) {
    return '-';
  }
  return AGENT_MEMORY_POLICY_LABEL_MAP[policy] || policy;
};

export const getTemplateSourceLabel = (source?: string | null): string => {
  if (!source) {
    return '-';
  }
  return TEMPLATE_SOURCE_LABEL_MAP[source] || source;
};

export const OUTPUT_SCHEMA_OPTIONS = [
  { label: '市场分析报告 (MARKET_ANALYSIS_V1)', value: 'MARKET_ANALYSIS_V1' },
  { label: '风险评估报告 (RISK_ASSESSMENT_V1)', value: 'RISK_ASSESSMENT_V1' },
  { label: '交易建议 (TRADE_SUGGESTION_V1)', value: 'TRADE_SUGGESTION_V1' },
  { label: 'Agent 通用输出 (agent_output_v1)', value: 'agent_output_v1' },
  { label: '自定义 (Custom)', value: 'CUSTOM' },
];

export const AVAILABLE_TOOLS = [
  { label: '网络搜索 (search_web)', value: 'search_web', description: '搜索互联网信息，支持 Google/Bing' },
  { label: '科学计算器 (calculator)', value: 'calculator', description: '执行复杂的数学运算' },
  { label: '数据库查询 (database_query)', value: 'database_query', description: '执行 SQL 查询获取业务数据' },
  { label: '发送邮件 (send_email)', value: 'send_email', description: '发送电子邮件通知' },
  { label: '读取文件 (read_file)', value: 'read_file', description: '读取本地或远程文件内容' },
  { label: '写入文件 (write_file)', value: 'write_file', description: '写入内容到文件系统' },
  { label: '代码解释器 (code_interpreter)', value: 'code_interpreter', description: '执行 Python 代码分析数据' },
  { label: '知识库检索 (knowledge_retrieval)', value: 'knowledge_retrieval', description: '检索企业内部知识库文档' },
];

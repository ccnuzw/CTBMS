import { AgentRoleType } from '@packages/types';

export const AGENT_ROLE_OPTIONS: AgentRoleType[] = [
  'ANALYST',
  'RISK_OFFICER',
  'JUDGE',
  'COST_SPREAD',
  'FUTURES_EXPERT',
  'SPOT_EXPERT',
  'LOGISTICS_EXPERT',
  'EXECUTION_ADVISOR',
];

export const AGENT_ROLE_LABEL_MAP: Record<AgentRoleType, string> = {
  ANALYST: '分析师',
  RISK_OFFICER: '风控官',
  JUDGE: '裁判',
  COST_SPREAD: '成本价差',
  FUTURES_EXPERT: '期货专家',
  SPOT_EXPERT: '现货专家',
  LOGISTICS_EXPERT: '物流专家',
  EXECUTION_ADVISOR: '执行顾问',
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

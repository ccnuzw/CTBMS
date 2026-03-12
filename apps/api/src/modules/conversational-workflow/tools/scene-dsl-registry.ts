/**
 * 场景 DSL 注册表
 *
 * 将前端 sceneTemplates.ts 的 DSL 构建逻辑迁移到后端，
 * 使对话创建的工作流拥有完整的分析节点链路。
 *
 * MVP 包含 3 个核心场景：
 *   1. MORNING_BRIEF — 晨间市场综判（LINEAR，10 节点）
 *   2. SPREAD_ANALYSIS — 区域价差分析（DAG，8 节点）
 *   3. POLICY_DEBATE — 政策影响评估（DEBATE，7 节点）
 */

import type { KnownSceneCode } from './workflow-tools';

// ── 节点 ID 生成器 ──────────────────────────────────────────

let nodeCounter = 0;
const resetCounter = () => {
  nodeCounter = 0;
};
const nextId = (prefix: string) => `${prefix}_${++nodeCounter}`;

// ── DSL 类型（轻量版，避免跨包依赖） ───────────────────────

interface DslNode {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface DslEdge {
  id: string;
  from: string;
  to: string;
  edgeType: string;
}

export interface SceneDsl {
  workflowId: string;
  name: string;
  mode: 'LINEAR' | 'DAG' | 'DEBATE';
  usageMethod: 'HEADLESS' | 'COPILOT' | 'ON_DEMAND';
  version: string;
  status: string;
  nodes: DslNode[];
  edges: DslEdge[];
  runPolicy?: Record<string, unknown>;
}

// ── 场景一：晨间市场综判 ────────────────────────────────────

function buildMorningBriefDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const spotFetchId = nextId('data');
  const futuresFetchId = nextId('data');
  const intelFetchId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const ruleId = nextId('rule');
  const decisionId = nextId('decision');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  const commodity = (params['品种'] as string) || '玉米';
  const region = (params['关注区域'] as string) || '全国';

  return {
    workflowId: `conv-morning-brief-${Date.now().toString(36)}`,
    name: `晨间市场综判 - ${commodity}`,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      {
        id: triggerId,
        type: 'manual-trigger',
        name: '启动分析',
        enabled: true,
        config: { description: '手动触发或每日定时触发' },
      },
      {
        id: spotFetchId,
        type: 'data-fetch',
        name: '获取现货价格',
        enabled: true,
        config: {
          dataSourceCode: 'INTERNAL_PRICE_DATA',
          lookbackDays: 7,
          filters: { commodity, region },
        },
      },
      {
        id: futuresFetchId,
        type: 'futures-data-fetch',
        name: '获取期货行情',
        enabled: true,
        config: {
          exchange: 'DCE',
          symbol: commodity === '玉米' ? 'c' : commodity === '大豆' ? 'a' : 'c',
          lookbackDays: 7,
        },
      },
      {
        id: intelFetchId,
        type: 'data-fetch',
        name: '获取市场情报',
        enabled: true,
        config: {
          dataSourceCode: 'INTERNAL_MARKET_INTEL',
          lookbackDays: 3,
          maxItems: 10,
        },
      },
      {
        id: computeId,
        type: 'formula-calc',
        name: '计算涨跌与趋势',
        enabled: true,
        config: {
          formulaType: 'PRICE_CHANGE',
          metrics: ['日涨跌', '周涨跌', '月涨跌'],
        },
      },
      {
        id: agentId,
        type: 'agent-call',
        name: 'AI行情研判',
        enabled: true,
        config: {
          agentCode: 'SpotSupplyDemandAgent',
          analysisGoal: `综合分析${commodity}的现货、期货和最新情报，给出行情研判和操作建议`,
        },
      },
      {
        id: ruleId,
        type: 'rule-pack-eval',
        name: '规则评估',
        enabled: true,
        config: {
          rulePackCode: 'BASELINE_RULES',
          evaluationMode: 'SCORE',
        },
      },
      {
        id: decisionId,
        type: 'decision-merge',
        name: '综合研判',
        enabled: true,
        config: {
          mergeStrategy: 'WEIGHTED',
          outputFields: ['action', 'confidence', 'riskLevel', 'reasoningSummary'],
        },
      },
      {
        id: riskId,
        type: 'risk-gate',
        name: '风控检查',
        enabled: true,
        config: {
          riskProfileCode: 'CORN_RISK_BASE',
          degradeAction: 'HOLD',
          checkItems: ['数据完整性', '异常价格', '极端波动'],
        },
      },
      {
        id: reportId,
        type: 'report-generate',
        name: '生成日报',
        enabled: true,
        config: {
          reportType: 'DAILY_BRIEF',
          language: 'zh-CN',
          sections: ['市场概况', '价格走势', '关键信号', '操作建议', '风险提示'],
        },
      },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: spotFetchId, edgeType: 'data-edge' },
      { id: 'e2', from: spotFetchId, to: futuresFetchId, edgeType: 'data-edge' },
      { id: 'e3', from: futuresFetchId, to: intelFetchId, edgeType: 'data-edge' },
      { id: 'e4', from: intelFetchId, to: computeId, edgeType: 'data-edge' },
      { id: 'e5', from: computeId, to: agentId, edgeType: 'data-edge' },
      { id: 'e6', from: agentId, to: ruleId, edgeType: 'data-edge' },
      { id: 'e7', from: ruleId, to: decisionId, edgeType: 'data-edge' },
      { id: 'e8', from: decisionId, to: riskId, edgeType: 'data-edge' },
      { id: 'e9', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: {
      nodeDefaults: {
        timeoutSeconds: 30,
        retryCount: 1,
        retryIntervalSeconds: 2,
        onError: 'FAIL_FAST',
      },
    },
  };
}

// ── 场景二：区域价差分析 ────────────────────────────────────

function buildSpreadAnalysisDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const northFetchId = nextId('data');
  const southFetchId = nextId('data');
  const freightId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const joinId = nextId('join');
  const reportId = nextId('output');

  const commodity = (params['品种'] as string) || '玉米';
  const sourceRegion = (params['产区'] as string) || '华北';
  const targetRegion = (params['销区'] as string) || '华南';

  return {
    workflowId: `conv-spread-analysis-${Date.now().toString(36)}`,
    name: `${sourceRegion}-${targetRegion} ${commodity}价差分析`,
    mode: 'DAG',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      {
        id: triggerId,
        type: 'manual-trigger',
        name: '启动分析',
        enabled: true,
        config: {},
      },
      {
        id: northFetchId,
        type: 'data-fetch',
        name: `获取${sourceRegion}价格`,
        enabled: true,
        config: {
          dataSourceCode: 'INTERNAL_PRICE_DATA',
          lookbackDays: 7,
          filters: { region: sourceRegion, commodity },
        },
      },
      {
        id: southFetchId,
        type: 'data-fetch',
        name: `获取${targetRegion}价格`,
        enabled: true,
        config: {
          dataSourceCode: 'INTERNAL_PRICE_DATA',
          lookbackDays: 7,
          filters: { region: targetRegion, commodity },
        },
      },
      {
        id: freightId,
        type: 'data-fetch',
        name: '获取物流费用',
        enabled: true,
        config: {
          dataSourceCode: 'MANUAL_FREIGHT_PARAM',
          filters: { route: `${sourceRegion}-${targetRegion}` },
        },
      },
      {
        id: computeId,
        type: 'formula-calc',
        name: '计算价差与套利利润',
        enabled: true,
        config: {
          formulaType: 'SPREAD_PROFIT',
          expression: '销区价 - 产区价 - 物流成本 - 资金成本',
        },
      },
      {
        id: agentId,
        type: 'agent-call',
        name: 'AI价差研判',
        enabled: true,
        config: {
          agentCode: 'RegionalSpreadAgent',
          analysisGoal: `分析${sourceRegion}到${targetRegion}的${commodity}价差走势、套利窗口和操作时机`,
        },
      },
      {
        id: riskId,
        type: 'risk-gate',
        name: '风控检查',
        enabled: true,
        config: {
          riskProfileCode: 'CORN_RISK_BASE',
          degradeAction: 'HOLD',
          checkItems: ['成本倒挂预警', '价差异常波动'],
        },
      },
      {
        id: joinId,
        type: 'join',
        name: '汇总结果',
        enabled: true,
        config: { joinMode: 'ALL' },
      },
      {
        id: reportId,
        type: 'report-generate',
        name: '生成价差研报',
        enabled: true,
        config: {
          reportType: 'SPREAD_REPORT',
          language: 'zh-CN',
          sections: ['价差概览', '物流成本拆解', '套利空间分析', '操作建议', '风险提示'],
        },
      },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: northFetchId, edgeType: 'data-edge' },
      { id: 'e2', from: triggerId, to: southFetchId, edgeType: 'data-edge' },
      { id: 'e3', from: triggerId, to: freightId, edgeType: 'data-edge' },
      { id: 'e4', from: northFetchId, to: computeId, edgeType: 'data-edge' },
      { id: 'e5', from: southFetchId, to: computeId, edgeType: 'data-edge' },
      { id: 'e6', from: freightId, to: computeId, edgeType: 'data-edge' },
      { id: 'e7', from: computeId, to: agentId, edgeType: 'data-edge' },
      { id: 'e8', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e9', from: riskId, to: joinId, edgeType: 'data-edge' },
      { id: 'e10', from: joinId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: {
      nodeDefaults: {
        timeoutSeconds: 30,
        retryCount: 1,
        retryIntervalSeconds: 2,
        onError: 'FAIL_FAST',
      },
    },
  };
}

// ── 场景三：政策影响评估（辩论模式） ────────────────────────

function buildPolicyDebateDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const contextId = nextId('context');
  const debate1Id = nextId('debate');
  const debate2Id = nextId('debate');
  const judgeId = nextId('judge');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  const policyEvent = (params['政策事件描述'] as string) || '待指定的政策事件';

  return {
    workflowId: `conv-policy-debate-${Date.now().toString(36)}`,
    name: `政策评估 - ${policyEvent.slice(0, 20)}`,
    mode: 'DEBATE',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      {
        id: triggerId,
        type: 'manual-trigger',
        name: '发起讨论',
        enabled: true,
        config: {},
      },
      {
        id: contextId,
        type: 'context-builder',
        name: '准备讨论背景',
        enabled: true,
        config: {
          contextSources: ['最新政策情报', '历史类似事件', '当前市场状态'],
          policyDescription: policyEvent,
        },
      },
      {
        id: debate1Id,
        type: 'debate-round',
        name: '第一轮：各方阐述观点',
        enabled: true,
        config: {
          roundType: 'INITIAL_STATEMENT',
          participants: [
            { role: '看多方分析师', perspective: '利多因素分析' },
            { role: '看空方分析师', perspective: '利空因素分析' },
            { role: '风控专员', perspective: '风险因素评估' },
          ],
        },
      },
      {
        id: debate2Id,
        type: 'debate-round',
        name: '第二轮：质询与反驳',
        enabled: true,
        config: {
          roundType: 'CHALLENGE',
          maxChallenges: 2,
        },
      },
      {
        id: judgeId,
        type: 'judge-agent',
        name: '裁判裁决',
        enabled: true,
        config: {
          judgePolicy: 'WEIGHTED',
          outputRequirements: ['综合判断', '置信度', '依据说明'],
        },
      },
      {
        id: riskId,
        type: 'risk-gate',
        name: '风控检查',
        enabled: true,
        config: {
          riskProfileCode: 'CORN_RISK_BASE',
          degradeAction: 'HOLD',
          checkItems: ['观点极端性检查', '证据充分性检查'],
        },
      },
      {
        id: reportId,
        type: 'report-generate',
        name: '生成政策简报',
        enabled: true,
        config: {
          reportType: 'POLICY_BRIEF',
          language: 'zh-CN',
          sections: ['政策概述', '各方观点', '讨论要点', '综合判断', '影响评估', '应对建议'],
        },
      },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: contextId, edgeType: 'data-edge' },
      { id: 'e2', from: contextId, to: debate1Id, edgeType: 'data-edge' },
      { id: 'e3', from: debate1Id, to: debate2Id, edgeType: 'data-edge' },
      { id: 'e4', from: debate2Id, to: judgeId, edgeType: 'data-edge' },
      { id: 'e5', from: judgeId, to: riskId, edgeType: 'data-edge' },
      { id: 'e6', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: {
      nodeDefaults: {
        timeoutSeconds: 60,
        retryCount: 1,
        retryIntervalSeconds: 5,
        onError: 'FAIL_FAST',
      },
    },
  };
}

// ── 场景四：盘中异动速报 ────────────────────────────────────

function buildIntradayAlertDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const priceFetchId = nextId('data');
  const alertCheckId = nextId('alert');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const notifyId = nextId('notify');

  const commodity = (params['监控品种'] as string) || '玉米';
  const threshold = (params['异动检测阈值'] as string) || '3%';

  return {
    workflowId: `conv-intraday-alert-${Date.now().toString(36)}`,
    name: `盘中异动速报 - ${commodity}`,
    mode: 'LINEAR',
    usageMethod: 'HEADLESS',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'event-trigger', name: '价格变动触发', enabled: true, config: { eventType: 'PRICE_CHANGE', interval: '5m' } },
      { id: priceFetchId, type: 'data-fetch', name: '获取实时价格', enabled: true, config: { dataSourceCode: 'INTERNAL_PRICE_DATA', lookbackDays: 1, filters: { commodity } } },
      { id: alertCheckId, type: 'alert-check', name: '异动检测', enabled: true, config: { threshold, metrics: ['价格涨跌幅', '成交量偏离', '持仓异动'] } },
      { id: agentId, type: 'agent-call', name: 'AI速报生成', enabled: true, config: { agentCode: 'IntradayAlertAgent', analysisGoal: `分析${commodity}异动原因并给出速报` } },
      { id: riskId, type: 'risk-gate', name: '风控检查', enabled: true, config: { checkItems: ['误报过滤', '异动等级评估'] } },
      { id: notifyId, type: 'notify', name: '发送通知', enabled: true, config: { channels: ['站内消息', '邮件'], template: 'INTRADAY_ALERT' } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: priceFetchId, edgeType: 'data-edge' },
      { id: 'e2', from: priceFetchId, to: alertCheckId, edgeType: 'data-edge' },
      { id: 'e3', from: alertCheckId, to: agentId, edgeType: 'data-edge' },
      { id: 'e4', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e5', from: riskId, to: notifyId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 15, retryCount: 1, retryIntervalSeconds: 2, onError: 'FAIL_FAST' } },
  };
}

// ── 场景五：收盘日志 ────────────────────────────────────────

function buildClosingJournalDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const priceFetchId = nextId('data');
  const futuresFetchId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  const commodity = (params['品种'] as string) || '玉米';

  return {
    workflowId: `conv-closing-journal-${Date.now().toString(36)}`,
    name: `收盘日志 - ${commodity}`,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'manual-trigger', name: '启动复盘', enabled: true, config: { description: '收盘后触发' } },
      { id: priceFetchId, type: 'data-fetch', name: '获取当日价格', enabled: true, config: { dataSourceCode: 'INTERNAL_PRICE_DATA', lookbackDays: 1, filters: { commodity } } },
      { id: futuresFetchId, type: 'futures-data-fetch', name: '获取期货收盘', enabled: true, config: { exchange: 'DCE', lookbackDays: 1 } },
      { id: computeId, type: 'formula-calc', name: '计算日内波动', enabled: true, config: { formulaType: 'INTRADAY_RANGE', metrics: ['开盘价', '最高价', '最低价', '收盘价', '日振幅'] } },
      { id: agentId, type: 'agent-call', name: 'AI收盘点评', enabled: true, config: { agentCode: 'ClosingReviewAgent', analysisGoal: `复盘${commodity}当日行情变化和次日关注要点` } },
      { id: riskId, type: 'risk-gate', name: '风控检查', enabled: true, config: { checkItems: ['数据完整性'] } },
      { id: reportId, type: 'report-generate', name: '生成收盘日志', enabled: true, config: { reportType: 'CLOSING_JOURNAL', language: 'zh-CN', sections: ['日内回顾', '多空对比', '持仓分析', '次日关注'] } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: priceFetchId, edgeType: 'data-edge' },
      { id: 'e2', from: priceFetchId, to: futuresFetchId, edgeType: 'data-edge' },
      { id: 'e3', from: futuresFetchId, to: computeId, edgeType: 'data-edge' },
      { id: 'e4', from: computeId, to: agentId, edgeType: 'data-edge' },
      { id: 'e5', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e6', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 30, retryCount: 1, retryIntervalSeconds: 2, onError: 'FAIL_FAST' } },
  };
}

// ── 场景六：期现联动分析 ────────────────────────────────────

function buildBasisAnalysisDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const spotFetchId = nextId('data');
  const futuresFetchId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const joinId = nextId('join');
  const reportId = nextId('output');

  const commodity = (params['品种'] as string) || '玉米';
  const contractMonth = (params['合约月份'] as string) || '近月';

  return {
    workflowId: `conv-basis-analysis-${Date.now().toString(36)}`,
    name: `期现联动 - ${commodity} ${contractMonth}`,
    mode: 'DAG',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'manual-trigger', name: '启动分析', enabled: true, config: {} },
      { id: spotFetchId, type: 'data-fetch', name: '获取现货价格', enabled: true, config: { dataSourceCode: 'INTERNAL_PRICE_DATA', lookbackDays: 30, filters: { commodity } } },
      { id: futuresFetchId, type: 'futures-data-fetch', name: '获取期货数据', enabled: true, config: { exchange: 'DCE', contractMonth, lookbackDays: 30 } },
      { id: computeId, type: 'formula-calc', name: '计算基差与期限结构', enabled: true, config: { formulaType: 'BASIS_SPREAD', metrics: ['基差', '基差率', '期限结构'] } },
      { id: agentId, type: 'agent-call', name: 'AI期现研判', enabled: true, config: { agentCode: 'BasisAnalysisAgent', analysisGoal: `分析${commodity}的基差走势和套保建议` } },
      { id: riskId, type: 'risk-gate', name: '风控检查', enabled: true, config: { riskProfileCode: 'CORN_RISK_BASE', checkItems: ['基差异常', '交割风险'] } },
      { id: joinId, type: 'join', name: '汇总结果', enabled: true, config: { joinMode: 'ALL' } },
      { id: reportId, type: 'report-generate', name: '生成期现研报', enabled: true, config: { reportType: 'BASIS_REPORT', language: 'zh-CN', sections: ['基差走势', '期限结构分析', '套保建议', '交割策略', '风险提示'] } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: spotFetchId, edgeType: 'data-edge' },
      { id: 'e2', from: triggerId, to: futuresFetchId, edgeType: 'data-edge' },
      { id: 'e3', from: spotFetchId, to: computeId, edgeType: 'data-edge' },
      { id: 'e4', from: futuresFetchId, to: computeId, edgeType: 'data-edge' },
      { id: 'e5', from: computeId, to: agentId, edgeType: 'data-edge' },
      { id: 'e6', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e7', from: riskId, to: joinId, edgeType: 'data-edge' },
      { id: 'e8', from: joinId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 30, retryCount: 1, retryIntervalSeconds: 2, onError: 'FAIL_FAST' } },
  };
}

// ── 场景七：供需平衡研判 ────────────────────────────────────

function buildSupplyDemandDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const inventoryId = nextId('data');
  const arrivalId = nextId('data');
  const consumptionId = nextId('data');
  const importId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  const commodity = (params['品种'] as string) || '玉米';
  const period = (params['分析周期'] as string) || '月度';

  return {
    workflowId: `conv-supply-demand-${Date.now().toString(36)}`,
    name: `供需平衡 - ${commodity}(${period})`,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'manual-trigger', name: '启动分析', enabled: true, config: {} },
      { id: inventoryId, type: 'data-fetch', name: '获取库存数据', enabled: true, config: { dataSourceCode: 'INTERNAL_MARKET_INTEL', filters: { commodity, dataType: '库存' } } },
      { id: arrivalId, type: 'data-fetch', name: '获取到港数据', enabled: true, config: { dataSourceCode: 'INTERNAL_MARKET_INTEL', filters: { commodity, dataType: '到港' } } },
      { id: consumptionId, type: 'data-fetch', name: '获取消费数据', enabled: true, config: { dataSourceCode: 'INTERNAL_MARKET_INTEL', filters: { commodity, dataType: '消费' } } },
      { id: importId, type: 'data-fetch', name: '获取进口数据', enabled: true, config: { dataSourceCode: 'INTERNAL_MARKET_INTEL', filters: { commodity, dataType: '进口' } } },
      { id: computeId, type: 'formula-calc', name: '计算供需平衡表', enabled: true, config: { formulaType: 'SUPPLY_DEMAND_BALANCE', period } },
      { id: agentId, type: 'agent-call', name: 'AI供需研判', enabled: true, config: { agentCode: 'SupplyDemandAgent', analysisGoal: `全面分析${commodity}的供需格局和价格展望` } },
      { id: riskId, type: 'risk-gate', name: '风控检查', enabled: true, config: { checkItems: ['数据完整性', '预测偏差'] } },
      { id: reportId, type: 'report-generate', name: '生成供需报告', enabled: true, config: { reportType: 'SUPPLY_DEMAND_REPORT', language: 'zh-CN', sections: ['供需概况', '库存分析', '消费趋势', '进口影响', '价格展望'] } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: inventoryId, edgeType: 'data-edge' },
      { id: 'e2', from: inventoryId, to: arrivalId, edgeType: 'data-edge' },
      { id: 'e3', from: arrivalId, to: consumptionId, edgeType: 'data-edge' },
      { id: 'e4', from: consumptionId, to: importId, edgeType: 'data-edge' },
      { id: 'e5', from: importId, to: computeId, edgeType: 'data-edge' },
      { id: 'e6', from: computeId, to: agentId, edgeType: 'data-edge' },
      { id: 'e7', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e8', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 30, retryCount: 1, retryIntervalSeconds: 2, onError: 'FAIL_FAST' } },
  };
}

// ── 场景八：持仓风险评估 ────────────────────────────────────

function buildPositionRiskDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const positionId = nextId('data');
  const priceFetchId = nextId('data');
  const computeId = nextId('compute');
  const ruleId = nextId('rule');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  const posLimit = (params['仓位上限'] as string) || '未设置';
  const stopLoss = (params['止损阈值'] as string) || '5%';

  return {
    workflowId: `conv-position-risk-${Date.now().toString(36)}`,
    name: `持仓风险评估`,
    mode: 'LINEAR',
    usageMethod: 'ON_DEMAND',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'manual-trigger', name: '启动评估', enabled: true, config: {} },
      { id: positionId, type: 'data-fetch', name: '获取持仓数据', enabled: true, config: { dataSourceCode: 'INTERNAL_POSITION_DATA' } },
      { id: priceFetchId, type: 'data-fetch', name: '获取最新价格', enabled: true, config: { dataSourceCode: 'INTERNAL_PRICE_DATA', lookbackDays: 1 } },
      { id: computeId, type: 'formula-calc', name: '计算持仓盈亏', enabled: true, config: { formulaType: 'POSITION_PNL', positionLimit: posLimit, stopLossThreshold: stopLoss } },
      { id: ruleId, type: 'rule-pack-eval', name: '风控规则检查', enabled: true, config: { rulePackCode: 'POSITION_RISK_RULES', evaluationMode: 'SCORE' } },
      { id: agentId, type: 'agent-call', name: 'AI风险建议', enabled: true, config: { agentCode: 'PositionRiskAgent', analysisGoal: '评估当前持仓风险并给出调整建议' } },
      { id: riskId, type: 'risk-gate', name: '综合风控', enabled: true, config: { checkItems: ['超限预警', '止损触发', '集中度风险'] } },
      { id: reportId, type: 'report-generate', name: '生成风控报告', enabled: true, config: { reportType: 'POSITION_RISK_REPORT', language: 'zh-CN', sections: ['持仓概览', '盈亏分析', '风控评分', '调整建议'] } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: positionId, edgeType: 'data-edge' },
      { id: 'e2', from: positionId, to: priceFetchId, edgeType: 'data-edge' },
      { id: 'e3', from: priceFetchId, to: computeId, edgeType: 'data-edge' },
      { id: 'e4', from: computeId, to: ruleId, edgeType: 'data-edge' },
      { id: 'e5', from: ruleId, to: agentId, edgeType: 'data-edge' },
      { id: 'e6', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e7', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 30, retryCount: 1, retryIntervalSeconds: 2, onError: 'FAIL_FAST' } },
  };
}

// ── 场景九：物流风险预警 ────────────────────────────────────

function buildLogisticsRiskDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const freightId = nextId('data');
  const weatherId = nextId('data');
  const transitId = nextId('data');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const joinId = nextId('join');
  const notifyId = nextId('notify');

  const route = (params['运输路线'] as string) || '华北-华南';

  return {
    workflowId: `conv-logistics-risk-${Date.now().toString(36)}`,
    name: `物流风险预警 - ${route}`,
    mode: 'DAG',
    usageMethod: 'HEADLESS',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'cron-trigger', name: '定时检查', enabled: true, config: { cron: '0 8 * * *', description: '每日上午8点' } },
      { id: freightId, type: 'data-fetch', name: '获取运费数据', enabled: true, config: { dataSourceCode: 'MANUAL_FREIGHT_PARAM', filters: { route } } },
      { id: weatherId, type: 'external-api-fetch', name: '获取天气数据', enabled: true, config: { apiCode: 'WEATHER_API', filters: { route } } },
      { id: transitId, type: 'data-fetch', name: '获取在途货物', enabled: true, config: { dataSourceCode: 'INTERNAL_LOGISTICS_DATA', filters: { route } } },
      { id: agentId, type: 'agent-call', name: 'AI物流风险研判', enabled: true, config: { agentCode: 'LogisticsRiskAgent', analysisGoal: `评估${route}路线的物流风险` } },
      { id: riskId, type: 'risk-gate', name: '风险等级评定', enabled: true, config: { riskProfileCode: 'CORN_RISK_BASE', checkItems: ['运费异常', '天气预警', '在途延误'] } },
      { id: joinId, type: 'join', name: '汇总结果', enabled: true, config: { joinMode: 'ALL' } },
      { id: notifyId, type: 'notify', name: '发送预警', enabled: true, config: { channels: ['站内消息'], template: 'LOGISTICS_RISK_ALERT' } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: freightId, edgeType: 'data-edge' },
      { id: 'e2', from: triggerId, to: weatherId, edgeType: 'data-edge' },
      { id: 'e3', from: triggerId, to: transitId, edgeType: 'data-edge' },
      { id: 'e4', from: freightId, to: agentId, edgeType: 'data-edge' },
      { id: 'e5', from: weatherId, to: agentId, edgeType: 'data-edge' },
      { id: 'e6', from: transitId, to: agentId, edgeType: 'data-edge' },
      { id: 'e7', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e8', from: riskId, to: joinId, edgeType: 'data-edge' },
      { id: 'e9', from: joinId, to: notifyId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 30, retryCount: 2, retryIntervalSeconds: 5, onError: 'FAIL_FAST' } },
  };
}

// ── 场景十：合规性检查 ──────────────────────────────────────

function buildComplianceCheckDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const contractId = nextId('data');
  const ruleId = nextId('rule');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  const checkRule = (params['检查规则'] as string) || '默认合规规则';

  return {
    workflowId: `conv-compliance-check-${Date.now().toString(36)}`,
    name: `合规性检查`,
    mode: 'LINEAR',
    usageMethod: 'ON_DEMAND',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'manual-trigger', name: '发起检查', enabled: true, config: {} },
      { id: contractId, type: 'data-fetch', name: '获取合同数据', enabled: true, config: { dataSourceCode: 'INTERNAL_CONTRACT_DATA' } },
      { id: ruleId, type: 'rule-pack-eval', name: '合规规则评估', enabled: true, config: { rulePackCode: checkRule, evaluationMode: 'STRICT' } },
      { id: agentId, type: 'agent-call', name: 'AI合规分析', enabled: true, config: { agentCode: 'ComplianceAgent', analysisGoal: '审查合同条款合规性并标记风险项' } },
      { id: riskId, type: 'risk-gate', name: '风控评定', enabled: true, config: { checkItems: ['条款合规', '额度检查', '期限检查'] } },
      { id: reportId, type: 'report-generate', name: '生成合规报告', enabled: true, config: { reportType: 'COMPLIANCE_REPORT', language: 'zh-CN', sections: ['检查概览', '合规项', '不合规项', '整改建议'] } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: contractId, edgeType: 'data-edge' },
      { id: 'e2', from: contractId, to: ruleId, edgeType: 'data-edge' },
      { id: 'e3', from: ruleId, to: agentId, edgeType: 'data-edge' },
      { id: 'e4', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e5', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 30, retryCount: 1, retryIntervalSeconds: 2, onError: 'FAIL_FAST' } },
  };
}

// ── 场景十一：周度策略复盘 ──────────────────────────────────

function buildWeeklyReviewDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const execHistoryId = nextId('data');
  const decisionRecordId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const reportId = nextId('output');

  const workflowName = (params['复盘的流程'] as string) || '全部流程';
  const timeRange = (params['时间范围'] as string) || '最近一周';

  return {
    workflowId: `conv-weekly-review-${Date.now().toString(36)}`,
    name: `周度复盘 - ${workflowName}`,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'manual-trigger', name: '启动复盘', enabled: true, config: {} },
      { id: execHistoryId, type: 'data-fetch', name: '获取执行历史', enabled: true, config: { dataSourceCode: 'INTERNAL_EXECUTION_HISTORY', filters: { timeRange, workflowName } } },
      { id: decisionRecordId, type: 'data-fetch', name: '获取决策记录', enabled: true, config: { dataSourceCode: 'INTERNAL_DECISION_RECORDS', filters: { timeRange } } },
      { id: computeId, type: 'formula-calc', name: '计算命中率与偏差', enabled: true, config: { formulaType: 'ACCURACY_METRICS', metrics: ['建议命中率', '参数偏差', '收益归因'] } },
      { id: agentId, type: 'agent-call', name: 'AI策略复盘', enabled: true, config: { agentCode: 'StrategyReviewAgent', analysisGoal: `复盘${timeRange}的策略表现并给出优化建议` } },
      { id: reportId, type: 'report-generate', name: '生成周报', enabled: true, config: { reportType: 'WEEKLY_REVIEW', language: 'zh-CN', sections: ['策略表现', '命中率分析', '偏差分析', '优化建议'] } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: execHistoryId, edgeType: 'data-edge' },
      { id: 'e2', from: execHistoryId, to: decisionRecordId, edgeType: 'data-edge' },
      { id: 'e3', from: decisionRecordId, to: computeId, edgeType: 'data-edge' },
      { id: 'e4', from: computeId, to: agentId, edgeType: 'data-edge' },
      { id: 'e5', from: agentId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 60, retryCount: 1, retryIntervalSeconds: 5, onError: 'FAIL_FAST' } },
  };
}

// ── 场景十二：月度绩效回测 ──────────────────────────────────

function buildMonthlyBacktestDsl(params: Record<string, unknown>): SceneDsl {
  resetCounter();
  const triggerId = nextId('trigger');
  const strategyId = nextId('data');
  const marketDataId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  const strategy = (params['回测策略'] as string) || '默认策略';
  const evalMetrics = (params['评估指标'] as string) || '收益率,最大回撤';

  return {
    workflowId: `conv-monthly-backtest-${Date.now().toString(36)}`,
    name: `月度回测 - ${strategy}`,
    mode: 'LINEAR',
    usageMethod: 'COPILOT',
    version: '1.0.0',
    status: 'DRAFT',
    nodes: [
      { id: triggerId, type: 'manual-trigger', name: '启动回测', enabled: true, config: {} },
      { id: strategyId, type: 'data-fetch', name: '获取策略记录', enabled: true, config: { dataSourceCode: 'INTERNAL_STRATEGY_DATA', filters: { strategy } } },
      { id: marketDataId, type: 'data-fetch', name: '获取历史行情', enabled: true, config: { dataSourceCode: 'INTERNAL_PRICE_DATA', lookbackDays: 30 } },
      { id: computeId, type: 'formula-calc', name: '计算绩效指标', enabled: true, config: { formulaType: 'BACKTEST_METRICS', metrics: evalMetrics.split(',').map((m: string) => m.trim()) } },
      { id: agentId, type: 'agent-call', name: 'AI绩效分析', enabled: true, config: { agentCode: 'BacktestAnalysisAgent', analysisGoal: `分析${strategy}策略的月度表现和参数校准建议` } },
      { id: riskId, type: 'risk-gate', name: '模型风险检查', enabled: true, config: { checkItems: ['过拟合风险', '数据偏差', '样本量充分性'] } },
      { id: reportId, type: 'report-generate', name: '生成月报', enabled: true, config: { reportType: 'MONTHLY_BACKTEST', language: 'zh-CN', sections: ['绩效概览', '收益归因', '风险指标', '调参建议'] } },
    ],
    edges: [
      { id: 'e1', from: triggerId, to: strategyId, edgeType: 'data-edge' },
      { id: 'e2', from: strategyId, to: marketDataId, edgeType: 'data-edge' },
      { id: 'e3', from: marketDataId, to: computeId, edgeType: 'data-edge' },
      { id: 'e4', from: computeId, to: agentId, edgeType: 'data-edge' },
      { id: 'e5', from: agentId, to: riskId, edgeType: 'data-edge' },
      { id: 'e6', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
    runPolicy: { nodeDefaults: { timeoutSeconds: 60, retryCount: 1, retryIntervalSeconds: 5, onError: 'FAIL_FAST' } },
  };
}

// ── 注册表入口 ──────────────────────────────────────────────

type DslBuilder = (params: Record<string, unknown>) => SceneDsl;

const SCENE_DSL_BUILDERS: Record<KnownSceneCode, DslBuilder> = {
  MORNING_BRIEF: buildMorningBriefDsl,
  INTRADAY_ALERT: buildIntradayAlertDsl,
  CLOSING_JOURNAL: buildClosingJournalDsl,
  SPREAD_ANALYSIS: buildSpreadAnalysisDsl,
  BASIS_ANALYSIS: buildBasisAnalysisDsl,
  SUPPLY_DEMAND: buildSupplyDemandDsl,
  POLICY_DEBATE: buildPolicyDebateDsl,
  POSITION_RISK: buildPositionRiskDsl,
  LOGISTICS_RISK: buildLogisticsRiskDsl,
  COMPLIANCE_CHECK: buildComplianceCheckDsl,
  WEEKLY_REVIEW: buildWeeklyReviewDsl,
  MONTHLY_BACKTEST: buildMonthlyBacktestDsl,
};

/**
 * 根据场景编码和用户参数构建完整的工作流 DSL
 *
 * @returns DSL 对象，如果场景不在注册表中则返回 null
 */
export function buildDslForScene(
  sceneCode: string,
  params: Record<string, unknown>,
): SceneDsl | null {
  const builder = SCENE_DSL_BUILDERS[sceneCode as KnownSceneCode];
  if (!builder) {
    return null;
  }
  return builder(params);
}

/**
 * 获取当前支持的场景编码列表
 */
export function getSupportedSceneCodes(): string[] {
  return Object.keys(SCENE_DSL_BUILDERS);
}

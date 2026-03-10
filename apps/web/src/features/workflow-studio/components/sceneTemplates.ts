/**
 * 场景模板定义
 *
 * 内置粮食贸易核心业务场景，让用户从"做什么"出发，
 * 而非面对空白画布。每个模板包含预配置好的完整 DSL，
 * 用户选择后自动创建流程并进入画布编辑。
 */
import type { WorkflowDsl, WorkflowMode, WorkflowUsageMethod } from '@packages/types';

// ── 场景分类 ──────────────────────────────────────────────────────

export type SceneCategory =
  | 'DAILY_ANALYSIS'
  | 'SPECIAL_RESEARCH'
  | 'RISK_MONITOR'
  | 'STRATEGY_REVIEW';

export const SCENE_CATEGORY_LABELS: Record<SceneCategory, string> = {
  DAILY_ANALYSIS: '日常分析',
  SPECIAL_RESEARCH: '专项研判',
  RISK_MONITOR: '风险监控',
  STRATEGY_REVIEW: '策略复盘',
};

export const SCENE_CATEGORY_ORDER: SceneCategory[] = [
  'DAILY_ANALYSIS',
  'SPECIAL_RESEARCH',
  'RISK_MONITOR',
  'STRATEGY_REVIEW',
];

// ── 场景模板接口 ──────────────────────────────────────────────────

export interface SceneTemplate {
  /** 场景唯一编码 */
  sceneCode: string;
  /** 场景中文名称 */
  sceneName: string;
  /** 一句话描述 */
  description: string;
  /** 所属分类 */
  category: SceneCategory;
  /** 适用角色标签 */
  applicableRoles: string[];
  /** 推荐的编排模式 */
  recommendedMode: WorkflowMode;
  /** 推荐的使用方式 */
  recommendedUsage: WorkflowUsageMethod;
  /** 产出的报告/输出类型 */
  outputTypes: string[];
  /** 用户需关注的关键配置项（中文提示） */
  keyConfigPoints: string[];
  /** 预配置的完整 DSL 模板 */
  defaultDsl: WorkflowDsl;
}

// ── 辅助函数 ──────────────────────────────────────────────────────

let nodeCounter = 0;
const resetCounter = () => {
  nodeCounter = 0;
};
const nextId = (prefix: string) => `${prefix}_${++nodeCounter}`;

// ── 场景一：晨间市场综判 ─────────────────────────────────────────

const buildMorningBriefDsl = (): WorkflowDsl => {
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

  return {
    workflowId: 'scene-morning-brief',
    name: '晨间市场综判',
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
          filters: { commodity: '玉米' },
        },
      },
      {
        id: futuresFetchId,
        type: 'futures-data-fetch',
        name: '获取期货行情',
        enabled: true,
        config: {
          exchange: 'DCE',
          symbol: 'c',
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
          analysisGoal: '综合分析现货、期货和最新情报，给出行情研判和操作建议',
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
  };
};

// ── 场景二：区域价差分析 ─────────────────────────────────────────

const buildSpreadAnalysisDsl = (): WorkflowDsl => {
  resetCounter();
  const triggerId = nextId('trigger');
  const northFetchId = nextId('data');
  const southFetchId = nextId('data');
  const freightId = nextId('data');
  const computeId = nextId('compute');
  const agentId = nextId('agent');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  return {
    workflowId: 'scene-spread-analysis',
    name: '区域价差分析',
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
        name: '获取产区价格',
        enabled: true,
        config: {
          dataSourceCode: 'INTERNAL_PRICE_DATA',
          lookbackDays: 7,
          filters: { region: '华北', commodity: '玉米' },
        },
      },
      {
        id: southFetchId,
        type: 'data-fetch',
        name: '获取销区价格',
        enabled: true,
        config: {
          dataSourceCode: 'INTERNAL_PRICE_DATA',
          lookbackDays: 7,
          filters: { region: '华南', commodity: '玉米' },
        },
      },
      {
        id: freightId,
        type: 'data-fetch',
        name: '获取物流费用',
        enabled: true,
        config: {
          dataSourceCode: 'MANUAL_FREIGHT_PARAM',
          filters: { route: '华北-华南' },
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
          analysisGoal: '分析南北价差走势、套利窗口和操作时机',
        },
      },
      {
        id: riskId,
        type: 'risk-gate',
        name: '风控检查',
        enabled: true,
        config: {
          checkItems: ['成本倒挂预警', '价差异常波动'],
        },
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
      { id: 'e9', from: riskId, to: reportId, edgeType: 'data-edge' },
    ],
  };
};

// ── 场景三：政策影响评估（辩论模式） ─────────────────────────────

const buildPolicyDebateDsl = (): WorkflowDsl => {
  resetCounter();
  const triggerId = nextId('trigger');
  const contextId = nextId('context');
  const debate1Id = nextId('debate');
  const debate2Id = nextId('debate');
  const judgeId = nextId('judge');
  const riskId = nextId('risk');
  const reportId = nextId('output');

  return {
    workflowId: 'scene-policy-debate',
    name: '政策影响评估',
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
  };
};

// ── 场景模板注册表 ───────────────────────────────────────────────

export const SCENE_TEMPLATES: SceneTemplate[] = [
  // ── 日常分析 ──
  {
    sceneCode: 'MORNING_BRIEF',
    sceneName: '晨间市场综判',
    description: '每日开盘前：行情速览 + AI研判 + 操作建议，生成可分享的日报',
    category: 'DAILY_ANALYSIS',
    applicableRoles: ['交易员', '分析师', '决策者'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'COPILOT',
    outputTypes: ['市场日报', '操作建议'],
    keyConfigPoints: ['选择关注的品种', '选择关注的区域', '设置自动运行时间（可选）'],
    defaultDsl: buildMorningBriefDsl(),
  },
  {
    sceneCode: 'INTRADAY_ALERT',
    sceneName: '盘中异动速报',
    description: '价格、库存或政策出现异常变动时，自动检出并生成速报',
    category: 'DAILY_ANALYSIS',
    applicableRoles: ['交易员', '风控'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'HEADLESS',
    outputTypes: ['异动速报', '预警通知'],
    keyConfigPoints: ['设置异动检测阈值', '选择监控的品种和区域', '选择通知方式'],
    defaultDsl: buildMorningBriefDsl(), // TODO: 替换为独立DSL
  },
  {
    sceneCode: 'CLOSING_JOURNAL',
    sceneName: '收盘日志',
    description: '当日行情回顾 + 持仓复盘 + 次日关注点',
    category: 'DAILY_ANALYSIS',
    applicableRoles: ['交易员', '分析师'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'COPILOT',
    outputTypes: ['收盘日志'],
    keyConfigPoints: ['选择关注的品种', '是否包含持仓复盘'],
    defaultDsl: buildMorningBriefDsl(), // TODO: 替换为独立DSL
  },

  // ── 专项研判 ──
  {
    sceneCode: 'SPREAD_ANALYSIS',
    sceneName: '区域价差分析',
    description: '产区-销区价差 + 物流成本 + 套利空间，生成价差研报',
    category: 'SPECIAL_RESEARCH',
    applicableRoles: ['交易员', '分析师'],
    recommendedMode: 'DAG',
    recommendedUsage: 'COPILOT',
    outputTypes: ['价差研报', '操作建议'],
    keyConfigPoints: ['选择产区和销区', '确认运费参数', '设置套利阈值'],
    defaultDsl: buildSpreadAnalysisDsl(),
  },
  {
    sceneCode: 'BASIS_ANALYSIS',
    sceneName: '期现联动分析',
    description: '基差变化 + 期限结构 + 套保比例建议',
    category: 'SPECIAL_RESEARCH',
    applicableRoles: ['交易员', '期货分析师'],
    recommendedMode: 'DAG',
    recommendedUsage: 'COPILOT',
    outputTypes: ['期现研报', '套保建议'],
    keyConfigPoints: ['选择合约月份', '确认现货基准', '设置基差阈值'],
    defaultDsl: buildSpreadAnalysisDsl(), // TODO: 替换为独立DSL
  },
  {
    sceneCode: 'SUPPLY_DEMAND',
    sceneName: '供需平衡研判',
    description: '库存 + 到港 + 消费 + 进口全景分析',
    category: 'SPECIAL_RESEARCH',
    applicableRoles: ['分析师', '决策者'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'COPILOT',
    outputTypes: ['供需报告'],
    keyConfigPoints: ['选择品种', '选择分析周期'],
    defaultDsl: buildMorningBriefDsl(), // TODO: 替换为独立DSL
  },
  {
    sceneCode: 'POLICY_DEBATE',
    sceneName: '政策影响评估',
    description: '政策事件发布后，多角色讨论分析影响并给出应对建议',
    category: 'SPECIAL_RESEARCH',
    applicableRoles: ['分析师', '决策者'],
    recommendedMode: 'DEBATE',
    recommendedUsage: 'COPILOT',
    outputTypes: ['政策简报', '辩论纪要'],
    keyConfigPoints: ['输入政策事件描述', '选择参与讨论的角色', '设置讨论轮次'],
    defaultDsl: buildPolicyDebateDsl(),
  },

  // ── 风险监控 ──
  {
    sceneCode: 'POSITION_RISK',
    sceneName: '持仓风险评估',
    description: '仓位风险 + 止损建议 + 阈值预警',
    category: 'RISK_MONITOR',
    applicableRoles: ['交易员', '风控'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'ON_DEMAND',
    outputTypes: ['风控报告'],
    keyConfigPoints: ['设置仓位上限', '设置止损阈值', '选择风控规则'],
    defaultDsl: buildMorningBriefDsl(), // TODO: 替换为独立DSL
  },
  {
    sceneCode: 'LOGISTICS_RISK',
    sceneName: '物流风险预警',
    description: '在途货物 + 运费异常 + 天气影响评估',
    category: 'RISK_MONITOR',
    applicableRoles: ['物流', '风控'],
    recommendedMode: 'DAG',
    recommendedUsage: 'HEADLESS',
    outputTypes: ['预警通知', '物流风险报告'],
    keyConfigPoints: ['选择监控的运输路线', '设置运费异常阈值'],
    defaultDsl: buildSpreadAnalysisDsl(), // TODO: 替换为独立DSL
  },
  {
    sceneCode: 'COMPLIANCE_CHECK',
    sceneName: '合规性检查',
    description: '合同条款 + 额度 + 合规规则自动检查',
    category: 'RISK_MONITOR',
    applicableRoles: ['合规', '风控'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'ON_DEMAND',
    outputTypes: ['合规报告'],
    keyConfigPoints: ['选择检查规则', '上传合同或选择待检合同'],
    defaultDsl: buildMorningBriefDsl(), // TODO: 替换为独立DSL
  },

  // ── 策略复盘 ──
  {
    sceneCode: 'WEEKLY_REVIEW',
    sceneName: '周度策略复盘',
    description: '一周建议质量 + 参数偏差分析 + 调整建议',
    category: 'STRATEGY_REVIEW',
    applicableRoles: ['分析师', '决策者'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'COPILOT',
    outputTypes: ['周报'],
    keyConfigPoints: ['选择复盘的流程', '选择时间范围'],
    defaultDsl: buildMorningBriefDsl(), // TODO: 替换为独立DSL
  },
  {
    sceneCode: 'MONTHLY_BACKTEST',
    sceneName: '月度绩效回测',
    description: '规则命中率 + 收益归因 + 模型参数校准建议',
    category: 'STRATEGY_REVIEW',
    applicableRoles: ['分析师', '决策者'],
    recommendedMode: 'LINEAR',
    recommendedUsage: 'COPILOT',
    outputTypes: ['月报', '调参建议'],
    keyConfigPoints: ['选择回测的策略', '设置评估指标'],
    defaultDsl: buildMorningBriefDsl(), // TODO: 替换为独立DSL
  },
];

// ── 辅助查询函数 ────────────────────────────────────────────────

export const getScenesByCategory = (): Record<SceneCategory, SceneTemplate[]> => {
  const result: Partial<Record<SceneCategory, SceneTemplate[]>> = {};
  SCENE_CATEGORY_ORDER.forEach((category) => {
    result[category] = SCENE_TEMPLATES.filter((s) => s.category === category);
  });
  return result as Record<SceneCategory, SceneTemplate[]>;
};

export const getSceneByCode = (code: string): SceneTemplate | undefined => {
  return SCENE_TEMPLATES.find((s) => s.sceneCode === code);
};

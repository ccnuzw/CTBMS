/**
 * 对话式工作流 — Function Calling 工具定义
 *
 * LLM 通过调用这些预定义工具来结构化输出，
 * 而非自由文本，从而确保输出可控可校验。
 */
import type { AIToolDefinition } from '../../ai/providers/base.provider';

// ── 场景编码枚举（与前端 sceneTemplates 保持同步） ────────

export const KNOWN_SCENE_CODES = [
  'MORNING_BRIEF',
  'INTRADAY_ALERT',
  'CLOSING_JOURNAL',
  'SPREAD_ANALYSIS',
  'BASIS_ANALYSIS',
  'SUPPLY_DEMAND',
  'POLICY_DEBATE',
  'POSITION_RISK',
  'LOGISTICS_RISK',
  'COMPLIANCE_CHECK',
  'WEEKLY_REVIEW',
  'MONTHLY_BACKTEST',
] as const;

export type KnownSceneCode = (typeof KNOWN_SCENE_CODES)[number];

// ── 场景模板摘要（注入 System Prompt 用） ───────────────

export interface SceneTemplateSummary {
  code: string;
  name: string;
  description: string;
  category: string;
  requiredParams: string[];
}

export const SCENE_TEMPLATE_SUMMARIES: SceneTemplateSummary[] = [
  {
    code: 'MORNING_BRIEF',
    name: '晨间市场综判',
    description: '每日开盘前行情速览 + AI研判 + 操作建议，生成日报',
    category: '日常分析',
    requiredParams: ['品种', '关注区域'],
  },
  {
    code: 'INTRADAY_ALERT',
    name: '盘中异动速报',
    description: '价格/库存/政策异常变动自动检出并生成速报',
    category: '日常分析',
    requiredParams: ['监控品种', '异动检测阈值'],
  },
  {
    code: 'CLOSING_JOURNAL',
    name: '收盘日志',
    description: '当日行情回顾 + 持仓复盘 + 次日关注点',
    category: '日常分析',
    requiredParams: ['品种'],
  },
  {
    code: 'SPREAD_ANALYSIS',
    name: '区域价差分析',
    description: '产区-销区价差 + 物流成本 + 套利空间，生成价差研报',
    category: '专项研判',
    requiredParams: ['产区', '销区', '品种'],
  },
  {
    code: 'BASIS_ANALYSIS',
    name: '期现联动分析',
    description: '基差变化 + 期限结构 + 套保比例建议',
    category: '专项研判',
    requiredParams: ['品种', '合约月份'],
  },
  {
    code: 'SUPPLY_DEMAND',
    name: '供需平衡研判',
    description: '库存 + 到港 + 消费 + 进口全景分析',
    category: '专项研判',
    requiredParams: ['品种', '分析周期'],
  },
  {
    code: 'POLICY_DEBATE',
    name: '政策影响评估',
    description: '政策事件发布后多角色讨论分析影响并给出应对建议',
    category: '专项研判',
    requiredParams: ['政策事件描述'],
  },
  {
    code: 'POSITION_RISK',
    name: '持仓风险评估',
    description: '仓位风险 + 止损建议 + 阈值预警',
    category: '风险监控',
    requiredParams: ['仓位上限', '止损阈值'],
  },
  {
    code: 'LOGISTICS_RISK',
    name: '物流风险预警',
    description: '在途货物 + 运费异常 + 天气影响评估',
    category: '风险监控',
    requiredParams: ['运输路线'],
  },
  {
    code: 'COMPLIANCE_CHECK',
    name: '合规性检查',
    description: '合同条款 + 额度 + 合规规则自动检查',
    category: '风险监控',
    requiredParams: ['检查规则'],
  },
  {
    code: 'WEEKLY_REVIEW',
    name: '周度策略复盘',
    description: '一周建议质量 + 参数偏差分析 + 调整建议',
    category: '策略复盘',
    requiredParams: ['复盘的流程', '时间范围'],
  },
  {
    code: 'MONTHLY_BACKTEST',
    name: '月度绩效回测',
    description: '规则命中率 + 收益归因 + 模型参数校准建议',
    category: '策略复盘',
    requiredParams: ['回测策略', '评估指标'],
  },
];

// ── 工具定义 ─────────────────────────────────────────────

export const TOOL_MATCH_SCENE: AIToolDefinition = {
  type: 'function',
  function: {
    name: 'match_scene_template',
    description:
      '根据用户的自然语言描述，匹配最合适的业务场景模板。' +
      '如果用户意图清晰，选择一个场景并提取已知参数；如果不确定，设低置信度。',
    parameters: {
      type: 'object',
      properties: {
        sceneCode: {
          type: 'string',
          enum: KNOWN_SCENE_CODES,
          description: '匹配的场景编码',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: '匹配置信度（0-100），低于 60 表示不确定',
        },
        missingParams: {
          type: 'array',
          items: { type: 'string' },
          description: '还需要向用户确认的参数名称列表',
        },
        extractedParams: {
          type: 'object',
          additionalProperties: true,
          description: '从用户消息中已提取到的参数键值对',
        },
        userFacingMessage: {
          type: 'string',
          description: '向用户展示的中文回复（友好、简洁）',
        },
      },
      required: ['sceneCode', 'confidence', 'missingParams', 'userFacingMessage'],
    },
  },
};

export const TOOL_COLLECT_PARAMS: AIToolDefinition = {
  type: 'function',
  function: {
    name: 'collect_workflow_params',
    description:
      '从用户的回复中提取工作流配置参数。' +
      '更新已收集的参数，标记仍然缺失的参数，判断是否齐全。',
    parameters: {
      type: 'object',
      properties: {
        extractedParams: {
          type: 'object',
          additionalProperties: true,
          description: '从本轮用户消息中新提取到的参数',
        },
        stillMissing: {
          type: 'array',
          items: { type: 'string' },
          description: '仍然缺失的参数名称',
        },
        isComplete: {
          type: 'boolean',
          description: '所有必需参数是否已齐全',
        },
        userFacingMessage: {
          type: 'string',
          description: '向用户展示的中文回复',
        },
      },
      required: ['extractedParams', 'stillMissing', 'isComplete', 'userFacingMessage'],
    },
  },
};

export const TOOL_CONFIRM_CREATE: AIToolDefinition = {
  type: 'function',
  function: {
    name: 'confirm_and_create_workflow',
    description:
      '参数齐全后，确认创建工作流。' +
      '生成工作流名称，整理最终参数，通知用户准备运行。',
    parameters: {
      type: 'object',
      properties: {
        confirmed: {
          type: 'boolean',
          description: '是否确认创建',
        },
        workflowName: {
          type: 'string',
          description: '给工作流起的中文名称',
        },
        finalParams: {
          type: 'object',
          additionalProperties: true,
          description: '最终确认的参数集合',
        },
        userFacingMessage: {
          type: 'string',
          description: '向用户展示的确认消息',
        },
      },
      required: ['confirmed', 'workflowName', 'finalParams', 'userFacingMessage'],
    },
  },
};

export const TOOL_ASK_CLARIFICATION: AIToolDefinition = {
  type: 'function',
  function: {
    name: 'ask_clarification',
    description:
      '当无法理解用户意图或置信度太低时，生成澄清问题。' +
      '可以提供选项帮助用户快速选择。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '要追问的问题',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '供用户选择的选项列表（可选）',
        },
        userFacingMessage: {
          type: 'string',
          description: '向用户展示的完整回复（包含问题和选项说明）',
        },
      },
      required: ['question', 'userFacingMessage'],
    },
  },
};

// ── 导出所有工具 ─────────────────────────────────────────

export const ALL_WORKFLOW_TOOLS: AIToolDefinition[] = [
  TOOL_MATCH_SCENE,
  TOOL_COLLECT_PARAMS,
  TOOL_CONFIRM_CREATE,
  TOOL_ASK_CLARIFICATION,
];

/**
 * 根据对话阶段返回当前可用的工具子集
 */
export function getToolsForPhase(
  phase: string,
): AIToolDefinition[] {
  switch (phase) {
    case 'IDLE':
      return [TOOL_MATCH_SCENE, TOOL_ASK_CLARIFICATION];
    case 'INTENT_PARSED':
    case 'COLLECTING_PARAMS':
      return [TOOL_COLLECT_PARAMS, TOOL_ASK_CLARIFICATION];
    case 'WORKFLOW_READY':
      return [TOOL_CONFIRM_CREATE, TOOL_COLLECT_PARAMS, TOOL_ASK_CLARIFICATION];
    case 'RESULT_DELIVERED':
      return [TOOL_MATCH_SCENE, TOOL_COLLECT_PARAMS, TOOL_CONFIRM_CREATE, TOOL_ASK_CLARIFICATION];
    default:
      return ALL_WORKFLOW_TOOLS;
  }
}

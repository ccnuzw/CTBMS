import { z } from 'zod';

// ── 工具参数 Schema（LLM function calling 格式）──────────────────

/**
 * 单个工具参数定义
 * 兼容 OpenAI function calling 的 JSON Schema 子集
 */
export const AgentToolParameterSchema = z.object({
    name: z.string().describe('参数名称'),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string().describe('参数的中文业务描述'),
    required: z.boolean().default(false),
    enum: z.array(z.string()).optional().describe('可选值枚举'),
    default: z.unknown().optional().describe('默认值'),
    items: z
        .object({ type: z.string() })
        .optional()
        .describe('数组元素类型（type=array 时有效）'),
});

export type AgentToolParameter = z.infer<typeof AgentToolParameterSchema>;

// ── 工具分类 ──────────────────────────────────────────────────

export const AgentToolCategorySchema = z.enum([
    'DATA_QUERY',      // 数据查询类：市场数据、期货数据、知识库
    'COMPUTE',         // 计算分析类：公式计算、分位数、特征工程
    'AI_ANALYSIS',     // AI分析类：智能体调用、讨论、裁判
    'RULE_ENGINE',     // 规则引擎类：规则评估、风险闸门
    'OUTPUT',          // 输出类：报告生成、通知、看板发布
    'WORKFLOW',        // 流程类：子流程调用、条件分支
]);

export type AgentToolCategory = z.infer<typeof AgentToolCategorySchema>;

// ── 工具定义（注册到 LLM 的元数据）──────────────────────────

export const AgentToolDefinitionSchema = z.object({
    /** 工具唯一标识，对应 function calling 的 name */
    toolId: z.string().describe('e.g. query_market_data'),
    /** 中文工具名称（用户可见） */
    displayName: z.string().describe('e.g. 查询市场行情'),
    /** 中文描述（LLM 用来判断何时调用） */
    description: z.string().describe('LLM 可理解的工具用途描述'),
    /** 工具分类 */
    category: AgentToolCategorySchema,
    /** 参数列表 */
    parameters: z.array(AgentToolParameterSchema),
    /** 返回值描述 */
    outputDescription: z.string().optional(),
    /** 示例调用（帮助 LLM 更好地理解如何使用） */
    usageExamples: z.array(z.object({
        scenario: z.string().describe('场景描述'),
        params: z.record(z.unknown()).describe('示例参数'),
    })).optional(),
    /** 对应的底层节点类型（内部映射） */
    _nodeType: z.string().optional(),
});

export type AgentToolDefinition = z.infer<typeof AgentToolDefinitionSchema>;

// ── 工具调用请求/响应 ──────────────────────────────────────

export const AgentToolCallRequestSchema = z.object({
    toolId: z.string(),
    params: z.record(z.unknown()),
    /** 调用上下文：会话ID、用户ID等 */
    context: z.object({
        sessionId: z.string().optional(),
        userId: z.string().optional(),
        conversationHistory: z.array(z.object({
            role: z.enum(['user', 'assistant', 'tool']),
            content: z.string(),
        })).optional(),
    }).optional(),
});

export type AgentToolCallRequest = z.infer<typeof AgentToolCallRequestSchema>;

export const AgentToolCallResponseSchema = z.object({
    toolId: z.string(),
    status: z.enum(['SUCCESS', 'FAILED', 'PARTIAL']),
    /** 结构化结果 */
    data: z.record(z.unknown()),
    /** 中文可读摘要（直接给用户看） */
    summary: z.string(),
    /** 错误信息 */
    error: z.string().optional(),
    /** 耗时（毫秒） */
    durationMs: z.number().optional(),
});

export type AgentToolCallResponse = z.infer<typeof AgentToolCallResponseSchema>;

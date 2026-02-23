/**
 * Agent Skill 工具执行器标准接口
 *
 * 任何业务模块如果需要将自身的 API 或提取能力暴露给大语言模型（Agent），
 * 必须实现该接口，并通过 ToolHandlerRegistry 注册。
 */
export interface IToolHandler {
  /**
   * 唯一标识符（即 AgentSkill 表中的 handlerCode）。
   * 大模型触发对应的 function_name 时将根据此 code 进行路由。
   */
  getHandlerCode(): string;

  /**
   * 工具的详细说明，通常用于日志打印或内部追踪。
   */
  getDescription(): string;

  /**
   * 执行方法。
   * @param args 大模型回传并且已通过 Schema 解析的入参格式对象。
   * @param context (可选) 保留的上下文变量，后续可传递用户 token 或数据库实例等。
   * @returns 必须为字符串，如果是复杂对象请 `JSON.stringify`，作为发回给大模型的 `tool` message reply。
   */
  execute(args: Record<string, unknown>, context?: unknown): Promise<string>;
}

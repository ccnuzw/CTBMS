import { Injectable, Logger } from '@nestjs/common';
import { IToolHandler } from './interfaces/tool-handler.interface';

@Injectable()
export class ToolHandlerRegistryService {
  private readonly logger = new Logger(ToolHandlerRegistryService.name);

  // 维护 Handler Code 到具体执行实例的映射字典
  private readonly handlers = new Map<string, IToolHandler>();

  /**
   * 手动注册
   */
  registerHandler(handler: IToolHandler): void {
    const code = handler.getHandlerCode();
    if (this.handlers.has(code)) {
      this.logger.warn(`ToolHandler 注册冲突覆盖: [${code}] 已存在，将被新实例替换.`);
    }
    this.handlers.set(code, handler);
    this.logger.log(`注册 ToolHandler 成功: [${code}] - ${handler.getDescription()}`);
  }

  /**
   * 根据大模型截获的 call code 查找已注册的本地执行器。
   */
  getHandler(handlerCode: string): IToolHandler | undefined {
    return this.handlers.get(handlerCode);
  }

  /**
   * 获取所有当前激活支持的 Handler Code 列表
   */
  getAllRegisteredCodes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

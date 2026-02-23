import { Injectable } from '@nestjs/common';
import { IToolHandler } from '../interfaces/tool-handler.interface';

@Injectable()
export class CalculateSumMockHandler implements IToolHandler {
  getHandlerCode(): string {
    return 'calculate_sum_mock';
  }

  getDescription(): string {
    return '这是一个两数相加的基础测试能力插件。';
  }

  async execute(args: Record<string, unknown>, _context?: unknown): Promise<string> {
    const a = Number(args.a);
    const b = Number(args.b);

    if (isNaN(a) || isNaN(b)) {
      throw new Error(`Invalid arguments for calculate_sum_mock: a=${args.a}, b=${args.b}`);
    }

    // 这里是本地真实的业务计算或者查库逻辑
    const result = a + b;
    return JSON.stringify({ result });
  }
}

import { Injectable , Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma } from '@prisma/client';

@Injectable()
export class ExecutionLogService {
  private readonly logger = new Logger(ExecutionLogService.name);
    constructor(private readonly prisma: PrismaService) { }

    async recordRuntimeEvent(payload: {
        workflowExecutionId: string;
        nodeExecutionId?: string;
        eventType: string;
        level: 'INFO' | 'WARN' | 'ERROR';
        message: string;
        detail?: Record<string, unknown> | null;
    }): Promise<void> {
        try {
            await this.prisma.workflowRuntimeEvent.create({
                data: {
                    workflowExecutionId: payload.workflowExecutionId,
                    nodeExecutionId: payload.nodeExecutionId,
                    eventType: payload.eventType,
                    level: payload.level,
                    message: payload.message,
                    detail: payload.detail ? (JSON.parse(JSON.stringify(payload.detail)) as Prisma.InputJsonValue) : undefined,
                },
            });
        } catch (e) {
            // Runtime event is diagnostic metadata and must not block execution.
            this.logger.error('Failed to record runtime event', e);
        }
    }

    async createNodeExecution(data: Omit<Prisma.NodeExecutionUncheckedCreateInput, 'id'>) {
        return this.prisma.nodeExecution.create({ data });
    }

    async countNodeExecutions(where: Prisma.NodeExecutionWhereInput) {
        return this.prisma.nodeExecution.count({ where });
    }

    async findNodeExecutions(where: Prisma.NodeExecutionWhereInput) {
        return this.prisma.nodeExecution.findMany({ where, orderBy: { createdAt: 'asc' } });
    }
}

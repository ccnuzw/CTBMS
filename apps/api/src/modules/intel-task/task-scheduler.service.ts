import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { IntelTaskTemplateService } from './intel-task-template.service';
import { TaskCycleType } from '@packages/types';
import { computeNextRunAt } from './intel-task-schedule.utils';

@Injectable()
export class TaskSchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TaskSchedulerService.name);
    private timer?: NodeJS.Timeout;
    private isRunning = false;
    private readonly intervalMs = Number(process.env.TASK_SCHEDULER_INTERVAL_MS || 300000);

    constructor(
        private prisma: PrismaService,
        private templateService: IntelTaskTemplateService,
    ) { }

    onModuleInit() {
        this.timer = setInterval(() => this.tick(), this.intervalMs);
        this.tick();
    }

    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    private async tick() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const now = new Date();
            const templates = await this.prisma.intelTaskTemplate.findMany({
                where: {
                    isActive: true,
                    activeFrom: { lte: now },
                    OR: [{ activeUntil: null }, { activeUntil: { gte: now } }],
                },
                orderBy: { nextRunAt: 'asc' },
            });

            for (const template of templates) {
                await this.processTemplate(template, now);
            }
        } catch (error) {
            this.logger.error('Task scheduler tick failed', error as Error);
        } finally {
            this.isRunning = false;
        }
    }

    private async processTemplate(template: any, now: Date) {
        let nextRunAt = template.nextRunAt ? new Date(template.nextRunAt) : null;

        if (!nextRunAt) {
            nextRunAt = computeNextRunAt(template, now);
            if (nextRunAt) {
                await this.prisma.intelTaskTemplate.update({
                    where: { id: template.id },
                    data: { nextRunAt },
                });
            } else {
                return;
            }
        }

        if (nextRunAt > now) return;

        const maxBackfill = Math.max(0, Number(template.maxBackfillPeriods ?? 1));
        const maxRuns = Math.max(1, maxBackfill);
        let runs = 0;
        let lastRunAt: Date | null = null;

        while (nextRunAt && nextRunAt <= now && runs < maxRuns) {
            if (template.cycleType === TaskCycleType.ONE_TIME && template.lastRunAt) {
                break;
            }
            if (template.activeUntil && nextRunAt > template.activeUntil) {
                nextRunAt = null;
                break;
            }

            // 使用统一的执行入口，支持按采集点类型批量生成
            if (template.targetPointType) {
                // 按采集点类型批量生成任务
                await this.templateService.executeTemplateByPointType(template.id, undefined as any);
            } else {
                // 原有逻辑：按分配规则生成任务
                await this.templateService.createTasksFromTemplate(template, {
                    runAt: nextRunAt,
                    triggeredById: undefined,
                });
            }

            lastRunAt = nextRunAt;
            nextRunAt = computeNextRunAt(template, new Date(nextRunAt.getTime() + 1000));
            runs += 1;

            if (template.cycleType === TaskCycleType.ONE_TIME) break;
        }

        if (template.cycleType === TaskCycleType.ONE_TIME && lastRunAt) {
            await this.prisma.intelTaskTemplate.update({
                where: { id: template.id },
                data: { isActive: false, lastRunAt, nextRunAt: null },
            });
            return;
        }

        if (lastRunAt || nextRunAt !== template.nextRunAt) {
            await this.prisma.intelTaskTemplate.update({
                where: { id: template.id },
                data: {
                    lastRunAt,
                    nextRunAt: template.activeUntil && nextRunAt && nextRunAt > template.activeUntil ? null : nextRunAt,
                },
            });
        }
    }
}

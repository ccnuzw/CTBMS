/**
 * ConversationTurnService — 对话轮次处理领域
 *
 * 负责：
 *   - 对话轮次创建、查询、历史管理
 *   - 对话摘要生成
 *   - Turn-level 的结构化数据处理
 *
 * 注意：createTurn 的核心编排逻辑仍在主 AgentConversationService 中（Facade），
 * 此 Service 负责 Turn 的存储层操作和辅助逻辑。
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';

@Injectable()
export class ConversationTurnService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly utilsService: ConversationUtilsService,
    ) { }

    // ── 对话轮次查询 ──────────────────────────────────────────────────────

    async listTurns(sessionId: string, limit = 50, offset = 0) {
        return this.prisma.conversationTurn.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'asc' },
            skip: offset,
            take: limit,
        });
    }

    async getRecentTurns(sessionId: string, count = 6) {
        const turns = await this.prisma.conversationTurn.findMany({
            where: { sessionId },
            orderBy: { createdAt: 'desc' },
            take: count,
            select: { role: true, content: true, createdAt: true },
        });
        return turns.reverse();
    }

    // ── 对话摘要 ──────────────────────────────────────────────────────────

    async buildConversationSummary(sessionId: string, maxTurns = 6): Promise<string> {
        const turns = await this.getRecentTurns(sessionId, maxTurns);
        if (turns.length === 0) return '';
        return turns
            .map((t) => `[${t.role}] ${(t.content ?? '').slice(0, 200)}`)
            .join('\n');
    }

    // ── 轮次创建辅助 ──────────────────────────────────────────────────────

    async createUserTurn(sessionId: string, content: string, payload?: Record<string, unknown>) {
        return this.prisma.conversationTurn.create({
            data: {
                sessionId,
                role: 'USER',
                content,
                structuredPayload: payload ? (payload as Prisma.InputJsonValue) : undefined,
            },
        });
    }

    async createAssistantTurn(
        sessionId: string,
        content: string,
        payload?: Record<string, unknown>,
    ) {
        return this.prisma.conversationTurn.create({
            data: {
                sessionId,
                role: 'ASSISTANT',
                content,
                structuredPayload: payload ? (payload as Prisma.InputJsonValue) : undefined,
            },
        });
    }

    async createSystemTurn(sessionId: string, content: string, payload?: Record<string, unknown>) {
        return this.prisma.conversationTurn.create({
            data: {
                sessionId,
                role: 'SYSTEM',
                content,
                structuredPayload: payload ? (payload as Prisma.InputJsonValue) : undefined,
            },
        });
    }

    // ── 对话统计 ──────────────────────────────────────────────────────────

    async countTurns(sessionId: string) {
        return this.prisma.conversationTurn.count({ where: { sessionId } });
    }

    async countTurnsByRole(sessionId: string) {
        const [user, assistant, system] = await Promise.all([
            this.prisma.conversationTurn.count({ where: { sessionId, role: 'USER' } }),
            this.prisma.conversationTurn.count({ where: { sessionId, role: 'ASSISTANT' } }),
            this.prisma.conversationTurn.count({ where: { sessionId, role: 'SYSTEM' } }),
        ]);
        return { user, assistant, system, total: user + assistant + system };
    }
}

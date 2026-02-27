/**
 * ConversationOrchestratorService — 动态编排核心
 *
 * 职责：
 *   - generateEphemeralAgent：LLM 生成临时 Agent（prompt + outputSchema）
 *   - assembleEphemeralWorkflow：组装临时工作流（Phase 5）
 *   - applyEphemeralOverrides：临时参数/规则覆盖（Phase 5）
 *   - listEphemeralAgents / getEphemeralAgent
 *
 * 安全防护：
 *   - 单会话最多 5 个临时 Agent
 *   - 默认 TTL 24 小时过期
 *   - 临时 Agent 不允许调用外部 API/写入数据库
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../prisma';
import { AIModelService } from '../../ai/ai-model.service';
import { AIProviderFactory } from '../../ai/providers/provider.factory';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';

// ── 类型定义 ────────────────────────────────────────────────────────────────

/** 临时 Agent 规格 */
export interface EphemeralAgentSpec {
    agentCode: string;
    name: string;
    systemPrompt: string;
    outputSchema: Record<string, unknown>;
    requiredDataSources: string[];
    parameterRefs: string[];
    riskLevel: 'LOW' | 'MEDIUM';
}

/** 临时 Agent */
export interface EphemeralAgent {
    id: string;
    sessionId: string;
    agentCode: string;
    name: string;
    spec: EphemeralAgentSpec;
    status: 'ACTIVE' | 'EXPIRED' | 'PROMOTED';
    ttlHours: number;
    expiresAt: string;
    createdAt: string;
}

/** 临时工作流节点 */
export interface EphemeralWorkflowNode {
    id: string;
    type: string;
    label: string;
    config: Record<string, unknown>;
}

/** 临时工作流边 */
export interface EphemeralWorkflowEdge {
    from: string;
    to: string;
    condition?: string;
}

/** 临时工作流 DSL（内部结构） */
interface EphemeralWorkflowDsl {
    name: string;
    mode: 'LINEAR' | 'DAG';
    nodes: EphemeralWorkflowNode[];
    edges: EphemeralWorkflowEdge[];
}

/** 临时工作流（对外结构） */
export interface EphemeralWorkflow extends EphemeralWorkflowDsl {
    id: string;
    sessionId: string;
    status: 'ACTIVE' | 'EXPIRED';
    ttlHours: number;
    expiresAt: string;
    createdAt: string;
}

/** 参数覆盖结果 */
export interface EphemeralOverrideResult {
    paramOverrides: Record<string, unknown>;
    ruleOverrides: Record<string, unknown>;
    nodeSkips: string[];
    applied: boolean;
}

/** 安全限制 */
const MAX_EPHEMERAL_AGENTS_PER_SESSION = 5;
const DEFAULT_TTL_HOURS = 24;
const BLOCKED_DATA_SOURCES = ['EXTERNAL_API', 'DATABASE_WRITE', 'WEBHOOK_CALL'];

@Injectable()
export class ConversationOrchestratorService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly aiModelService: AIModelService,
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly utils: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
    ) { }

    // ── 生成临时 Agent ────────────────────────────────────────────────────────

    /**
     * 根据用户自然语言指令，通过 LLM 生成临时 Agent。
     *
     * 流程：
     *   1. 检查会话级临时 Agent 数量上限
     *   2. LLM 生成 Agent 规格（systemPrompt + outputSchema）
     *   3. 安全校验（禁止外部 API / 写入 / Webhook）
     *   4. 存储为 EPHEMERAL_AGENT 资产
     *   5. 记录治理事件
     */
    async generateEphemeralAgent(
        userId: string,
        sessionId: string,
        request: { userInstruction: string; context?: string },
    ): Promise<EphemeralAgent | null> {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
            select: { id: true, currentIntent: true },
        });
        if (!session) return null;

        // Step 1: 数量限制
        const existingCount = await this.countActiveEphemeralAgents(sessionId);
        if (existingCount >= MAX_EPHEMERAL_AGENTS_PER_SESSION) {
            throw new BadRequestException({
                code: 'CONV_EPHEMERAL_AGENT_LIMIT',
                message: `单会话最多创建 ${MAX_EPHEMERAL_AGENTS_PER_SESSION} 个临时智能体，当前已有 ${existingCount} 个。`,
            });
        }

        // Step 2: LLM 生成规格
        const spec = await this.llmGenerateAgentSpec(request.userInstruction, request.context);
        if (!spec) {
            throw new BadRequestException({
                code: 'CONV_EPHEMERAL_AGENT_GENERATION_FAILED',
                message: '智能体规格生成失败，请尝试更具体的描述。',
            });
        }

        // Step 3: 安全校验
        this.validateAgentSafety(spec);

        // Step 4: 存储为资产
        const now = new Date();
        const expiresAt = new Date(now.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
        const agentAsset = await this.assetService.createAsset({
            sessionId,
            assetType: 'NOTE',
            title: `临时智能体 ${spec.name}`,
            payload: {
                type: 'EPHEMERAL_AGENT',
                agentCode: spec.agentCode,
                name: spec.name,
                systemPrompt: spec.systemPrompt,
                outputSchema: spec.outputSchema,
                requiredDataSources: spec.requiredDataSources,
                parameterRefs: spec.parameterRefs,
                riskLevel: spec.riskLevel,
                status: 'ACTIVE',
                ttlHours: DEFAULT_TTL_HOURS,
                expiresAt: expiresAt.toISOString(),
                generatedFrom: request.userInstruction.slice(0, 200),
            },
            tags: { ephemeralAgent: true, agentCode: spec.agentCode },
        });

        // Step 5: 记录对话轮次
        await this.prisma.conversationTurn.create({
            data: {
                sessionId,
                role: 'ASSISTANT',
                content: `已创建临时智能体「${spec.name}」(${spec.agentCode})。该智能体将在 ${DEFAULT_TTL_HOURS} 小时后自动过期。`,
                structuredPayload: {
                    type: 'EPHEMERAL_AGENT_CREATED',
                    agentAssetId: agentAsset.id,
                    agentCode: spec.agentCode,
                    name: spec.name,
                    riskLevel: spec.riskLevel,
                    expiresAt: expiresAt.toISOString(),
                } as Prisma.InputJsonValue,
            },
        });

        return {
            id: agentAsset.id,
            sessionId,
            agentCode: spec.agentCode,
            name: spec.name,
            spec,
            status: 'ACTIVE',
            ttlHours: DEFAULT_TTL_HOURS,
            expiresAt: expiresAt.toISOString(),
            createdAt: now.toISOString(),
        };
    }

    // ── 查询临时 Agent ────────────────────────────────────────────────────────

    async listEphemeralAgents(userId: string, sessionId: string): Promise<EphemeralAgent[] | null> {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
            select: { id: true },
        });
        if (!session) return null;

        const assets = await this.prisma.conversationAsset.findMany({
            where: {
                sessionId,
                assetType: 'NOTE',
                title: { startsWith: '临时智能体' },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        const now = new Date();
        return assets
            .map((asset) => this.toEphemeralAgent(asset, sessionId, now))
            .filter((agent): agent is EphemeralAgent => Boolean(agent));
    }

    async getEphemeralAgent(
        userId: string,
        sessionId: string,
        agentAssetId: string,
    ): Promise<EphemeralAgent | null> {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
            select: { id: true },
        });
        if (!session) return null;

        const asset = await this.prisma.conversationAsset.findFirst({
            where: { id: agentAssetId, sessionId, assetType: 'NOTE' },
        });
        if (!asset || !asset.title.startsWith('临时智能体')) return null;

        return this.toEphemeralAgent(asset, sessionId, new Date());
    }

    // ── 获取可用 Agent 列表（含临时+持久化）─────────────────────────────────────

    async getAvailableAgents(
        userId: string,
        sessionId: string,
    ): Promise<Array<{ agentCode: string; name: string; source: 'EPHEMERAL' | 'PUBLISHED' }>> {
        const agents: Array<{ agentCode: string; name: string; source: 'EPHEMERAL' | 'PUBLISHED' }> = [];

        // 临时 Agent
        const ephemeralAgents = await this.listEphemeralAgents(userId, sessionId);
        if (ephemeralAgents) {
            for (const agent of ephemeralAgents) {
                if (agent.status === 'ACTIVE') {
                    agents.push({ agentCode: agent.agentCode, name: agent.name, source: 'EPHEMERAL' });
                }
            }
        }

        // 持久化 Agent（从 AgentSkill 表获取）
        const publishedSkills = await this.prisma.agentSkill.findMany({
            where: { isActive: true },
            select: { skillCode: true, name: true },
            take: 50,
            orderBy: { updatedAt: 'desc' },
        });
        for (const skill of publishedSkills) {
            agents.push({ agentCode: skill.skillCode, name: skill.name, source: 'PUBLISHED' });
        }

        return agents;
    }

    // ── 清理过期临时 Agent ─────────────────────────────────────────────────────

    async cleanupExpiredAgents(sessionId: string): Promise<number> {
        const now = new Date();
        const assets = await this.prisma.conversationAsset.findMany({
            where: {
                sessionId,
                assetType: 'NOTE',
                title: { startsWith: '临时智能体' },
            },
            take: 50,
        });

        let expiredCount = 0;
        for (const asset of assets) {
            const payload = this.utils.toRecord(asset.payload);
            const expiresAt = this.utils.pickString(payload.expiresAt);
            const status = this.utils.pickString(payload.status);
            if (status === 'ACTIVE' && expiresAt && new Date(expiresAt) < now) {
                await this.prisma.conversationAsset.update({
                    where: { id: asset.id },
                    data: {
                        payload: { ...payload, status: 'EXPIRED' } as Prisma.InputJsonValue,
                    },
                });
                expiredCount += 1;
            }
        }
        return expiredCount;
    }

    // ── Phase 6: 晋升审批 ─────────────────────────────────────────────────────

    /**
     * 将临时 Agent 晋升为持久化能力草稿（AgentSkillDraft）。
     *
     * 流程：
     *   1. 验证临时 Agent 状态（必须 ACTIVE）
     *   2. 创建 AgentSkillDraft 记录
     *   3. 创建晋升任务资产（走审批流程）
     *   4. 更新临时 Agent 状态为 PROMOTED
     */
    async promoteEphemeralAgent(
        userId: string,
        sessionId: string,
        agentAssetId: string,
        dto?: { reviewComment?: string },
    ): Promise<{ draftId: string; promotionTaskAssetId: string; agentCode: string } | null> {
        const agent = await this.getEphemeralAgent(userId, sessionId, agentAssetId);
        if (!agent) return null;

        if (agent.status !== 'ACTIVE') {
            throw new BadRequestException({
                code: 'CONV_EPHEMERAL_AGENT_NOT_ACTIVE',
                message: `临时智能体状态为 ${agent.status}，仅 ACTIVE 状态可晋升。`,
            });
        }

        // 创建 AgentSkillDraft
        const draft = await this.prisma.agentSkillDraft.create({
            data: {
                sessionId,
                ownerUserId: userId,
                gapType: 'NEW_CAPABILITY',
                requiredCapability: `临时智能体「${agent.name}」的能力晋升`,
                suggestedSkillCode: agent.agentCode,
                status: 'READY_FOR_REVIEW',
                riskLevel: agent.spec.riskLevel,
                provisionalEnabled: false,
                draftSpec: {
                    name: agent.name,
                    systemPrompt: agent.spec.systemPrompt,
                    outputSchema: agent.spec.outputSchema,
                    requiredDataSources: agent.spec.requiredDataSources,
                    parameterRefs: agent.spec.parameterRefs,
                    promotedFrom: 'EPHEMERAL_AGENT',
                    originalAssetId: agentAssetId,
                } as Prisma.InputJsonValue,
            },
        });

        // 创建晋升任务资产
        const promotionAsset = await this.assetService.createAsset({
            sessionId,
            assetType: 'NOTE',
            title: `能力晋升任务 ${agent.agentCode}`,
            payload: {
                draftId: draft.id,
                suggestedSkillCode: agent.agentCode,
                hitCount: 0,
                reason: `用户主动晋升临时智能体「${agent.name}」为持久化能力`,
                window: '24h',
                status: 'PENDING_REVIEW',
                reviewComment: dto?.reviewComment?.trim() || null,
                generatedAt: new Date().toISOString(),
            },
            tags: { taskType: 'PROMOTION_TASK', draftId: draft.id },
        });

        // 更新临时 Agent 状态
        const agentAsset = await this.prisma.conversationAsset.findFirst({
            where: { id: agentAssetId, sessionId },
        });
        if (agentAsset) {
            const payload = this.utils.toRecord(agentAsset.payload);
            await this.prisma.conversationAsset.update({
                where: { id: agentAssetId },
                data: {
                    payload: {
                        ...payload,
                        status: 'PROMOTED',
                        promotedDraftId: draft.id,
                        promotedAt: new Date().toISOString(),
                    } as Prisma.InputJsonValue,
                },
            });
        }

        // 记录对话轮次
        await this.prisma.conversationTurn.create({
            data: {
                sessionId,
                role: 'ASSISTANT',
                content: `临时智能体「${agent.name}」已提交晋升审批。审批通过后将成为可复用的持久化能力。`,
                structuredPayload: {
                    type: 'EPHEMERAL_AGENT_PROMOTED',
                    agentAssetId,
                    draftId: draft.id,
                    agentCode: agent.agentCode,
                } as Prisma.InputJsonValue,
            },
        });

        return { draftId: draft.id, promotionTaskAssetId: promotionAsset.id, agentCode: agent.agentCode };
    }

    // ── Phase 6: 会话成本统计 ──────────────────────────────────────────────────

    /**
     * 获取会话级成本统计（临时 Agent/Workflow 数量 + 状态分布）。
     * 用于安全仪表盘和资源控制。
     */
    async getSessionCostSummary(userId: string, sessionId: string): Promise<{
        ephemeralAgents: { total: number; active: number; expired: number; promoted: number };
        ephemeralWorkflows: { total: number; active: number; expired: number };
        limits: { maxAgentsPerSession: number; maxNodesPerWorkflow: number; defaultTtlHours: number };
    } | null> {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
            select: { id: true },
        });
        if (!session) return null;

        const allAssets = await this.prisma.conversationAsset.findMany({
            where: { sessionId, assetType: 'NOTE', title: { startsWith: '临时' } },
            select: { payload: true, title: true },
            take: 100,
        });

        const agentStats = { total: 0, active: 0, expired: 0, promoted: 0 };
        const workflowStats = { total: 0, active: 0, expired: 0 };

        for (const asset of allAssets) {
            const payload = this.utils.toRecord(asset.payload);
            const type = this.utils.pickString(payload.type);
            const status = this.utils.pickString(payload.status);

            if (type === 'EPHEMERAL_AGENT') {
                agentStats.total += 1;
                if (status === 'ACTIVE') agentStats.active += 1;
                else if (status === 'EXPIRED') agentStats.expired += 1;
                else if (status === 'PROMOTED') agentStats.promoted += 1;
            } else if (type === 'EPHEMERAL_WORKFLOW') {
                workflowStats.total += 1;
                if (status === 'ACTIVE') workflowStats.active += 1;
                else if (status === 'EXPIRED') workflowStats.expired += 1;
            }
        }

        return {
            ephemeralAgents: agentStats,
            ephemeralWorkflows: workflowStats,
            limits: {
                maxAgentsPerSession: MAX_EPHEMERAL_AGENTS_PER_SESSION,
                maxNodesPerWorkflow: 8,
                defaultTtlHours: DEFAULT_TTL_HOURS,
            },
        };
    }

    // ── Phase 5: 动态工作流组装 ───────────────────────────────────────────────

    /**
     * 根据用户自然语言编排意图，通过 LLM 生成临时工作流 DSL。
     *
     * 流程：
     *   1. 收集会话内可用 Agent（临时 + 持久化）
     *   2. LLM 生成工作流 DSL（nodes + edges）
     *   3. DSL 安全校验（节点上限、类型白名单、循环检测）
     *   4. 存储为 EPHEMERAL_WORKFLOW 资产
     */
    async assembleEphemeralWorkflow(
        userId: string,
        sessionId: string,
        request: { userInstruction: string; context?: string },
    ): Promise<EphemeralWorkflow | null> {
        const availableAgents = await this.getAvailableAgents(userId, sessionId);
        if (!availableAgents.length) return null;

        const model = await this.aiModelService.getSystemModelConfig();
        if (!model) return null;

        try {
            const provider = this.aiProviderFactory.getProvider(model.provider);
            const systemPrompt = [
                '你是工作流编排专家。根据用户需求和可用智能体列表，生成工作流 DSL。',
                '请严格输出 JSON，不要输出 markdown 或其他格式。',
                '',
                'JSON 结构：',
                '{',
                '  "name": "工作流名称",',
                '  "mode": "LINEAR" | "DAG",',
                '  "nodes": [',
                '    { "id": "n1", "type": "agent-call", "label": "节点名", "config": { "agentCode": "..." } }',
                '  ],',
                '  "edges": [{ "from": "n1", "to": "n2" }]',
                '}',
                '',
                '示例输入：「先用供应链Agent分析风险，再用市场Agent做验证，最后汇总」',
                '示例输出：',
                '{"name":"供应链风险交叉验证","mode":"LINEAR","nodes":[{"id":"n1","type":"agent-call","label":"供应链风险分析","config":{"agentCode":"EPHEMERAL_SUPPLY_CHAIN"}},{"id":"n2","type":"agent-call","label":"市场验证","config":{"agentCode":"EPHEMERAL_MARKET"}},{"id":"n3","type":"join","label":"汇总结论","config":{}}],"edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}',
                '',
                '要求：',
                '- 节点 type 只能是：agent-call, data-fetch, formula-calc, join',
                '- 节点数量不超过 8 个',
                '- agent-call 类型的 agentCode 必须来自可用代理列表',
                '- 如果是简单顺序执行用 LINEAR；有并行分支用 DAG',
                '- 最后一个节点通常是 join 类型（汇总结果）',
            ].join('\n');

            const agentList = availableAgents.map((a) => `${a.agentCode} (${a.name}, ${a.source})`).join('\n');
            const userPrompt = JSON.stringify({
                userInstruction: request.userInstruction.slice(0, 500),
                availableAgents: agentList,
                ...(request.context ? { context: request.context.slice(0, 300) } : {}),
            }, null, 2);

            const raw = await provider.generateResponse(systemPrompt, userPrompt, {
                modelName: model.modelId,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
                wireApi: model.wireApi,
                temperature: 0.2,
                maxTokens: 800,
                timeoutSeconds: 15,
                maxRetries: 1,
            });

            const parsed = this.parseJsonObject(raw);
            if (!parsed) return null;

            const dsl = this.normalizeDsl(parsed);
            this.validateEphemeralDsl(dsl);

            // 存储为资产
            const now = new Date();
            const expiresAt = new Date(now.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
            const workflowAsset = await this.assetService.createAsset({
                sessionId,
                assetType: 'NOTE',
                title: `临时工作流 ${dsl.name}`,
                payload: {
                    type: 'EPHEMERAL_WORKFLOW',
                    ...dsl,
                    status: 'ACTIVE',
                    ttlHours: DEFAULT_TTL_HOURS,
                    expiresAt: expiresAt.toISOString(),
                    generatedFrom: request.userInstruction.slice(0, 200),
                },
                tags: { ephemeralWorkflow: true },
            });

            return {
                id: workflowAsset.id,
                sessionId,
                name: dsl.name,
                mode: dsl.mode,
                nodes: dsl.nodes,
                edges: dsl.edges,
                status: 'ACTIVE',
                ttlHours: DEFAULT_TTL_HOURS,
                expiresAt: expiresAt.toISOString(),
                createdAt: now.toISOString(),
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            return null;
        }
    }

    // ── Phase 5: 临时参数/规则覆盖 ──────────────────────────────────────────

    /**
     * 从用户自然语言中提取参数覆盖，合并到会话的 currentSlots。
     *
     * 例如：「把风险阈值调到 EXTREME，忽略物流因素」
     * → paramOverrides: { blockWhenRiskGte: 'EXTREME' }
     * → nodeSkips: ['logistics_analysis']
     */
    async applyEphemeralOverrides(
        userId: string,
        sessionId: string,
        userMessage: string,
    ): Promise<EphemeralOverrideResult> {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
            select: { id: true, currentSlots: true },
        });
        if (!session) {
            throw new BadRequestException({ code: 'CONV_SESSION_NOT_FOUND', message: '会话不存在' });
        }

        const model = await this.aiModelService.getSystemModelConfig();
        if (!model) {
            return { paramOverrides: {}, ruleOverrides: {}, nodeSkips: [], applied: false };
        }

        try {
            const provider = this.aiProviderFactory.getProvider(model.provider);
            const systemPrompt = [
                '你是参数调整专家。从用户的自然语言中提取参数和规则覆盖。',
                '请严格输出 JSON，不要输出 markdown。',
                'JSON 结构：',
                '{',
                '  "paramOverrides": {"参数名": "新值", ...},',
                '  "ruleOverrides": {"规则名": "新值", ...},',
                '  "nodeSkips": ["要跳过的节点ID", ...]',
                '}',
                '可覆盖参数包括：blockWhenRiskGte, minHitScore, lookbackDays, timeRange, topic, regions 等。',
                '风险等级值：NONE, LOW, MEDIUM, HIGH, EXTREME。',
                '如果用户没提到参数覆盖，返回空对象。',
            ].join('\n');

            const currentSlots = this.utils.toRecord(session.currentSlots);
            const userPrompt = JSON.stringify({
                userMessage: userMessage.slice(0, 500),
                currentSlots: Object.keys(currentSlots).slice(0, 10),
            }, null, 2);

            const raw = await provider.generateResponse(systemPrompt, userPrompt, {
                modelName: model.modelId,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
                wireApi: model.wireApi,
                temperature: 0.1,
                maxTokens: 300,
                timeoutSeconds: 10,
                maxRetries: 1,
            });

            const parsed = this.parseJsonObject(raw);
            if (!parsed) {
                return { paramOverrides: {}, ruleOverrides: {}, nodeSkips: [], applied: false };
            }

            const paramOverrides = typeof parsed.paramOverrides === 'object' && parsed.paramOverrides
                ? (parsed.paramOverrides as Record<string, unknown>) : {};
            const ruleOverrides = typeof parsed.ruleOverrides === 'object' && parsed.ruleOverrides
                ? (parsed.ruleOverrides as Record<string, unknown>) : {};
            const nodeSkips = Array.isArray(parsed.nodeSkips)
                ? parsed.nodeSkips.filter((i): i is string => typeof i === 'string') : [];

            const hasOverrides = Object.keys(paramOverrides).length > 0
                || Object.keys(ruleOverrides).length > 0
                || nodeSkips.length > 0;

            if (hasOverrides) {
                await this.prisma.conversationSession.update({
                    where: { id: sessionId },
                    data: {
                        currentSlots: {
                            ...currentSlots,
                            ...paramOverrides,
                            _ephemeralRuleOverrides: ruleOverrides,
                            _skipNodes: nodeSkips,
                        } as Prisma.InputJsonValue,
                    },
                });
            }

            return { paramOverrides, ruleOverrides, nodeSkips, applied: hasOverrides };
        } catch {
            return { paramOverrides: {}, ruleOverrides: {}, nodeSkips: [], applied: false };
        }
    }

    // ── DSL 校验防护栏 ─────────────────────────────────────────────────────────

    private validateEphemeralDsl(dsl: EphemeralWorkflowDsl): void {
        const MAX_NODES = 8;
        const MAX_AGENT_CALLS = 5;
        const ALLOWED_NODE_TYPES = ['agent-call', 'data-fetch', 'formula-calc', 'join'];

        // 节点数量
        if (dsl.nodes.length > MAX_NODES) {
            throw new BadRequestException({
                code: 'CONV_EPHEMERAL_WORKFLOW_TOO_MANY_NODES',
                message: `临时工作流最多 ${MAX_NODES} 个节点，当前 ${dsl.nodes.length} 个。`,
            });
        }

        // Agent 调用数量
        const agentCallCount = dsl.nodes.filter((n) => n.type === 'agent-call').length;
        if (agentCallCount > MAX_AGENT_CALLS) {
            throw new BadRequestException({
                code: 'CONV_EPHEMERAL_WORKFLOW_TOO_MANY_AGENTS',
                message: `临时工作流最多 ${MAX_AGENT_CALLS} 个 Agent 调用，当前 ${agentCallCount} 个。`,
            });
        }

        // 节点类型白名单
        for (const node of dsl.nodes) {
            if (!ALLOWED_NODE_TYPES.includes(node.type)) {
                throw new BadRequestException({
                    code: 'CONV_EPHEMERAL_WORKFLOW_INVALID_NODE_TYPE',
                    message: `节点类型 "${node.type}" 不允许在临时工作流中使用。允许类型：${ALLOWED_NODE_TYPES.join(', ')}`,
                });
            }
        }

        // 循环检测（简单 DFS）
        if (dsl.mode === 'DAG') {
            const graph = new Map<string, string[]>();
            for (const node of dsl.nodes) graph.set(node.id, []);
            for (const edge of dsl.edges) {
                const targets = graph.get(edge.from);
                if (targets) targets.push(edge.to);
            }

            const visited = new Set<string>();
            const visiting = new Set<string>();
            const hasCycle = (nodeId: string): boolean => {
                if (visiting.has(nodeId)) return true;
                if (visited.has(nodeId)) return false;
                visiting.add(nodeId);
                for (const next of graph.get(nodeId) ?? []) {
                    if (hasCycle(next)) return true;
                }
                visiting.delete(nodeId);
                visited.add(nodeId);
                return false;
            };

            for (const node of dsl.nodes) {
                if (hasCycle(node.id)) {
                    throw new BadRequestException({
                        code: 'CONV_EPHEMERAL_WORKFLOW_CYCLE',
                        message: '临时工作流 DSL 存在循环依赖，不允许执行。',
                    });
                }
            }
        }

        // 节点 ID 唯一性
        const nodeIds = new Set<string>();
        for (const node of dsl.nodes) {
            if (nodeIds.has(node.id)) {
                throw new BadRequestException({
                    code: 'CONV_EPHEMERAL_WORKFLOW_DUPLICATE_NODE',
                    message: `节点 ID "${node.id}" 重复。`,
                });
            }
            nodeIds.add(node.id);
        }

        // 边引用的节点必须存在
        for (const edge of dsl.edges) {
            if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
                throw new BadRequestException({
                    code: 'CONV_EPHEMERAL_WORKFLOW_INVALID_EDGE',
                    message: `边 ${edge.from} → ${edge.to} 引用了不存在的节点。`,
                });
            }
        }
    }

    private normalizeDsl(parsed: Record<string, unknown>): EphemeralWorkflowDsl {
        const name = this.utils.pickString(parsed.name) ?? '临时工作流';
        const modeRaw = this.utils.pickString(parsed.mode)?.toUpperCase();
        const mode: 'LINEAR' | 'DAG' = modeRaw === 'DAG' ? 'DAG' : 'LINEAR';

        const nodes: EphemeralWorkflowNode[] = Array.isArray(parsed.nodes)
            ? parsed.nodes.map((item, idx) => {
                const record = this.utils.toRecord(item);
                return {
                    id: this.utils.pickString(record.id) ?? `n${idx + 1}`,
                    type: this.utils.pickString(record.type) ?? 'agent-call',
                    label: this.utils.pickString(record.label) ?? `节点 ${idx + 1}`,
                    config: typeof record.config === 'object' && record.config
                        ? (record.config as Record<string, unknown>) : {},
                };
            })
            : [];

        const edges: EphemeralWorkflowEdge[] = Array.isArray(parsed.edges)
            ? parsed.edges.map((item) => {
                const record = this.utils.toRecord(item);
                return {
                    from: this.utils.pickString(record.from) ?? '',
                    to: this.utils.pickString(record.to) ?? '',
                    condition: this.utils.pickString(record.condition) ?? undefined,
                };
            }).filter((e) => e.from && e.to)
            : [];

        // LINEAR 模式自动补边
        if (mode === 'LINEAR' && edges.length === 0 && nodes.length > 1) {
            for (let i = 0; i < nodes.length - 1; i++) {
                edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
            }
        }

        return { name, mode, nodes, edges };
    }

    // ── Private: LLM 生成 ─────────────────────────────────────────────────────

    private async llmGenerateAgentSpec(
        userInstruction: string,
        context?: string,
    ): Promise<EphemeralAgentSpec | null> {
        const model = await this.aiModelService.getSystemModelConfig();
        if (!model) return null;

        try {
            const provider = this.aiProviderFactory.getProvider(model.provider);
            const systemPrompt = [
                '你是智能体架构专家。根据用户需求生成临时智能体的规格。',
                '请严格输出 JSON，不要输出 markdown 或其他格式。',
                '',
                '输出 JSON 结构：',
                '{',
                '  "agentCode": "EPHEMERAL_xxx"（大写下划线格式，前缀 EPHEMERAL_）,',
                '  "name": "智能体名称"（中文，简洁描述功能）,',
                '  "systemPrompt": "你是...专家，你的任务是..."（详细的系统提示词）,',
                '  "outputSchema": {"字段名": "类型说明", ...}（输出结构定义）,',
                '  "requiredDataSources": ["数据源1", ...]（需要的数据源，如 MARKET_INTEL_INTERNAL_DB）,',
                '  "parameterRefs": ["参数名1", ...]（依赖的输入参数）,',
                '  "riskLevel": "LOW" | "MEDIUM"（风险等级，纯查询为 LOW，数据处理为 MEDIUM）',
                '}',
                '',
                '示例输入：「创建一个分析供应链风险的智能体」',
                '示例输出：',
                '{"agentCode":"EPHEMERAL_SUPPLY_CHAIN_RISK","name":"供应链风险分析师","systemPrompt":"你是大宗商品供应链风险分析专家。你的任务是分析全球供应链中的物流瓶颈、原材料短缺、关税政策变动等风险因子，评估对价格的潜在影响，并给出风险等级和应对建议。输出应包含核心观点、置信度和数据依据。","outputSchema":{"thesis":"string","confidence":"number","riskFactors":"RiskFactor[]","recommendation":"string"},"requiredDataSources":["MARKET_INTEL_INTERNAL_DB","NEWS_FEED"],"parameterRefs":["commodity","regions","timeRange"],"riskLevel":"LOW"}',
                '',
                '要求：',
                '- systemPrompt 要详细，至少 80 字，明确角色定位和输出要求',
                '- outputSchema 至少包含 thesis/conclusion 和 confidence 字段',
                '- riskLevel 只允许 LOW 或 MEDIUM（临时 Agent 不允许 HIGH）',
                '- requiredDataSources 不能包含 EXTERNAL_API、DATABASE_WRITE、WEBHOOK_CALL',
            ].join('\n');

            const userPrompt = JSON.stringify({
                userInstruction,
                ...(context ? { conversationContext: context.slice(0, 500) } : {}),
            }, null, 2);

            const raw = await provider.generateResponse(systemPrompt, userPrompt, {
                modelName: model.modelId,
                apiKey: model.apiKey,
                apiUrl: model.apiUrl,
                wireApi: model.wireApi,
                temperature: 0.3,
                maxTokens: 600,
                timeoutSeconds: 15,
                maxRetries: 1,
            });

            const parsed = this.parseJsonObject(raw);
            if (!parsed) return null;

            const agentCode = this.utils.pickString(parsed.agentCode);
            const name = this.utils.pickString(parsed.name);
            const systemPromptGen = this.utils.pickString(parsed.systemPrompt);
            if (!agentCode || !name || !systemPromptGen) return null;

            const normalizedCode = agentCode.toUpperCase().startsWith('EPHEMERAL_')
                ? agentCode.toUpperCase()
                : `EPHEMERAL_${agentCode.toUpperCase()}`;

            const riskLevelRaw = this.utils.pickString(parsed.riskLevel)?.toUpperCase();
            const riskLevel: 'LOW' | 'MEDIUM' = riskLevelRaw === 'MEDIUM' ? 'MEDIUM' : 'LOW';

            return {
                agentCode: normalizedCode,
                name,
                systemPrompt: systemPromptGen,
                outputSchema: typeof parsed.outputSchema === 'object' && parsed.outputSchema
                    ? (parsed.outputSchema as Record<string, unknown>) : { thesis: 'string', confidence: 'number' },
                requiredDataSources: Array.isArray(parsed.requiredDataSources)
                    ? parsed.requiredDataSources.filter((i): i is string => typeof i === 'string') : [],
                parameterRefs: Array.isArray(parsed.parameterRefs)
                    ? parsed.parameterRefs.filter((i): i is string => typeof i === 'string') : [],
                riskLevel,
            };
        } catch {
            return null;
        }
    }

    // ── Private: 安全校验 ─────────────────────────────────────────────────────

    private validateAgentSafety(spec: EphemeralAgentSpec): void {
        const blockedSources = spec.requiredDataSources.filter((ds) =>
            BLOCKED_DATA_SOURCES.includes(ds.toUpperCase()),
        );
        if (blockedSources.length > 0) {
            throw new BadRequestException({
                code: 'CONV_EPHEMERAL_AGENT_UNSAFE',
                message: `临时智能体不允许使用以下数据源：${blockedSources.join('、')}。请调整需求。`,
            });
        }

        const promptLower = spec.systemPrompt.toLowerCase();
        const dangerousPatterns = ['delete from', 'drop table', 'api_key', 'secret', 'password'];
        for (const pattern of dangerousPatterns) {
            if (promptLower.includes(pattern)) {
                throw new BadRequestException({
                    code: 'CONV_EPHEMERAL_AGENT_UNSAFE_PROMPT',
                    message: `智能体的系统提示词包含敏感操作关键词（${pattern}），不允许创建。`,
                });
            }
        }
    }

    // ── Private: Helpers ──────────────────────────────────────────────────────

    private async countActiveEphemeralAgents(sessionId: string): Promise<number> {
        const assets = await this.prisma.conversationAsset.findMany({
            where: {
                sessionId,
                assetType: 'NOTE',
                title: { startsWith: '临时智能体' },
            },
            select: { payload: true },
            take: 20,
        });
        return assets.filter((a) => {
            const payload = this.utils.toRecord(a.payload);
            const status = this.utils.pickString(payload.status);
            return status === 'ACTIVE';
        }).length;
    }

    private toEphemeralAgent(
        asset: { id: string; payload: Prisma.JsonValue; createdAt: Date },
        sessionId: string,
        now: Date,
    ): EphemeralAgent | null {
        const payload = this.utils.toRecord(asset.payload);
        if (this.utils.pickString(payload.type) !== 'EPHEMERAL_AGENT') return null;

        const agentCode = this.utils.pickString(payload.agentCode);
        const name = this.utils.pickString(payload.name);
        if (!agentCode || !name) return null;

        const expiresAt = this.utils.pickString(payload.expiresAt);
        const isExpired = expiresAt && new Date(expiresAt) < now;
        const rawStatus = this.utils.pickString(payload.status);
        const status: 'ACTIVE' | 'EXPIRED' | 'PROMOTED' =
            isExpired ? 'EXPIRED' : (rawStatus === 'PROMOTED' ? 'PROMOTED' : (rawStatus === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE'));

        const spec: EphemeralAgentSpec = {
            agentCode,
            name,
            systemPrompt: this.utils.pickString(payload.systemPrompt) ?? '',
            outputSchema: typeof payload.outputSchema === 'object' && payload.outputSchema
                ? (payload.outputSchema as Record<string, unknown>) : {},
            requiredDataSources: Array.isArray(payload.requiredDataSources)
                ? payload.requiredDataSources.filter((i): i is string => typeof i === 'string') : [],
            parameterRefs: Array.isArray(payload.parameterRefs)
                ? payload.parameterRefs.filter((i): i is string => typeof i === 'string') : [],
            riskLevel: this.utils.pickString(payload.riskLevel) === 'MEDIUM' ? 'MEDIUM' : 'LOW',
        };

        return {
            id: asset.id, sessionId, agentCode, name, spec, status,
            ttlHours: typeof payload.ttlHours === 'number' ? payload.ttlHours : DEFAULT_TTL_HOURS,
            expiresAt: expiresAt ?? '',
            createdAt: asset.createdAt.toISOString(),
        };
    }

    private parseJsonObject(value: string): Record<string, unknown> | null {
        let text = value.trim();
        if (!text) return null;

        // Phase 10: 剥离 markdown 代码围栏
        const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) text = fenceMatch[1].trim();

        // 策略 1: 直接解析
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch { /* 继续尝试 */ }

        // 策略 2: 提取第一个 平衡的 {...} 块（非贪婪）
        const objStart = text.indexOf('{');
        let objMatch: string | null = null;
        if (objStart >= 0) {
            let depth = 0;
            let inStr = false;
            let escape = false;
            for (let i = objStart; i < text.length; i++) {
                const ch = text[i];
                if (escape) { escape = false; continue; }
                if (ch === '\\') { escape = true; continue; }
                if (ch === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (ch === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        objMatch = text.slice(objStart, i + 1);
                        break;
                    }
                }
            }
        }
        if (objMatch) {
            try {
                const parsed = JSON.parse(objMatch);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
            } catch { /* 继续尝试 */ }
        }

        // 策略 3: 修复常见 LLM 输出问题（尾逗号、单引号）
        if (objMatch) {
            try {
                const fixed = objMatch
                    .replace(/,\s*([\]}])/g, '$1')  // 移除尾逗号
                    .replace(/'/g, '"');               // 单引号 → 双引号
                const parsed = JSON.parse(fixed);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
            } catch { /* ignore */ }
        }

        return null;
    }
}

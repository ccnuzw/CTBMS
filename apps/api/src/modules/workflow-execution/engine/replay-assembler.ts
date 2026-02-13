import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode, WorkflowEdge, WorkflowDsl } from '@packages/types';
import { EvidenceItem, EvidenceBundleResult } from './evidence-collector';
import { DataLineageEntry } from './variable-resolver';

/**
 * 节点执行快照（用于回放）
 */
export interface NodeExecutionSnapshot {
    /** 节点 ID */
    nodeId: string;
    /** 节点名称 */
    nodeName: string;
    /** 节点类型 */
    nodeType: string;
    /** 执行状态 */
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    /** 执行开始时间 */
    startedAt: string;
    /** 执行完成时间 */
    completedAt: string;
    /** 执行时长 (ms) */
    durationMs: number;
    /** 重试次数 */
    attempts: number;
    /** 输入快照 */
    inputSnapshot: Record<string, unknown>;
    /** 输出快照 */
    outputSnapshot: Record<string, unknown>;
    /** 错误信息 */
    errorMessage?: string;
    /** 失败分类 */
    failureCategory?: string;
    /** 跳过原因 */
    skipReason?: string;
}

/**
 * 执行回放完整包
 */
export interface ExecutionReplayBundle {
    /** 回放版本号 */
    version: string;
    /** 执行基本信息 */
    execution: {
        id: string;
        workflowDefinitionId: string;
        workflowVersionId: string;
        triggerType: string;
        triggerUserId: string;
        status: string;
        startedAt: string;
        completedAt: string;
        totalDurationMs: number;
        paramSnapshot?: Record<string, unknown>;
    };
    /** DSL 快照 */
    dslSnapshot: {
        nodes: Array<{ id: string; name: string; type: string }>;
        edges: Array<{ source: string; target: string; edgeType?: string }>;
        nodeCount: number;
        edgeCount: number;
    };
    /** 按执行顺序排列的节点快照 */
    timeline: NodeExecutionSnapshot[];
    /** 证据链聚合 */
    evidenceBundle: EvidenceBundleResult;
    /** 数据血缘图 */
    dataLineage: Record<string, DataLineageEntry[]>;
    /**
     * 决策输出摘要 — 对应设计方案 9.2 统一输出对象
     */
    decisionOutput: {
        action?: string;
        confidence?: number;
        riskLevel?: string;
        targetWindow?: string;
        reasoningSummary?: string;
        blockers?: string[];
        publishable: boolean;
    } | null;
    /** 统计摘要 */
    stats: {
        totalNodes: number;
        executedNodes: number;
        successNodes: number;
        failedNodes: number;
        skippedNodes: number;
        totalDurationMs: number;
        avgNodeDurationMs: number;
        maxNodeDurationMs: number;
        maxNodeId?: string;
        softFailureCount: number;
    };
    /** 生成时间 */
    assembledAt: string;
}

/**
 * 回放组装器
 *
 * 从执行过程数据组装完整的回放 JSON，支持:
 * 1. 时间线回放（按执行顺序的节点快照）
 * 2. 证据链整合
 * 3. 数据血缘追踪
 * 4. 决策输出摘要
 * 5. 统计概要
 */
@Injectable()
export class ReplayAssembler {
    private readonly logger = new Logger(ReplayAssembler.name);

    private static readonly REPLAY_VERSION = '1.0.0';

    /**
     * 组装完整回放包
     */
    assemble(params: {
        executionId: string;
        workflowDefinitionId: string;
        workflowVersionId: string;
        triggerType: string;
        triggerUserId: string;
        status: string;
        startedAt: Date;
        completedAt: Date;
        paramSnapshot?: Record<string, unknown>;
        dsl: WorkflowDsl;
        nodeSnapshots: NodeExecutionSnapshot[];
        evidenceBundle: EvidenceBundleResult;
        dataLineage: Record<string, DataLineageEntry[]>;
    }): ExecutionReplayBundle {
        const totalDurationMs = params.completedAt.getTime() - params.startedAt.getTime();

        // 构建统计
        const stats = this.buildStats(params.nodeSnapshots, totalDurationMs);

        // 提取决策输出
        const decisionOutput = this.extractDecisionOutput(
            params.nodeSnapshots,
            params.evidenceBundle,
        );

        // 精简 DSL 快照
        const dslSnapshot = {
            nodes: params.dsl.nodes.map((n) => ({
                id: n.id,
                name: n.name,
                type: n.type,
            })),
            edges: params.dsl.edges.map((e) => ({
                source: e.from,
                target: e.to,
                edgeType: e.edgeType,
            })),
            nodeCount: params.dsl.nodes.length,
            edgeCount: params.dsl.edges.length,
        };

        return {
            version: ReplayAssembler.REPLAY_VERSION,
            execution: {
                id: params.executionId,
                workflowDefinitionId: params.workflowDefinitionId,
                workflowVersionId: params.workflowVersionId,
                triggerType: params.triggerType,
                triggerUserId: params.triggerUserId,
                status: params.status,
                startedAt: params.startedAt.toISOString(),
                completedAt: params.completedAt.toISOString(),
                totalDurationMs,
                paramSnapshot: params.paramSnapshot,
            },
            dslSnapshot,
            timeline: params.nodeSnapshots,
            evidenceBundle: params.evidenceBundle,
            dataLineage: params.dataLineage,
            decisionOutput,
            stats,
            assembledAt: new Date().toISOString(),
        };
    }

    /**
     * 从 DB 查询结果构建节点快照列表
     */
    buildNodeSnapshots(
        nodeExecutions: Array<{
            nodeId: string;
            nodeType: string;
            status: string;
            startedAt: Date | null;
            completedAt: Date | null;
            durationMs: number | null;
            errorMessage: string | null;
            failureCategory: string | null;
            inputSnapshot: unknown;
            outputSnapshot: unknown;
        }>,
        dslNodes: WorkflowNode[],
    ): NodeExecutionSnapshot[] {
        const nodeNameMap = new Map(dslNodes.map((n) => [n.id, n.name]));

        return nodeExecutions.map((ne) => {
            const output = this.toRecord(ne.outputSnapshot);
            const meta = output._meta as Record<string, unknown> | undefined;

            return {
                nodeId: ne.nodeId,
                nodeName: nodeNameMap.get(ne.nodeId) ?? ne.nodeId,
                nodeType: ne.nodeType,
                status: ne.status as 'SUCCESS' | 'FAILED' | 'SKIPPED',
                startedAt: ne.startedAt?.toISOString() ?? '',
                completedAt: ne.completedAt?.toISOString() ?? '',
                durationMs: ne.durationMs ?? 0,
                attempts: (meta?.attempts as number) ?? 1,
                inputSnapshot: this.toRecord(ne.inputSnapshot),
                outputSnapshot: output,
                errorMessage: ne.errorMessage ?? undefined,
                failureCategory: ne.failureCategory ?? undefined,
                skipReason: output.skipped ? (output.skipReason as string) : undefined,
            };
        });
    }

    // ────────────────── 私有方法 ──────────────────

    /**
     * 构建统计摘要
     */
    private buildStats(
        snapshots: NodeExecutionSnapshot[],
        totalDurationMs: number,
    ): ExecutionReplayBundle['stats'] {
        const executed = snapshots.filter((s) => s.status !== 'SKIPPED');
        const success = snapshots.filter((s) => s.status === 'SUCCESS');
        const failed = snapshots.filter((s) => s.status === 'FAILED');
        const skipped = snapshots.filter((s) => s.status === 'SKIPPED');

        let maxDuration = 0;
        let maxNodeId: string | undefined;
        let totalNodeDuration = 0;

        for (const snap of executed) {
            totalNodeDuration += snap.durationMs;
            if (snap.durationMs > maxDuration) {
                maxDuration = snap.durationMs;
                maxNodeId = snap.nodeId;
            }
        }

        return {
            totalNodes: snapshots.length,
            executedNodes: executed.length,
            successNodes: success.length,
            failedNodes: failed.length,
            skippedNodes: skipped.length,
            totalDurationMs,
            avgNodeDurationMs: executed.length > 0 ? Math.round(totalNodeDuration / executed.length) : 0,
            maxNodeDurationMs: maxDuration,
            maxNodeId,
            softFailureCount: failed.length,
        };
    }

    /**
     * 从节点快照中提取决策输出 (ref: 设计方案 9.2)
     *
     * 优先从最后一个 agent/decision-merge/risk-gate 节点中提取
     */
    private extractDecisionOutput(
        snapshots: NodeExecutionSnapshot[],
        evidenceBundle: EvidenceBundleResult,
    ): ExecutionReplayBundle['decisionOutput'] {
        // 倒序查找决策类节点
        const decisionNodeTypes = new Set([
            'agent-call', 'single-agent', 'decision-merge', 'risk-gate',
        ]);

        const decisionSnapshot = [...snapshots]
            .reverse()
            .find((s) => decisionNodeTypes.has(s.nodeType) && s.status === 'SUCCESS');

        if (!decisionSnapshot) return null;

        const output = decisionSnapshot.outputSnapshot;
        const parsed = output.parsed as Record<string, unknown> | undefined;
        const source = parsed ?? output;

        // 提取决策字段
        const action = (source.action as string) ?? undefined;
        const confidence = (source.confidence as number) ?? undefined;
        const riskLevel = (source.riskLevel ?? output.riskLevel) as string | undefined;
        const targetWindow = (source.targetWindow as string) ?? undefined;
        const reasoningSummary = (source.reasoningSummary ?? source.thesis) as string | undefined;
        const blockers = output.blockers as string[] | undefined;

        // 是否可发布: 强证据 ≥2 且无阻断项
        const publishable =
            evidenceBundle.meetsMinStrongEvidence &&
            (!blockers || blockers.length === 0);

        return {
            action,
            confidence,
            riskLevel,
            targetWindow,
            reasoningSummary,
            blockers,
            publishable,
        };
    }

    /**
     * 安全地将 JSON 字段转换为 Record
     */
    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object') return {};
        return value as Record<string, unknown>;
    }
}

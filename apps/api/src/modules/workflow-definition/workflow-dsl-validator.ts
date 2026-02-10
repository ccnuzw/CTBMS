import { Injectable } from '@nestjs/common';
import {
    WorkflowDsl,
    WorkflowValidationIssue,
    WorkflowValidationResult,
    WorkflowValidationStage,
} from '@packages/types';

@Injectable()
export class WorkflowDslValidator {
    validate(dsl: WorkflowDsl, stage: WorkflowValidationStage = 'SAVE'): WorkflowValidationResult {
        const issues: WorkflowValidationIssue[] = [];

        this.validateTopLevelFields(dsl, issues);
        this.validateUniqueness(dsl, issues);
        this.validateEdgeReferences(dsl, issues);
        this.validateOrphanNodes(dsl, issues);
        this.validateLinearMode(dsl, issues);
        this.validateDebateMode(dsl, issues);
        this.validateDagMode(dsl, issues);
        this.validateApprovalOutputs(dsl, issues);
        this.validateJoinQuorum(dsl, issues);
        if (stage === 'PUBLISH') {
            this.validateRiskGateExists(dsl, issues);
        }

        return {
            valid: issues.every((issue) => issue.severity !== 'ERROR'),
            issues,
        };
    }

    private validateTopLevelFields(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        if (!dsl.workflowId || !dsl.name || !dsl.mode || !dsl.nodes || !dsl.edges) {
            issues.push({
                code: 'WF001',
                severity: 'ERROR',
                message: 'workflowId、name、mode、nodes、edges 为必填字段',
            });
        }
    }

    private validateUniqueness(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        const nodeIds = new Set<string>();
        for (const node of dsl.nodes) {
            if (nodeIds.has(node.id)) {
                issues.push({
                    code: 'WF002',
                    severity: 'ERROR',
                    message: `节点 ID 重复: ${node.id}`,
                    nodeId: node.id,
                });
            }
            nodeIds.add(node.id);
        }

        const edgeIds = new Set<string>();
        for (const edge of dsl.edges) {
            if (edgeIds.has(edge.id)) {
                issues.push({
                    code: 'WF002',
                    severity: 'ERROR',
                    message: `连线 ID 重复: ${edge.id}`,
                    edgeId: edge.id,
                });
            }
            edgeIds.add(edge.id);
        }
    }

    private validateEdgeReferences(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        const nodeIds = new Set(dsl.nodes.map((node) => node.id));

        for (const edge of dsl.edges) {
            if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
                issues.push({
                    code: 'WF003',
                    severity: 'ERROR',
                    message: `连线 ${edge.id} 的 from/to 节点不存在`,
                    edgeId: edge.id,
                });
            }
        }
    }

    private validateOrphanNodes(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        const inCount = new Map<string, number>();
        const outCount = new Map<string, number>();

        for (const node of dsl.nodes) {
            inCount.set(node.id, 0);
            outCount.set(node.id, 0);
        }

        for (const edge of dsl.edges) {
            outCount.set(edge.from, (outCount.get(edge.from) || 0) + 1);
            inCount.set(edge.to, (inCount.get(edge.to) || 0) + 1);
        }

        for (const node of dsl.nodes) {
            const incoming = inCount.get(node.id) || 0;
            const outgoing = outCount.get(node.id) || 0;
            const isTriggerNode = node.type === 'trigger' || node.type.endsWith('-trigger');
            if (incoming === 0 && outgoing === 0 && !isTriggerNode) {
                issues.push({
                    code: 'WF004',
                    severity: 'ERROR',
                    message: `存在悬空节点: ${node.name}`,
                    nodeId: node.id,
                });
            }
        }
    }

    private validateLinearMode(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        if (dsl.mode !== 'LINEAR') {
            return;
        }

        const incoming = new Map<string, number>();
        const outgoing = new Map<string, number>();

        for (const node of dsl.nodes) {
            incoming.set(node.id, 0);
            outgoing.set(node.id, 0);
        }

        for (const edge of dsl.edges) {
            outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
            incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
        }

        for (const node of dsl.nodes) {
            const inDegree = incoming.get(node.id) || 0;
            const outDegree = outgoing.get(node.id) || 0;
            if (inDegree > 1 || outDegree > 1) {
                issues.push({
                    code: 'WF005',
                    severity: 'ERROR',
                    message: `LINEAR 模式不允许分叉或汇聚: ${node.name}`,
                    nodeId: node.id,
                });
            }
        }
    }

    private validateDebateMode(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        if (dsl.mode !== 'DEBATE') {
            return;
        }

        const nodeTypes = new Set(dsl.nodes.map((node) => node.type));
        const requiredNodeTypes = ['context-builder', 'debate-round', 'judge-agent'];
        const missing = requiredNodeTypes.filter((type) => !nodeTypes.has(type));

        if (missing.length > 0) {
            issues.push({
                code: 'WF101',
                severity: 'ERROR',
                message: `DEBATE 模式缺少必需节点: ${missing.join(', ')}`,
            });
        }
    }

    private validateDagMode(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        if (dsl.mode !== 'DAG') {
            return;
        }

        const hasJoinNode = dsl.nodes.some((node) => node.type === 'join');
        if (!hasJoinNode) {
            issues.push({
                code: 'WF102',
                severity: 'ERROR',
                message: 'DAG 模式必须包含 join 节点',
            });
        }
    }

    private validateApprovalOutputs(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        const nodeMap = new Map(dsl.nodes.map((node) => [node.id, node]));
        const outputNodeTypes = new Set(['notify', 'report-generate', 'dashboard-publish']);
        const outgoingMap = new Map<string, string[]>();

        for (const edge of dsl.edges) {
            const targets = outgoingMap.get(edge.from) || [];
            targets.push(edge.to);
            outgoingMap.set(edge.from, targets);
        }

        for (const node of dsl.nodes) {
            if (node.type !== 'approval') {
                continue;
            }

            const targets = outgoingMap.get(node.id) || [];
            for (const targetId of targets) {
                const targetNode = nodeMap.get(targetId);
                if (!targetNode) {
                    continue;
                }
                if (!outputNodeTypes.has(targetNode.type)) {
                    issues.push({
                        code: 'WF103',
                        severity: 'ERROR',
                        message: `approval 节点后仅允许连接输出节点，当前连接到 ${targetNode.type}`,
                        nodeId: node.id,
                    });
                }
            }
        }
    }

    private validateRiskGateExists(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        const hasRiskGate = dsl.nodes.some((node) => node.type === 'risk-gate');
        if (!hasRiskGate) {
            issues.push({
                code: 'WF104',
                severity: 'ERROR',
                message: '发布前必须包含 risk-gate 节点',
            });
        }
    }

    private validateJoinQuorum(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
        for (const node of dsl.nodes) {
            if (node.type !== 'join') {
                continue;
            }

            const config = node.config as Record<string, unknown>;
            const joinPolicy = config?.joinPolicy;
            const quorumBranches = config?.quorumBranches;

            if (joinPolicy === 'QUORUM') {
                const isValidQuorum =
                    typeof quorumBranches === 'number' && Number.isInteger(quorumBranches) && quorumBranches >= 2;
                if (!isValidQuorum) {
                    issues.push({
                        code: 'WF105',
                        severity: 'ERROR',
                        message: 'joinPolicy=QUORUM 时 quorumBranches 必须为 >= 2 的整数',
                        nodeId: node.id,
                    });
                }
            }
        }
    }
}

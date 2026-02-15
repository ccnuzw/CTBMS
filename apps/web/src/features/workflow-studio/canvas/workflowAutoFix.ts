import { type WorkflowDsl } from '@packages/types';

export interface AutoFixIssue {
    message: string;
}

const AUTO_FIXABLE_CODES = new Set(['WF003', 'WF004', 'WF005', 'WF101', 'WF102', 'WF104', 'WF106']);

const DEFAULT_RUNTIME_POLICY = {
    timeoutMs: 30000,
    retryCount: 1,
    retryBackoffMs: 2000,
    onError: 'FAIL_FAST' as const,
};

export const extractIssueCode = (message: string): string | undefined => {
    const matched = message.match(/(WF\d{3})/);
    return matched?.[1];
};

export const isAutoFixableIssueCode = (code?: string): boolean =>
    Boolean(code && AUTO_FIXABLE_CODES.has(code));

export const getAutoFixableIssueCodes = (issues: AutoFixIssue[]): string[] => {
    const deduped = new Set<string>();
    for (const issue of issues) {
        const code = extractIssueCode(issue.message);
        if (isAutoFixableIssueCode(code)) {
            deduped.add(code as string);
        }
    }
    return [...deduped].sort();
};

const isOutputNodeType = (nodeType: string): boolean =>
    nodeType === 'notify' || nodeType === 'report-generate' || nodeType === 'dashboard-publish';

const isTriggerNodeType = (nodeType: string): boolean =>
    nodeType === 'manual-trigger'
    || nodeType === 'cron-trigger'
    || nodeType === 'api-trigger'
    || nodeType === 'event-trigger';

const buildNextId = (prefix: string, usedIds: Set<string>): string => {
    let index = 1;
    let id = `${prefix}_${index}`;
    while (usedIds.has(id)) {
        index += 1;
        id = `${prefix}_${index}`;
    }
    usedIds.add(id);
    return id;
};

const ensureEdge = (
    edges: WorkflowDsl['edges'],
    usedEdgeIds: Set<string>,
    from: string,
    to: string,
    edgeType: WorkflowDsl['edges'][number]['edgeType'],
) => {
    const exists = edges.some((edge) => edge.from === from && edge.to === to);
    if (exists) {
        return;
    }
    edges.push({
        id: buildNextId('e_auto', usedEdgeIds),
        from,
        to,
        edgeType,
        condition: null,
    });
};

export const hasAutoFixableIssues = (issues: AutoFixIssue[]): boolean =>
    issues.some((issue) => isAutoFixableIssueCode(extractIssueCode(issue.message)));

export const applyAutoFixesToDsl = (
    dsl: WorkflowDsl,
    issues: AutoFixIssue[],
    selectedIssueCodes?: string[],
): { dsl: WorkflowDsl; actions: string[] } => {
    const selected = selectedIssueCodes && selectedIssueCodes.length > 0
        ? new Set(selectedIssueCodes)
        : null;
    const issueCodes = new Set(
        issues
            .map((item) => extractIssueCode(item.message))
            .filter((item): item is string => Boolean(item))
            .filter((code) => isAutoFixableIssueCode(code))
            .filter((code) => (selected ? selected.has(code) : true)),
    );
    const actions: string[] = [];
    const nodes = dsl.nodes.map((node) => ({ ...node, config: { ...(node.config ?? {}) } }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = dsl.edges
        .map((edge) => ({ ...edge }))
        .filter((edge) => {
            if (issueCodes.has('WF003') && (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))) {
                return false;
            }
            return true;
        });
    if (issueCodes.has('WF003')) {
        actions.push('已移除无效连线（端点不存在）');
    }

    const usedNodeIds = new Set(nodes.map((node) => node.id));
    const usedEdgeIds = new Set(edges.map((edge) => edge.id));

    if (issueCodes.has('WF106')) {
        let changed = false;
        for (const node of nodes) {
            if (isTriggerNodeType(node.type) || node.type === 'group') {
                continue;
            }
            node.runtimePolicy = {
                ...DEFAULT_RUNTIME_POLICY,
                ...(node.runtimePolicy ?? {}),
            };
            changed = true;
        }
        if (changed) {
            actions.push('已补齐节点运行策略默认值');
        }
    }

    if (issueCodes.has('WF004')) {
        const incoming = new Set(edges.map((edge) => edge.to));
        const outgoing = new Set(edges.map((edge) => edge.from));
        const removable = nodes
            .filter((node) => {
                if (node.type === 'group' || isTriggerNodeType(node.type)) {
                    return false;
                }
                return !incoming.has(node.id) && !outgoing.has(node.id);
            })
            .map((node) => node.id);
        if (removable.length > 0) {
            const removableSet = new Set(removable);
            for (let i = nodes.length - 1; i >= 0; i -= 1) {
                if (removableSet.has(nodes[i].id)) {
                    nodes.splice(i, 1);
                }
            }
            for (let i = edges.length - 1; i >= 0; i -= 1) {
                if (removableSet.has(edges[i].from) || removableSet.has(edges[i].to)) {
                    edges.splice(i, 1);
                }
            }
            actions.push(`已清理 ${removable.length} 个悬空节点`);
        }
    }

    if (issueCodes.has('WF005') && dsl.mode === 'LINEAR') {
        const grouped = new Map<string, WorkflowDsl['edges']>();
        for (const edge of edges) {
            const list = grouped.get(edge.from);
            if (list) {
                list.push(edge);
            } else {
                grouped.set(edge.from, [edge]);
            }
        }

        const keepEdgeIds = new Set<string>();
        let removedCount = 0;
        for (const siblings of grouped.values()) {
            if (siblings.length <= 1) {
                keepEdgeIds.add(siblings[0].id);
                continue;
            }
            const selected = [...siblings].sort((a, b) => {
                if (a.edgeType !== b.edgeType) {
                    return a.edgeType === 'control-edge' ? -1 : 1;
                }
                return a.id.localeCompare(b.id);
            })[0];
            keepEdgeIds.add(selected.id);
            removedCount += siblings.length - 1;
        }
        if (removedCount > 0) {
            const normalizedEdges = edges.filter((edge) => keepEdgeIds.has(edge.id));
            edges.splice(0, edges.length, ...normalizedEdges);
            actions.push(`已收敛线性分支，移除 ${removedCount} 条冲突连线（请复核主链路）`);
        }
    }

    const getAnchorPosition = (): { x: number; y: number } => {
        if (nodes.length === 0) {
            return { x: 300, y: 200 };
        }
        let maxX = 300;
        let maxY = 120;
        for (const node of nodes) {
            const pos = (node.config?._position as { x?: number; y?: number } | undefined) ?? {};
            maxX = Math.max(maxX, pos.x ?? 300);
            maxY = Math.max(maxY, pos.y ?? 120);
        }
        return { x: maxX + 260, y: maxY + 120 };
    };

    if (issueCodes.has('WF101') && dsl.mode === 'DEBATE') {
        let contextNode = nodes.find((node) => node.type === 'context-builder');
        let debateNode = nodes.find((node) => node.type === 'debate-round');
        let judgeNode = nodes.find((node) => node.type === 'judge-agent');
        const triggerNode = nodes.find((node) => isTriggerNodeType(node.type));
        const anchor = getAnchorPosition();
        let changed = false;

        if (!contextNode) {
            const id = buildNextId('n_context_builder', usedNodeIds);
            contextNode = {
                id,
                type: 'context-builder',
                name: '上下文构建',
                enabled: true,
                config: { _position: { x: anchor.x, y: anchor.y } },
                runtimePolicy: { ...DEFAULT_RUNTIME_POLICY },
            };
            nodes.push(contextNode);
            changed = true;
        }
        if (!debateNode) {
            const id = buildNextId('n_debate_round', usedNodeIds);
            debateNode = {
                id,
                type: 'debate-round',
                name: '辩论回合',
                enabled: true,
                config: {
                    maxRounds: 3,
                    judgePolicy: 'WEIGHTED',
                    _position: { x: anchor.x + 260, y: anchor.y },
                },
                runtimePolicy: { ...DEFAULT_RUNTIME_POLICY },
            };
            nodes.push(debateNode);
            changed = true;
        }
        if (!judgeNode) {
            const id = buildNextId('n_judge_agent', usedNodeIds);
            judgeNode = {
                id,
                type: 'judge-agent',
                name: '裁判节点',
                enabled: true,
                config: { _position: { x: anchor.x + 520, y: anchor.y } },
                runtimePolicy: { ...DEFAULT_RUNTIME_POLICY },
            };
            nodes.push(judgeNode);
            changed = true;
        }
        if (triggerNode && contextNode) {
            ensureEdge(edges, usedEdgeIds, triggerNode.id, contextNode.id, 'control-edge');
        }
        if (contextNode && debateNode) {
            ensureEdge(edges, usedEdgeIds, contextNode.id, debateNode.id, 'data-edge');
        }
        if (debateNode && judgeNode) {
            ensureEdge(edges, usedEdgeIds, debateNode.id, judgeNode.id, 'data-edge');
        }
        if (changed) {
            actions.push('已补齐辩论模式关键节点（上下文/辩论/裁判）');
        }
    }

    if (issueCodes.has('WF102') && dsl.mode === 'DAG') {
        let joinNode = nodes.find((node) => node.type === 'join');
        let changed = false;
        if (!joinNode) {
            const anchor = getAnchorPosition();
            const id = buildNextId('n_join', usedNodeIds);
            joinNode = {
                id,
                type: 'join',
                name: '自动汇聚',
                enabled: true,
                config: { joinPolicy: 'ALL_REQUIRED', _position: { x: anchor.x, y: anchor.y } },
                runtimePolicy: { ...DEFAULT_RUNTIME_POLICY },
            };
            nodes.push(joinNode);
            changed = true;
        }

        const outgoingMap = new Map<string, number>();
        for (const edge of edges) {
            outgoingMap.set(edge.from, (outgoingMap.get(edge.from) ?? 0) + 1);
        }
        const candidates = nodes
            .filter((node) => !isOutputNodeType(node.type) && node.type !== 'join' && node.type !== 'group')
            .filter((node) => (outgoingMap.get(node.id) ?? 0) === 0);
        for (const node of candidates) {
            if (node.id !== joinNode.id) {
                ensureEdge(edges, usedEdgeIds, node.id, joinNode.id, 'data-edge');
            }
        }

        const targetNode = nodes.find((node) => node.type === 'risk-gate')
            ?? nodes.find((node) => isOutputNodeType(node.type));
        if (targetNode && targetNode.id !== joinNode.id) {
            ensureEdge(edges, usedEdgeIds, joinNode.id, targetNode.id, 'control-edge');
        }
        if (changed) {
            actions.push('已补齐 DAG 汇聚节点（join）');
        }
    }

    if (issueCodes.has('WF104')) {
        let riskNode = nodes.find((node) => node.type === 'risk-gate');
        let changed = false;
        if (!riskNode) {
            const anchor = getAnchorPosition();
            const id = buildNextId('n_risk_gate', usedNodeIds);
            riskNode = {
                id,
                type: 'risk-gate',
                name: '风险闸门',
                enabled: true,
                config: {
                    riskProfileCode: 'CORN_RISK_BASE',
                    degradeAction: 'HOLD',
                    _position: { x: anchor.x, y: anchor.y },
                },
                runtimePolicy: { ...DEFAULT_RUNTIME_POLICY },
            };
            nodes.push(riskNode);
            changed = true;
        }

        const outgoingMap = new Map<string, number>();
        for (const edge of edges) {
            outgoingMap.set(edge.from, (outgoingMap.get(edge.from) ?? 0) + 1);
        }

        const terminalUpstreams = nodes.filter((node) => {
            if (node.id === riskNode.id || isOutputNodeType(node.type) || node.type === 'group') {
                return false;
            }
            return (outgoingMap.get(node.id) ?? 0) === 0;
        });
        for (const node of terminalUpstreams) {
            ensureEdge(edges, usedEdgeIds, node.id, riskNode.id, 'control-edge');
        }

        const outputNodes = nodes.filter((node) => isOutputNodeType(node.type));
        if (outputNodes.length === 0) {
            const anchor = getAnchorPosition();
            const notifyId = buildNextId('n_notify', usedNodeIds);
            const notifyNode: WorkflowDsl['nodes'][number] = {
                id: notifyId,
                type: 'notify',
                name: '结果输出',
                enabled: true,
                config: { channels: ['DASHBOARD'], _position: { x: anchor.x + 260, y: anchor.y } },
                runtimePolicy: { ...DEFAULT_RUNTIME_POLICY },
            };
            nodes.push(notifyNode);
            ensureEdge(edges, usedEdgeIds, riskNode.id, notifyNode.id, 'control-edge');
            changed = true;
        } else {
            for (const outputNode of outputNodes) {
                ensureEdge(edges, usedEdgeIds, riskNode.id, outputNode.id, 'control-edge');
            }
        }
        if (changed || terminalUpstreams.length > 0) {
            actions.push('已补齐风险闸门及主路径连接');
        }
    }

    return {
        dsl: {
            ...dsl,
            nodes,
            edges,
        },
        actions,
    };
};

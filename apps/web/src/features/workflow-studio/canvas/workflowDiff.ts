import { WorkflowDsl, WorkflowNode } from '@packages/types';

// Simple deep equal for JSON-serializable objects
function isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

export interface DiffNode extends WorkflowNode {

    config: Record<string, unknown> & { diffStatus?: 'added' | 'removed' | 'modified' | 'unchanged' };
}

export interface DiffResult {
    mergedDsl: WorkflowDsl;
    stats: {
        added: number;
        removed: number;
        modified: number;
        unchanged: number;
    };
}

export const computeWorkflowDiff = (base: WorkflowDsl, target: WorkflowDsl): DiffResult => {
    const baseNodes = new Map(base.nodes.map(n => [n.id, n]));
    const targetNodes = new Map(target.nodes.map(n => [n.id, n]));

    const mergedNodes: DiffNode[] = [];
    let added = 0;
    let removed = 0;
    let modified = 0;
    let unchanged = 0;

    // Process Target Nodes (Added, Modified, Unchanged)
    target.nodes.forEach(targetNode => {
        const baseNode = baseNodes.get(targetNode.id);
        if (!baseNode) {
            // Added
            mergedNodes.push({
                ...targetNode,
                config: { ...targetNode.config, diffStatus: 'added' }
            });
            added++;
        } else {
            // Check for Modification
            // Ignore position for modification check if strictly config
            // But usually position change is also a change. 
            // Let's check deep equality of relevant fields.
            const isDiff = !isEqual(
                { ...baseNode, config: { ...baseNode.config, _position: undefined } },
                { ...targetNode, config: { ...targetNode.config, _position: undefined } }
            );

            if (isDiff) {
                mergedNodes.push({
                    ...targetNode,
                    config: { ...targetNode.config, diffStatus: 'modified' }
                });
                modified++;
            } else {
                mergedNodes.push({
                    ...targetNode,
                    config: { ...targetNode.config, diffStatus: 'unchanged' }
                });
                unchanged++;
            }
            // Remove from baseNodes map to identify remaining (removed) nodes
            baseNodes.delete(targetNode.id);
        }
    });

    // Process Remaining Base Nodes (Removed)
    baseNodes.forEach(baseNode => {
        mergedNodes.push({
            ...baseNode,
            config: { ...baseNode.config, diffStatus: 'removed' }
        });
        removed++;
    });

    // Edges - simple union for now, or maybe mark them too?
    // For now, let's just show target edges + removed edges?
    // If a node is removed, its edges are likely removed.
    // Let's just include all edges from target, plus edges from base that connect to removed nodes?
    // To keep it simple for visualizer, let's just use target edges. 
    // If we want to show "removed" edges, we'd need valid source/target handles which might not exist in target.
    // So sticking to target.edges is safest for rendering, but "Removed" nodes might appear isolated.
    // That's fine for "Removed" nodes visual.

    // Actually, if we want to show a removed node was connected to something, we ideally need the edge.
    // But adding edges for removed nodes might cause ReactFlow to warn if handles missing on other side (if modified).
    // Let's attempt to include edges from Base that connect to/from Removed Nodes, 
    // ONLY IF the other end exists in Merged Nodes.

    const mergedEdges = [...target.edges];
    base.edges.forEach(baseEdge => {
        const fromNode = mergedNodes.find(n => n.id === baseEdge.from);
        const toNode = mergedNodes.find(n => n.id === baseEdge.to);

        // If edge not in target (by ID), and both nodes exist in merged graph
        if (!target.edges.find(e => e.id === baseEdge.id) && fromNode && toNode) {
            // If either node is removed, add this edge to show context
            if (fromNode.config.diffStatus === 'removed' || toNode.config.diffStatus === 'removed') {
                mergedEdges.push({
                    ...baseEdge,
                    // Optional: mark edge as removed/diff?
                    // DSL edge doesn't support extra configs easily without type issues.
                    // But WorkflowCanvas rendering relies on edgeType.
                    // We can maybe set edgeType to 'error-edge' (red dashed) for removed edges?
                    edgeType: 'error-edge'
                });
            }
        }
    });

    const mergedDsl: WorkflowDsl = {
        ...target,
        nodes: mergedNodes,
        edges: mergedEdges,
    };

    return {
        mergedDsl,
        stats: { added, removed, modified, unchanged }
    };
};

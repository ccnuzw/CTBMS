import { type WorkflowDsl } from '@packages/types';

export interface WorkflowDslChangeSummary {
    addedNodeIds: string[];
    removedNodeIds: string[];
    addedEdgeIds: string[];
    removedEdgeIds: string[];
    updatedRuntimePolicyNodeIds: string[];
}

const stringifyComparable = (value: unknown): string => JSON.stringify(value ?? null);

export const summarizeWorkflowDslChange = (
    beforeDsl: WorkflowDsl,
    afterDsl: WorkflowDsl,
): WorkflowDslChangeSummary => {
    const beforeNodes = new Map(beforeDsl.nodes.map((node) => [node.id, node]));
    const afterNodes = new Map(afterDsl.nodes.map((node) => [node.id, node]));
    const beforeEdges = new Map(beforeDsl.edges.map((edge) => [edge.id, edge]));
    const afterEdges = new Map(afterDsl.edges.map((edge) => [edge.id, edge]));

    const addedNodeIds = [...afterNodes.keys()].filter((id) => !beforeNodes.has(id)).sort();
    const removedNodeIds = [...beforeNodes.keys()].filter((id) => !afterNodes.has(id)).sort();
    const addedEdgeIds = [...afterEdges.keys()].filter((id) => !beforeEdges.has(id)).sort();
    const removedEdgeIds = [...beforeEdges.keys()].filter((id) => !afterEdges.has(id)).sort();

    const updatedRuntimePolicyNodeIds = [...beforeNodes.keys()]
        .filter((id) => afterNodes.has(id))
        .filter((id) => {
            const beforeNode = beforeNodes.get(id);
            const afterNode = afterNodes.get(id);
            return stringifyComparable(beforeNode?.runtimePolicy) !== stringifyComparable(afterNode?.runtimePolicy);
        })
        .sort();

    return {
        addedNodeIds,
        removedNodeIds,
        addedEdgeIds,
        removedEdgeIds,
        updatedRuntimePolicyNodeIds,
    };
};

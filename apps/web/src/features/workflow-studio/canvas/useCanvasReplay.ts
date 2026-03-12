import { useCallback, useMemo } from 'react';
import { theme } from 'antd';
import type { Node, Edge } from '@xyflow/react';

export interface UseCanvasReplayParams {
    nodes: Node[];
    edges: Edge[];
    viewMode: 'edit' | 'replay';
    executionData?: { history?: Array<{ nodeId?: string; status: string }> };
}

/**
 * 执行回放时的节点/边样式计算
 */
export function useCanvasReplay({
    nodes,
    edges,
    viewMode,
    executionData,
}: UseCanvasReplayParams) {
    const { token } = theme.useToken();

    const executionStatusMap = useMemo(() => {
        if (viewMode !== 'replay' || !executionData) {
            return new Map<string, string>();
        }
        const statusMap = new Map<string, string>();
        const history = executionData.history || [];

        history.forEach((step) => {
            if (step.nodeId) {
                statusMap.set(step.nodeId, step.status);
            }
        });
        return statusMap;
    }, [viewMode, executionData]);

    const getEdgeStyle = useCallback(
        (edge: Edge) => {
            if (viewMode !== 'replay') return {};
            const sourceStatus = executionStatusMap.get(edge.source);
            const targetStatus = executionStatusMap.get(edge.target);
            const isTraversed =
                sourceStatus === 'SUCCESS' && (targetStatus === 'SUCCESS' || targetStatus === 'FAILED');

            if (isTraversed) {
                return { stroke: token.colorSuccess, strokeWidth: 2, animated: true };
            }
            return { stroke: token.colorBorder, opacity: 0.2 };
        },
        [viewMode, executionStatusMap, token],
    );

    const getNodeStyle = useCallback(
        (node: Node) => {
            if (viewMode !== 'replay') return {};
            const status = executionStatusMap.get(node.id);
            let borderColor = token.colorBorder;
            let background = token.colorBgContainer;
            let opacity = 1;

            if (status === 'SUCCESS') {
                borderColor = token.colorSuccess;
                background = token.colorSuccessBg;
            } else if (status === 'FAILED') {
                borderColor = token.colorError;
                background = token.colorErrorBg;
            } else if (status === 'SKIPPED') {
                borderColor = token.colorTextQuaternary;
                opacity = 0.6;
            } else if (!status) {
                opacity = 0.4;
            }

            return {
                border: `2px solid ${borderColor}`,
                background,
                opacity,
                transition: 'all 0.3s ease',
            };
        },
        [viewMode, executionStatusMap, token],
    );

    const displayNodes = useMemo(() => {
        if (viewMode !== 'replay') return nodes;
        return nodes.map((node) => ({
            ...node,
            style: { ...node.style, ...getNodeStyle(node) },
            draggable: false,
            connectable: false,
            selectable: true,
        }));
    }, [nodes, viewMode, getNodeStyle]);

    const displayEdges = useMemo(() => {
        if (viewMode !== 'replay') return edges;
        return edges.map((edge) => ({
            ...edge,
            style: { ...edge.style, ...getEdgeStyle(edge) },
            animated: getEdgeStyle(edge).animated,
        }));
    }, [edges, viewMode, getEdgeStyle]);

    return {
        executionStatusMap,
        displayNodes,
        displayEdges,
    };
}

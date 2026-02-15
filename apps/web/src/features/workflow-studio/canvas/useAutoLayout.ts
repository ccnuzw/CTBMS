import { useCallback } from 'react';
import dagre from 'dagre';
import { useReactFlow, Node, Edge, Position } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 180;
const nodeHeight = 80;

export const useAutoLayout = () => {
    const { getNodes, getEdges, setNodes, fitView } = useReactFlow();

    const onLayout = useCallback(
        (direction: 'TB' | 'LR' = 'LR') => {
            const nodes = getNodes();
            const edges = getEdges();

            dagreGraph.setGraph({ rankdir: direction });

            nodes.forEach((node) => {
                dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
            });

            edges.forEach((edge) => {
                dagreGraph.setEdge(edge.source, edge.target);
            });

            dagre.layout(dagreGraph);

            const layoutedNodes = nodes.map((node) => {
                const nodeWithPosition = dagreGraph.node(node.id);
                // Shift node to center (React Flow handles position based on top-left)
                // dagre returns center point
                const x = nodeWithPosition.x - nodeWidth / 2;
                const y = nodeWithPosition.y - nodeHeight / 2;

                return {
                    ...node,
                    targetPosition: direction === 'LR' ? Position.Left : Position.Top,
                    sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
                    position: { x, y },
                };
            });

            setNodes(layoutedNodes);

            // Re-render and fit view
            requestAnimationFrame(() => {
                fitView({ padding: 0.2, duration: 800 });
            });
        },
        [getNodes, getEdges, setNodes, fitView]
    );

    return { onLayout };
};

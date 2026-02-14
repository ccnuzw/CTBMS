import { useCallback, useEffect, useState, useRef } from 'react';
import type { Node, Edge, XYPosition } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { message } from 'antd';

interface ClipboardData {
    nodes: Node[];
    edges: Edge[];
}

export const useCopyPaste = (
    nodes: Node[],
    edges: Edge[],
    setNodes: (updater: (nodes: Node[]) => Node[]) => void,
    setEdges: (updater: (edges: Edge[]) => Edge[]) => void,
    onBeforePaste?: () => void
) => {
    const { getNodes, getEdges, screenToFlowPosition } = useReactFlow();

    // Internal clipboard state (memory only for now)
    const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

    // Track mouse position for paste location
    const mousePosRef = useRef<XYPosition>({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    const copy = useCallback(() => {
        const selectedNodes = nodes.filter((n) => n.selected);
        if (selectedNodes.length === 0) return;

        const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
        const connectedEdges = edges.filter(e =>
            selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
        );

        const data: ClipboardData = {
            nodes: selectedNodes.map((n) => ({ ...n })), // Shallow copy is enough for React Flow nodes usually
            edges: connectedEdges.map((e) => ({ ...e })),
        };

        setClipboard(data);
        message.success(`已复制 ${selectedNodes.length} 个节点`);
    }, [nodes, edges]);

    const paste = useCallback(() => {
        if (!clipboard) return;

        // Trigger snapshot before modifying state
        onBeforePaste?.();

        const { nodes: pastedNodes, edges: pastedEdges } = clipboard;
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        const idMap = new Map<string, string>();

        // Calculate offset based on mouse position
        // If mouse is over canvas, use it. Otherwise use default offset.
        // We need flow position from screen position.
        const flowPos = screenToFlowPosition({
            x: mousePosRef.current.x,
            y: mousePosRef.current.y
        });

        // Find center of original nodes
        let minX = Infinity, minY = Infinity;
        pastedNodes.forEach(n => {
            if (n.position.x < minX) minX = n.position.x;
            if (n.position.y < minY) minY = n.position.y;
        });

        const offsetX = flowPos.x - minX;
        const offsetY = flowPos.y - minY;

        // Use a fixed offset if not using mouse (e.g. keyboard paste without mouse move tracking or just simple offset)
        // For better UX, let's use fixed offset from original position if simpler, 
        // OR use the mouse position if valid. 
        // Let's stick to simple offset (+20, +20) from original for now to ensure visibility 
        // unless we want "paste at cursor". "Paste at cursor" is better.
        // But screenToFlowPosition requires ReactFlow instance to be ready.

        const useMouse = true; // Feature flag

        pastedNodes.forEach((node) => {
            const newId = `${node.type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            idMap.set(node.id, newId);

            let newPos = { ...node.position };
            if (useMouse && minX !== Infinity) {
                // Determine relative position to the "group" of nodes being pasted
                const relX = node.position.x - minX;
                const relY = node.position.y - minY;
                newPos = { x: flowPos.x + relX, y: flowPos.y + relY };
            } else {
                newPos = { x: node.position.x + 50, y: node.position.y + 50 };
            }

            newNodes.push({
                ...node,
                id: newId,
                position: newPos,
                selected: true,
                data: { ...node.data } // Ensure deep copy of data if needed
            });
        });

        pastedEdges.forEach((edge) => {
            const newSource = idMap.get(edge.source);
            const newTarget = idMap.get(edge.target);
            if (newSource && newTarget) {
                newEdges.push({
                    ...edge,
                    id: `edge_${newSource}_${newTarget}_${Date.now()}`,
                    source: newSource,
                    target: newTarget,
                    selected: true,
                });
            }
        });

        setNodes((nds) => [
            ...nds.map(n => ({ ...n, selected: false })),
            ...newNodes
        ]);
        setEdges((eds) => [
            ...eds.map(e => ({ ...e, selected: false })),
            ...newEdges
        ]);

        message.success('已粘贴');

    }, [clipboard, setNodes, setEdges, onBeforePaste, screenToFlowPosition]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if active element is an input
            const activeElement = document.activeElement as HTMLElement;
            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
                return;
            }

            if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                copy();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                paste();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [copy, paste]);

    return { copy, paste };
};

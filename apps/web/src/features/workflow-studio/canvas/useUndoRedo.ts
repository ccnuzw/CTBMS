import { useState, useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';

interface HistoryState {
    nodes: Node[];
    edges: Edge[];
}

export const useUndoRedo = (
    maxHistory: number = 30
) => {
    const [past, setPast] = useState<HistoryState[]>([]);
    const [future, setFuture] = useState<HistoryState[]>([]);

    // We keep a reference to current state to avoid passing it to takeSnapshot every time if we want
    // But usually takeSnapshot is called WITH the current state.

    const takeSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
        setPast((oldPast) => {
            const newPast = [...oldPast, { nodes: [...nodes], edges: [...edges] }]; // Deep copy needed? React Flow nodes are objects.
            // A shallow copy of the array is okay IF the objects inside are treated as immutable (replaced on update).
            // React Flow typically updates by replacing objects.
            if (newPast.length > maxHistory) {
                return newPast.slice(newPast.length - maxHistory);
            }
            return newPast;
        });
        setFuture([]);
    }, [maxHistory]);

    const undo = useCallback((
        currentNodes: Node[],
        currentEdges: Edge[],
        setNodes: (nodes: Node[]) => void,
        setEdges: (edges: Edge[]) => void
    ) => {
        setPast((oldPast) => {
            if (oldPast.length === 0) return oldPast;

            const previous = oldPast[oldPast.length - 1];
            const newPast = oldPast.slice(0, oldPast.length - 1);

            // Push current to future
            setFuture((oldFuture) => [{ nodes: currentNodes, edges: currentEdges }, ...oldFuture]);

            // Restore previous
            setNodes(previous.nodes);
            setEdges(previous.edges);

            return newPast;
        });
    }, []);

    const redo = useCallback((
        currentNodes: Node[],
        currentEdges: Edge[],
        setNodes: (nodes: Node[]) => void,
        setEdges: (edges: Edge[]) => void
    ) => {
        setFuture((oldFuture) => {
            if (oldFuture.length === 0) return oldFuture;

            const next = oldFuture[0];
            const newFuture = oldFuture.slice(1);

            // Push current to past
            setPast((oldPast) => {
                const newPast = [...oldPast, { nodes: currentNodes, edges: currentEdges }];
                if (newPast.length > maxHistory) {
                    return newPast.slice(newPast.length - maxHistory);
                }
                return newPast;
            });

            // Restore next
            setNodes(next.nodes);
            setEdges(next.edges);

            return newFuture;
        });
    }, [maxHistory]);

    return {
        takeSnapshot,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        past, // Exposed for debugging or length checks
        future
    };
};

import { useCallback } from 'react';
import { useReactFlow, type Node, type XYPosition } from '@xyflow/react';

export const useCanvasAlignment = () => {
    const { getNodes, setNodes } = useReactFlow();

    const alignNodes = useCallback((direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        setNodes((nodes) => {
            const selectedNodes = nodes.filter((n) => n.selected);
            if (selectedNodes.length < 2) return nodes;

            let targetValue = 0;
            switch (direction) {
                case 'left':
                    targetValue = Math.min(...selectedNodes.map((n) => n.position.x));
                    break;
                case 'right':
                    targetValue = Math.max(...selectedNodes.map((n) => n.position.x + (n.measured?.width ?? 0)));
                    break;
                case 'center': { // Horizontal center
                    const minX = Math.min(...selectedNodes.map((n) => n.position.x));
                    const maxX = Math.max(...selectedNodes.map((n) => n.position.x + (n.measured?.width ?? 0)));
                    targetValue = (minX + maxX) / 2;
                    break;
                }
                case 'top':
                    targetValue = Math.min(...selectedNodes.map((n) => n.position.y));
                    break;
                case 'bottom':
                    targetValue = Math.max(...selectedNodes.map((n) => n.position.y + (n.measured?.height ?? 0)));
                    break;
                case 'middle': { // Vertical middle
                    const minY = Math.min(...selectedNodes.map((n) => n.position.y));
                    const maxY = Math.max(...selectedNodes.map((n) => n.position.y + (n.measured?.height ?? 0)));
                    targetValue = (minY + maxY) / 2;
                    break;
                }
            }

            return nodes.map((n) => {
                if (!n.selected) return n;

                const newPos: XYPosition = { ...n.position };
                const w = n.measured?.width ?? 0;
                const h = n.measured?.height ?? 0;

                switch (direction) {
                    case 'left':
                        newPos.x = targetValue;
                        break;
                    case 'right':
                        newPos.x = targetValue - w;
                        break;
                    case 'center':
                        newPos.x = targetValue - w / 2;
                        break;
                    case 'top':
                        newPos.y = targetValue;
                        break;
                    case 'bottom':
                        newPos.y = targetValue - h;
                        break;
                    case 'middle':
                        newPos.y = targetValue - h / 2;
                        break;
                }

                return { ...n, position: newPos };
            });
        });
    }, [setNodes]);

    return { alignNodes };
};

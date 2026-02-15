import React, { useMemo } from 'react';
import { Cascader, Space, Typography } from 'antd';
import type { DefaultOptionType } from 'antd/es/cascader';
import { useReactFlow } from '@xyflow/react';
import { getNodeTypeConfig } from './nodeTypeRegistry';

const { Text } = Typography;

interface VariableSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    currentNodeId: string;
}

export const VariableSelector: React.FC<VariableSelectorProps> = ({
    value,
    onChange,
    currentNodeId,
}) => {
    const { getNodes, getEdges } = useReactFlow();

    const options = useMemo(() => {
        const nodes = getNodes();
        const edges = getEdges();
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));
        const incomingMap = new Map<string, string[]>();
        edges.forEach((edge) => {
            const sources = incomingMap.get(edge.target) ?? [];
            sources.push(edge.source);
            incomingMap.set(edge.target, sources);
        });

        // 从当前节点逆向遍历，仅收集可达上游节点
        const queue: Array<{ id: string; depth: number }> = [{ id: currentNodeId, depth: 0 }];
        const visited = new Set<string>();
        const upstreamDepth = new Map<string, number>();
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) break;
            const sources = incomingMap.get(current.id) ?? [];
            for (const sourceId of sources) {
                if (sourceId === currentNodeId) {
                    continue;
                }
                const nextDepth = current.depth + 1;
                const prevDepth = upstreamDepth.get(sourceId);
                if (prevDepth === undefined || nextDepth < prevDepth) {
                    upstreamDepth.set(sourceId, nextDepth);
                }
                if (!visited.has(sourceId)) {
                    visited.add(sourceId);
                    queue.push({ id: sourceId, depth: nextDepth });
                }
            }
        }

        const upstreamNodes = [...visited]
            .map((id) => nodeMap.get(id))
            .filter((node): node is NonNullable<typeof node> => Boolean(node))
            .sort((a, b) => (upstreamDepth.get(a.id) ?? 99) - (upstreamDepth.get(b.id) ?? 99));

        return upstreamNodes.map((node): DefaultOptionType | null => {
            const nodeConfig = getNodeTypeConfig(node.data.type as string);
            const outputFields = nodeConfig?.outputFields
                ?? nodeConfig?.outputsSchema?.map((schemaField) => ({
                    name: schemaField.name,
                    label: schemaField.name,
                    type: schemaField.type,
                }))
                ?? [];

            if (outputFields.length === 0) return null;

            return {
                value: node.id,
                label: (
                    <Space>
                        {nodeConfig?.icon && React.createElement(nodeConfig.icon)}
                        <span>{node.data.name as string}</span>
                        <Text type="secondary" style={{ fontSize: 10 }}>{node.id}</Text>
                    </Space>
                ),
                children: outputFields.map(field => ({
                    value: field.name,
                    label: (
                        <Space>
                            <span>{field.label}</span>
                            <Text type="secondary" style={{ fontSize: 10 }}>{field.type}</Text>
                        </Space>
                    ),
                    isLeaf: true,
                })),
            };
        }).filter((item): item is DefaultOptionType => item !== null);
    }, [getNodes, getEdges, currentNodeId]);

    const displayValue = useMemo(() => {
        if (!value) return [];
        // value format: {{nodeId.field}}
        const match = value.match(/\{\{(.+?)\.(.+?)\}\}/);
        if (match) {
            return [match[1], match[2]];
        }
        return [];
    }, [value]);

    const handleChange = (path: (string | number)[]) => {
        if (path && path.length === 2) {
            onChange?.(`{{${path[0]}.${path[1]}}}`);
        }
    };

    return (
        <Cascader
            options={options}
            value={displayValue}
            onChange={handleChange}
            placeholder="选择变量..."
            style={{ width: '100%' }}
            expandTrigger="hover"
            showSearch
        />
    );
};

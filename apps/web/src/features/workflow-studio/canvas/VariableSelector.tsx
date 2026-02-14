import React, { useMemo } from 'react';
import { Cascader, Space, Typography } from 'antd';
import type { DefaultOptionType } from 'antd/es/cascader';
import { useReactFlow, type Node, type Edge } from '@xyflow/react';
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

    // 计算上游节点及其输出字段
    const options = useMemo(() => {
        const nodes = getNodes();
        const edges = getEdges();

        // 简单的 BFS/DFS 查找所有上游节点（这里简化为查找直接和间接上游）
        // 实际场景可能需要更严谨的图遍历，这里先从边关系中查找所有指向当前路经的节点
        // 暂简化为：列出所有非当前节点（TODO: 仅列出拓扑排序在上游的节点）

        const upstreamNodes = nodes.filter(n => n.id !== currentNodeId);

        return upstreamNodes.map((node): DefaultOptionType | null => {
            const nodeConfig = getNodeTypeConfig(node.data.type as string);
            const outputFields = nodeConfig?.outputFields ?? [];

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
    }, [getNodes, currentNodeId]);

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

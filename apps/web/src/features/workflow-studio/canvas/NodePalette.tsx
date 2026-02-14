import React, { type DragEvent, useState, useMemo } from 'react';
import { Input, Collapse, Tooltip, theme, Typography, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import {
    getNodesByCategory,
    CATEGORY_LABELS,
    type NodeCategory,
    type NodeTypeConfig,
} from './nodeTypeRegistry';

const { Text } = Typography;

interface NodePaletteProps {
    /** 画布容器 ref，用于计算拖拽落点 */
    style?: React.CSSProperties;
}

/**
 * 节点工具箱面板
 *
 * 按分类展示可拖拽的节点类型，支持搜索过滤
 */
export const NodePalette: React.FC<NodePaletteProps> = ({ style }) => {
    const { token } = theme.useToken();
    const [search, setSearch] = useState('');
    const categories = useMemo(() => getNodesByCategory(), []);

    const filteredGroups: [NodeCategory, NodeTypeConfig[]][] = Object.entries(categories)
        .map(([category, configs]) => {
            const filtered = configs.filter(
                (c) =>
                    !search ||
                    c.label.toLowerCase().includes(search.toLowerCase()) ||
                    c.type.toLowerCase().includes(search.toLowerCase()),
            );
            return [category as NodeCategory, filtered] as [NodeCategory, NodeTypeConfig[]];
        })
        .filter(([, configs]) => configs.length > 0);

    const handleDragStart = (event: DragEvent<HTMLDivElement>, nodeType: string) => {
        event.dataTransfer.setData('application/workflow-node-type', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const collapseItems = filteredGroups.map(([category, configs]) => ({
        key: category,
        label: (
            <Text strong style={{ fontSize: 12, color: token.colorTextSecondary }}>
                {CATEGORY_LABELS[category]}
            </Text>
        ),
        children: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {configs.map((config) => {
                    const Icon = config.icon;
                    return (
                        <Tooltip key={config.type} title={config.description} placement="right">
                            <div
                                draggable
                                onDragStart={(e) => handleDragStart(e, config.type)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px 10px',
                                    borderRadius: token.borderRadius,
                                    border: `1px solid ${token.colorBorderSecondary}`,
                                    background: token.colorBgContainer,
                                    cursor: 'grab',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.borderColor = config.color;
                                    e.currentTarget.style.background = `${config.color}08`;
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.borderColor = token.colorBorderSecondary;
                                    e.currentTarget.style.background = token.colorBgContainer;
                                }}
                            >
                                <div
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: token.borderRadiusSM,
                                        background: `${config.color}15`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: config.color,
                                        fontSize: 14,
                                        flexShrink: 0,
                                    }}
                                >
                                    <Icon />
                                </div>
                                <Text style={{ fontSize: 12, flex: 1 }}>{config.label}</Text>
                                <Tag
                                    bordered={false}
                                    style={{
                                        fontSize: 10,
                                        lineHeight: '16px',
                                        padding: '0 4px',
                                        color: token.colorTextQuaternary,
                                    }}
                                >
                                    {config.type}
                                </Tag>
                            </div>
                        </Tooltip>
                    );
                })}
            </div>
        ),
    }));

    return (
        <div
            style={{
                width: 260,
                height: '100%',
                background: token.colorBgLayout,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                flexDirection: 'column',
                ...style,
            }}
        >
            <div style={{ padding: '12px 12px 8px' }}>
                <Text strong style={{ fontSize: 14 }}>
                    节点库
                </Text>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索节点..."
                    size="small"
                    allowClear
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ marginTop: 8 }}
                />
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
                <Collapse
                    bordered={false}
                    defaultActiveKey={['TRIGGER', 'DATA']}
                    size="small"
                    items={collapseItems}
                    style={{ background: 'transparent' }}
                />
            </div>
        </div>
    );
};

import React, { type DragEvent, useState, useMemo } from 'react';
import { Input, Collapse, Tooltip, theme, Typography, Tag, Button, Empty } from 'antd';
import { SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    getNodesByCategory,
    CATEGORY_LABELS,
    type NodeCategory,
    type NodeTypeConfig,
} from './nodeTypeRegistry';
import { removeNodeTemplate, useNodeTemplates } from './nodeTemplateStore';

const { Text } = Typography;

interface NodePaletteProps {
    /** 画布容器 ref，用于计算拖拽落点 */
    style?: React.CSSProperties;
    viewLevel?: 'business' | 'enhanced' | 'expert';
}

/**
 * 节点工具箱面板
 *
 * 按分类展示可拖拽的节点类型，支持搜索过滤
 */
const BUSINESS_NODE_TYPES = new Set([
    'manual-trigger',
    'cron-trigger',
    'api-trigger',
    'data-fetch',
    'rule-pack-eval',
    'agent-call',
    'decision-merge',
    'risk-gate',
    'notify',
]);

const EXPERT_ONLY_NODE_TYPES = new Set([
    'switch',
    'control-loop',
    'control-delay',
    'group',
]);

export const NodePalette: React.FC<NodePaletteProps> = ({ style, viewLevel = 'business' }) => {
    const { token } = theme.useToken();
    const [search, setSearch] = useState('');
    const categories = useMemo(() => getNodesByCategory(), []);
    const templates = useNodeTemplates();

    const filteredGroups: [NodeCategory, NodeTypeConfig[]][] = Object.entries(categories)
        .map(([category, configs]) => {
            const filtered = configs.filter(
                (c) =>
                    (viewLevel === 'expert'
                        || (viewLevel === 'enhanced' && !EXPERT_ONLY_NODE_TYPES.has(c.type))
                        || (viewLevel === 'business' && BUSINESS_NODE_TYPES.has(c.type)))
                    && (
                        !search ||
                        c.label.toLowerCase().includes(search.toLowerCase()) ||
                        c.type.toLowerCase().includes(search.toLowerCase())
                    ),
            );
            return [category as NodeCategory, filtered] as [NodeCategory, NodeTypeConfig[]];
        })
        .filter(([, configs]) => configs.length > 0);

    const filteredTemplates = templates.filter((template) => {
        if (!search) {
            return true;
        }
        const keyword = search.toLowerCase();
        return (
            template.name.toLowerCase().includes(keyword)
            || template.nodeType.toLowerCase().includes(keyword)
            || (template.description ?? '').toLowerCase().includes(keyword)
        );
    });

    const handleDragStart = (event: DragEvent<HTMLDivElement>, nodeType: string) => {
        event.dataTransfer.setData('application/workflow-node-type', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleTemplateDragStart = (event: DragEvent<HTMLDivElement>, templateId: string) => {
        event.dataTransfer.setData('application/workflow-node-template-id', templateId);
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
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                    <Text style={{ fontSize: 12 }} ellipsis>{config.label}</Text>
                                    {viewLevel !== 'business' ? (
                                        <Text type="secondary" style={{ fontSize: 10, lineHeight: '1.2' }} ellipsis>
                                            {config.type}
                                        </Text>
                                    ) : null}
                                </div>
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
                <Text type="secondary" style={{ display: 'block', marginTop: 2, fontSize: 11 }}>
                    {viewLevel === 'business'
                        ? '业务视图：仅展示高频节点'
                        : viewLevel === 'enhanced'
                            ? '增强视图：展示常用与进阶节点'
                            : '专家视图：展示全部节点'}
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
                <div style={{ marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 12, color: token.colorTextSecondary }}>
                        节点模板
                    </Text>
                    {filteredTemplates.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="暂无模板"
                            style={{ margin: '8px 0 0', padding: '8px 0' }}
                        />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                            {filteredTemplates.map((template) => (
                                <div
                                    key={template.id}
                                    draggable
                                    onDragStart={(event) => handleTemplateDragStart(event, template.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 10px',
                                        borderRadius: token.borderRadius,
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                        background: token.colorBgContainer,
                                        cursor: 'grab',
                                    }}
                                >
                                    <Tag bordered={false} color="blue" style={{ margin: 0 }}>
                                        模板
                                    </Tag>
                                    <Text style={{ fontSize: 12, flex: 1 }} ellipsis>
                                        {template.name}
                                    </Text>
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            removeNodeTemplate(template.id);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

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

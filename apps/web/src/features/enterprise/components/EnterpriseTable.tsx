import React, { useMemo, useState } from 'react';
import { Table, Tag, Space, Typography, Tooltip, Button, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    EnvironmentOutlined,
    UserOutlined,
    EditOutlined,
    CaretDownOutlined,
    CaretRightOutlined,
} from '@ant-design/icons';
import { EnterpriseType, EnterpriseResponse } from '@packages/types';
import { useDictionary } from '@/hooks/useDictionaries';

const { Text } = Typography;
const { useToken } = theme;

// 企业类型颜色映射
const TYPE_COLORS_FALLBACK: Record<EnterpriseType, string> = {
    [EnterpriseType.SUPPLIER]: 'orange',
    [EnterpriseType.CUSTOMER]: 'green',
    [EnterpriseType.LOGISTICS]: 'blue',
    [EnterpriseType.GROUP]: 'purple',
};

// 企业类型中文映射
const TYPE_LABELS_FALLBACK: Record<EnterpriseType, string> = {
    [EnterpriseType.SUPPLIER]: '供应商',
    [EnterpriseType.CUSTOMER]: '客户',
    [EnterpriseType.LOGISTICS]: '物流商',
    [EnterpriseType.GROUP]: '集团',
};

interface EnterpriseTableProps {
    data: EnterpriseResponse[];
    loading: boolean;
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number, pageSize: number) => void;
    onSelect: (id: string | null) => void;
    selectedId: string | null;
    onEdit: (id: string) => void;
    hideAddress?: boolean;
}

export const EnterpriseTable: React.FC<EnterpriseTableProps> = ({
    data,
    loading,
    total,
    page,
    pageSize,
    onPageChange,
    onSelect,
    selectedId,
    onEdit,
    hideAddress = false,
}) => {
    const { token } = useToken();
    const { data: enterpriseTypeDict } = useDictionary('ENTERPRISE_TYPE');
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);

    const typeLabels = useMemo(() => {
        const items = (enterpriseTypeDict || []).filter((item) => item.isActive);
        if (!items.length) return TYPE_LABELS_FALLBACK;
        const map = items.reduce<Partial<Record<EnterpriseType, string>>>((acc, item) => {
            acc[item.code as EnterpriseType] = item.label;
            return acc;
        }, {});
        return { ...TYPE_LABELS_FALLBACK, ...map } as Record<EnterpriseType, string>;
    }, [enterpriseTypeDict]);

    const typeColors = useMemo(() => {
        const items = (enterpriseTypeDict || []).filter((item) => item.isActive);
        if (!items.length) return TYPE_COLORS_FALLBACK;
        const map = items.reduce<Partial<Record<EnterpriseType, string>>>((acc, item) => {
            acc[item.code as EnterpriseType] =
                ((item.meta as { color?: string } | null)?.color || TYPE_COLORS_FALLBACK[item.code as EnterpriseType] || 'default') as string;
            return acc;
        }, {});
        return { ...TYPE_COLORS_FALLBACK, ...map } as Record<EnterpriseType, string>;
    }, [enterpriseTypeDict]);

    // 获取信用评分颜色
    const getRiskScoreColor = (score: number) => {
        if (score >= 90) return token.colorSuccess;
        if (score >= 70) return token.colorWarning;
        return token.colorError;
    };

    // 表格列定义
    const columns: ColumnsType<EnterpriseResponse> = [
        {
            title: '企业名称 / 组织架构',
            dataIndex: 'name',
            key: 'name',
            width: 230,
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Space size={4}>
                        {record.types.includes(EnterpriseType.GROUP) && (
                            <Tag color="purple" style={{ marginRight: 0 }}>集团</Tag>
                        )}
                        <Text strong style={{ fontSize: token.fontSize }}>
                            {record.name}
                        </Text>
                        {record._count && record._count.children > 0 && (
                            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                ({record._count.children} 家子公司)
                            </Text>
                        )}
                    </Space>
                    {record.shortName && (
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            {record.shortName}
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: '业务身份',
            dataIndex: 'types',
            key: 'types',
            width: 120,
            render: (types: EnterpriseType[]) => (
                <Space size={4} wrap>
                    {types.filter(t => t !== EnterpriseType.GROUP).map((type) => (
                        <Tag key={type} color={typeColors[type]} bordered={false}>
                            {typeLabels[type]}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: '信用分',
            dataIndex: 'riskScore',
            key: 'riskScore',
            width: 70,
            align: 'center',
            sorter: (a, b) => a.riskScore - b.riskScore,
            render: (score: number) => (
                <Text strong style={{ color: getRiskScoreColor(score), fontSize: token.fontSizeLG }}>
                    {score}★
                </Text>
            ),
        },
        {
            title: '标签画像',
            key: 'tags',
            width: 180,
            render: (_, record) => {
                const tags = (record as EnterpriseResponse & { tags?: { id: string; name: string; color: string | null }[] }).tags;
                if (!tags || tags.length === 0) {
                    return <Text type="secondary">-</Text>;
                }
                return (
                    <Space size={4} wrap>
                        {tags.slice(0, 3).map((tag) => (
                            <Tag key={tag.id} color={tag.color || 'default'} bordered={false}>
                                {tag.name}
                            </Tag>
                        ))}
                        {tags.length > 3 && (
                            <Tooltip title={tags.slice(3).map(t => t.name).join(', ')}>
                                <Tag>+{tags.length - 3}</Tag>
                            </Tooltip>
                        )}
                    </Space>
                );
            },
        },
        {
            title: '关键人',
            key: 'contact',
            width: 160,
            render: (_, record) => {
                const firstContact = record.contacts?.[0] as { name: string; title?: string } | undefined;
                if (!firstContact) return <Text type="secondary">-</Text>;
                return (
                    <Space size={4}>
                        <UserOutlined style={{ color: token.colorTextSecondary }} />
                        <Text>
                            {firstContact.name}
                            {firstContact.title && (
                                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                    {' '}({firstContact.title})
                                </Text>
                            )}
                        </Text>
                    </Space>
                );
            },
        },
        {
            title: '地址',
            key: 'address',
            width: 250,
            ellipsis: true,
            render: (_, record) => {
                const fullAddress = [record.province, record.city, record.address]
                    .filter(Boolean)
                    .join(' ');
                if (!fullAddress) return <Text type="secondary">-</Text>;
                return (
                    <Tooltip title={fullAddress}>
                        <Space size={4}>
                            <EnvironmentOutlined style={{ color: token.colorTextSecondary }} />
                            <Text ellipsis style={{ maxWidth: 210 }}>{fullAddress}</Text>
                        </Space>
                    </Tooltip>
                );
            },
        },
    ];

    // 根据 hideAddress 过滤列
    const visibleColumns = hideAddress
        ? columns.filter((col) => col.key !== 'address')
        : columns;

    return (
        <Table<EnterpriseResponse>
            rowKey="id"
            columns={visibleColumns}
            dataSource={data}
            loading={loading}
            pagination={{
                current: page,
                pageSize: pageSize,
                total: total,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (t) => `共 ${t} 条`,
                onChange: onPageChange,
            }}
            onRow={(record) => ({
                onClick: () => onSelect(record.id),
                style: {
                    cursor: 'pointer',
                    background: record.id === selectedId ? token.colorPrimaryBg : undefined,
                },
            })}
            expandable={{
                expandedRowKeys,
                onExpand: (expanded, record) => {
                    setExpandedRowKeys(expanded
                        ? [...expandedRowKeys, record.id]
                        : expandedRowKeys.filter(k => k !== record.id)
                    );
                },
                expandIcon: ({ expanded, onExpand, record }) => {
                    const hasChildren = record.children && record.children.length > 0;

                    if (!hasChildren) {
                        // 非集团企业：显示装饰点
                        return (
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 20,
                                    marginRight: 8,
                                }}
                            >
                                <span
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: token.colorTextQuaternary,
                                    }}
                                />
                            </span>
                        );
                    }

                    // 集团企业：显示展开/折叠图标
                    return expanded ? (
                        <CaretDownOutlined
                            style={{
                                cursor: 'pointer',
                                marginRight: 8,
                                color: token.colorPrimary,
                                fontSize: 12,
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onExpand(record, e);
                            }}
                        />
                    ) : (
                        <CaretRightOutlined
                            style={{
                                cursor: 'pointer',
                                marginRight: 8,
                                color: token.colorTextSecondary,
                                fontSize: 12,
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onExpand(record, e);
                            }}
                        />
                    );
                },
                childrenColumnName: 'children',
            }}
            size="middle"
            scroll={{ x: hideAddress ? 800 : 1100 }}
            sticky
        />
    );
};

export default EnterpriseTable;

import React, { useMemo, useLayoutEffect, useRef, useState } from 'react';
import {
    Table,
    Tag,
    Space,
    Button,
    Tooltip,
    Dropdown,
    Typography,
    Badge,
    Flex,
    theme,
} from 'antd';
import type { ColumnsType, TableRowSelection } from 'antd/es/table/interface';
import type { MenuProps } from 'antd';
import {
    EyeOutlined,
    DeleteOutlined,
    CheckCircleOutlined,
    StarOutlined,
    MoreOutlined,
    ExportOutlined,
    EnvironmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { IntelFilterState, IntelItem } from '../../types';
import { ContentType } from '../../../../types';

const { Text } = Typography;

interface TableViewProps {
    filterState: IntelFilterState;
    items: IntelItem[];
    loading: boolean;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
}

const CONTENT_TYPE_CONFIG: Record<ContentType, { label: string; color: string }> = {
    [ContentType.DAILY_REPORT]: { label: '日报', color: 'blue' },
    [ContentType.RESEARCH_REPORT]: { label: '研报', color: 'green' },
    [ContentType.POLICY_DOC]: { label: '政策', color: 'purple' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    pending: { label: '待处理', color: 'orange' },
    confirmed: { label: '已确认', color: 'green' },
    flagged: { label: '已标记', color: 'red' },
    archived: { label: '已归档', color: 'default' },
};

export const TableView: React.FC<TableViewProps> = ({
    filterState: _filterState,
    items,
    loading,
    onIntelSelect,
    selectedIntelId,
}) => {
    const { token } = theme.useToken();
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollY, setScrollY] = useState<number>(360);

    const dataSource = useMemo(
        () =>
            [...(items || [])].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            ),
        [items],
    );

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const updateScroll = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const reserved = (selectedRowKeys.length > 0 ? 48 : 0) + 72;
            const nextHeight = Math.max(240, Math.floor(rect.height - reserved));
            setScrollY(nextHeight);
        };

        updateScroll();

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateScroll);
            observer.observe(containerRef.current);
            window.addEventListener('resize', updateScroll);
            return () => {
                observer.disconnect();
                window.removeEventListener('resize', updateScroll);
            };
        }

        window.addEventListener('resize', updateScroll);
        return () => window.removeEventListener('resize', updateScroll);
    }, [selectedRowKeys.length]);

    const columns: ColumnsType<IntelItem> = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            width: 280,
            ellipsis: true,
            render: (title, record) => (
                <Flex align="center" gap={8}>
                    <Tag color={CONTENT_TYPE_CONFIG[record.contentType]?.color} bordered={false}>
                        {CONTENT_TYPE_CONFIG[record.contentType]?.label}
                    </Tag>
                    <Text ellipsis={{ tooltip: true }} style={{ flex: 1 }}>
                        {title}
                    </Text>
                </Flex>
            ),
        },
        {
            title: '位置',
            dataIndex: 'location',
            key: 'location',
            width: 120,
            render: (location) => location ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    <EnvironmentOutlined /> {location}
                </Text>
            ) : '-',
        },
        {
            title: '信源',
            dataIndex: 'sourceType',
            key: 'sourceType',
            width: 100,
            render: (type) => {
                const labels: Record<string, string> = {
                    FIRST_LINE: '一线采集',
                    OFFICIAL_GOV: '官方发布',
                    OFFICIAL: '官方渠道',
                    RESEARCH_INST: '研究机构',
                    MEDIA: '媒体报道',
                    INTERNAL_REPORT: '内部报告',
                    INDUSTRY_ASSOC: '行业协会',
                    THIRD_PARTY: '第三方数据',
                    COMPETITOR: '竞对情报',
                };
                return <Text style={{ fontSize: 12 }}>{labels[type] || type}</Text>;
            },
        },
        {
            title: 'AI可信度',
            dataIndex: 'confidence',
            key: 'confidence',
            width: 100,
            sorter: (a, b) => (a.confidence || 0) - (b.confidence || 0),
            render: (confidence, record) => {
                const value = confidence ?? record.qualityScore;
                return value ? (
                    <Tag color={value >= 80 ? 'green' : value >= 60 ? 'orange' : 'red'}>
                        {value}%
                    </Tag>
                ) : '-';
            },
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 90,
            filters: Object.entries(STATUS_CONFIG).map(([k, v]) => ({ text: v.label, value: k })),
            onFilter: (value, record) => record.status === value,
            render: (status) => (
                <Badge
                    status={status === 'pending' ? 'processing' : status === 'confirmed' ? 'success' : 'default'}
                    text={STATUS_CONFIG[status]?.label || status}
                />
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (date) => dayjs(date).format('MM-DD HH:mm'),
        },
        {
            title: '操作',
            key: 'action',
            width: 120,
            fixed: 'right',
            render: (_, record) => (
                <Space size={0}>
                    <Tooltip title="查看">
                        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onIntelSelect(record)} />
                    </Tooltip>
                    <Tooltip title="确认">
                        <Button type="link" size="small" icon={<CheckCircleOutlined />} />
                    </Tooltip>
                    <Dropdown
                        menu={{
                            items: [
                                { key: 'star', label: '收藏', icon: <StarOutlined /> },
                                { key: 'export', label: '导出', icon: <ExportOutlined /> },
                                { type: 'divider' },
                                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
                            ],
                        }}
                    >
                        <Button type="text" size="small" icon={<MoreOutlined />} />
                    </Dropdown>
                </Space>
            ),
        },
    ];

    const rowSelection: TableRowSelection<IntelItem> = {
        selectedRowKeys,
        onChange: setSelectedRowKeys,
    };

    // 批量操作菜单
    const batchMenuItems: MenuProps['items'] = [
        { key: 'confirm', label: '批量确认', icon: <CheckCircleOutlined /> },
        { key: 'star', label: '批量收藏', icon: <StarOutlined /> },
        { key: 'export', label: '批量导出', icon: <ExportOutlined /> },
        { type: 'divider' },
        { key: 'delete', label: '批量删除', icon: <DeleteOutlined />, danger: true },
    ];

    return (
        <Flex
            ref={containerRef}
            vertical
            style={{
                height: '100%',
                minHeight: 520,
                paddingBottom: 4,
            }}
        >
            {/* 批量操作栏 */}
            {selectedRowKeys.length > 0 && (
                <Flex
                    align="center"
                    gap={12}
                    style={{
                        padding: '8px 16px',
                        marginBottom: 16,
                        background: token.colorPrimaryBg,
                        borderRadius: token.borderRadius,
                    }}
                >
                    <Text>已选择 <strong>{selectedRowKeys.length}</strong> 项</Text>
                    <Dropdown menu={{ items: batchMenuItems }}>
                        <Button type="primary" size="small">批量操作</Button>
                    </Dropdown>
                    <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
                </Flex>
            )}

            {/* 表格 */}
            <div style={{ flex: 1, minHeight: 0 }}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={dataSource}
                    rowSelection={rowSelection}
                    loading={loading}
                    pagination={{
                        showSizeChanger: true,
                        showQuickJumper: true,
                        showTotal: (total) => `共 ${total} 条`,
                        pageSize: 10,
                    }}
                    scroll={{ x: 1000, y: scrollY }}
                    size="middle"
                    onRow={(record) => ({
                        onClick: () => onIntelSelect(record),
                        style: {
                            cursor: 'pointer',
                            background: selectedIntelId === record.id ? token.colorPrimaryBg : undefined,
                        },
                        'data-intel-id': record.intelId || record.id,
                    })}
                />
            </div>
        </Flex>
    );
};

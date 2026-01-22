import React, { useState } from 'react';
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
    Popconfirm,
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
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
}

// 模拟数据
const MOCK_TABLE_DATA: IntelItem[] = [
    {
        id: '1', type: 'intel', contentType: ContentType.DAILY_REPORT, sourceType: 'FIRST_LINE' as any,
        category: 'B_SEMI_STRUCTURED' as any, title: '锦州港玉米价格异动', summary: '锦州港玉米收购价上涨20元/吨',
        rawContent: '', effectiveTime: new Date(), createdAt: new Date(), location: '锦州港',
        region: ['辽宁省'], confidence: 92, qualityScore: 85, status: 'confirmed',
    },
    {
        id: '2', type: 'intel', contentType: ContentType.DAILY_REPORT, sourceType: 'FIRST_LINE' as any,
        category: 'B_SEMI_STRUCTURED' as any, title: '大连港玉米到港量下降', summary: '大连港今日玉米到港车辆较昨日减少15%',
        rawContent: '', effectiveTime: new Date(), createdAt: new Date(Date.now() - 3600000), location: '大连港',
        region: ['辽宁省'], confidence: 89, qualityScore: 80, status: 'pending',
    },
    {
        id: '3', type: 'intel', contentType: ContentType.RESEARCH_REPORT, sourceType: 'RESEARCH_INST' as any,
        category: 'C_DOCUMENT' as any, title: '2024年Q1玉米市场回顾与展望', summary: '本报告对2024年第一季度玉米市场进行了全面分析',
        rawContent: '', effectiveTime: new Date(Date.now() - 86400000), createdAt: new Date(Date.now() - 86400000),
        location: 'XX期货研究院', confidence: 88, qualityScore: 90, status: 'confirmed',
    },
    {
        id: '4', type: 'intel', contentType: ContentType.POLICY_DOC, sourceType: 'OFFICIAL_GOV' as any,
        category: 'C_DOCUMENT' as any, title: '关于加强粮食市场监管的通知', summary: '国家粮食和物资储备局发布通知',
        rawContent: '', effectiveTime: new Date(Date.now() - 172800000), createdAt: new Date(Date.now() - 172800000),
        location: '国家粮食局', confidence: 100, qualityScore: 95, status: 'confirmed',
    },
];

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
    filterState,
    onIntelSelect,
    selectedIntelId,
}) => {
    const { token } = theme.useToken();
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

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
                    RESEARCH_INST: '研究机构',
                    MEDIA: '媒体报道',
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
            render: (confidence) => confidence ? (
                <Tag color={confidence >= 80 ? 'green' : confidence >= 60 ? 'orange' : 'red'}>
                    {confidence}%
                </Tag>
            ) : '-',
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
        <div>
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
            <Table
                rowKey="id"
                columns={columns}
                dataSource={MOCK_TABLE_DATA}
                rowSelection={rowSelection}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total) => `共 ${total} 条`,
                }}
                scroll={{ x: 1000 }}
                size="middle"
                onRow={(record) => ({
                    onClick: () => onIntelSelect(record),
                    style: {
                        cursor: 'pointer',
                        background: selectedIntelId === record.id ? token.colorPrimaryBg : undefined,
                    },
                })}
            />
        </div>
    );
};

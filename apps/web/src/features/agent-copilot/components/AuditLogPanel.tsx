import React, { useState } from 'react';
import { Alert, Card, Empty, Flex, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { AuditOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import dayjs from 'dayjs';

const { Text } = Typography;

interface AuditLogItem {
    id: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    detail?: Record<string, unknown>;
    ipAddress?: string;
    createdAt: string;
}

interface AuditLogResponse {
    items: AuditLogItem[];
    total: number;
    page: number;
    pageSize: number;
}

const useAuditLogs = (params: { action?: string; resource?: string; page?: number }) =>
    useQuery<AuditLogResponse>({
        queryKey: ['audit-logs', params],
        queryFn: async () => {
            const res = await apiClient.get<AuditLogResponse>('/audit-logs', { params });
            return res.data;
        },
    });

const actionColor: Record<string, string> = {
    CREATE: 'green',
    UPDATE: 'blue',
    DELETE: 'red',
    EXECUTE: 'purple',
    DELIVER: 'cyan',
};

interface AuditLogPanelProps {
    sessionId: string | null;
}

/**
 * 审计日志面板（PRD NFR-006）
 */
export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ sessionId }) => {
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState<string | undefined>();
    const [resourceFilter, setResourceFilter] = useState<string | undefined>();

    const query = useAuditLogs({ action: actionFilter, resource: resourceFilter, page });

    if (!sessionId) {
        return <Alert type="info" showIcon message="请先选择会话后再查看审计日志" />;
    }

    return (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card
                size="small"
                title={
                    <Space size={6}>
                        <AuditOutlined />
                        <span>操作审计日志</span>
                    </Space>
                }
                extra={
                    <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => void query.refetch()}
                    >
                        刷新
                    </Button>
                }
            >
                <Flex gap={8} wrap="wrap">
                    <Select
                        size="small"
                        placeholder="操作类型"
                        allowClear
                        style={{ width: 120 }}
                        value={actionFilter}
                        onChange={setActionFilter}
                        options={[
                            { label: '创建', value: 'CREATE' },
                            { label: '更新', value: 'UPDATE' },
                            { label: '删除', value: 'DELETE' },
                            { label: '执行', value: 'EXECUTE' },
                            { label: '投递', value: 'DELIVER' },
                        ]}
                    />
                    <Select
                        size="small"
                        placeholder="资源类型"
                        allowClear
                        style={{ width: 140 }}
                        value={resourceFilter}
                        onChange={setResourceFilter}
                        options={[
                            { label: '会话', value: 'conversations' },
                            { label: '工作流', value: 'workflow-definitions' },
                            { label: '订阅', value: 'subscriptions' },
                            { label: '导出', value: 'report-exports' },
                            { label: '连接器', value: 'data-connectors' },
                        ]}
                    />
                </Flex>
            </Card>

            {query.isLoading ? (
                <Flex justify="center" style={{ padding: 24 }}>
                    <Spin size="small" />
                </Flex>
            ) : query.data && query.data.items.length > 0 ? (
                <Table
                    size="small"
                    dataSource={query.data.items}
                    rowKey="id"
                    pagination={{
                        current: page,
                        pageSize: query.data.pageSize,
                        total: query.data.total,
                        onChange: setPage,
                        size: 'small',
                    }}
                    columns={[
                        {
                            title: '时间',
                            dataIndex: 'createdAt',
                            width: 140,
                            render: (v: string) => (
                                <Text style={{ fontSize: 11 }}>{dayjs(v).format('MM-DD HH:mm:ss')}</Text>
                            ),
                        },
                        {
                            title: '操作',
                            dataIndex: 'action',
                            width: 80,
                            render: (v: string) => <Tag color={actionColor[v] ?? 'default'}>{v}</Tag>,
                        },
                        {
                            title: '资源',
                            dataIndex: 'resource',
                            width: 120,
                            ellipsis: true,
                        },
                        {
                            title: '资源 ID',
                            dataIndex: 'resourceId',
                            width: 100,
                            ellipsis: true,
                            render: (v?: string) => (
                                <Text copyable={!!v} style={{ fontSize: 11 }}>{v ?? '-'}</Text>
                            ),
                        },
                        {
                            title: 'IP',
                            dataIndex: 'ipAddress',
                            width: 110,
                            render: (v?: string) => <Text style={{ fontSize: 11 }}>{v ?? '-'}</Text>,
                        },
                    ]}
                />
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无审计日志" />
            )}
        </Space>
    );
};

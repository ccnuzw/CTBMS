import { useState } from 'react';
import {
    Card,
    Table,
    Input,
    Tag,
    Typography,
    Flex,
    Timeline,
    Empty,
    Spin,
} from 'antd';
import {
    AuditOutlined,
    SearchOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';

const { Title, Text } = Typography;

// ─── API Hook ───────────────────────────────────────────────────────

function useAuditTrace(sessionId: string) {
    return useQuery({
        queryKey: ['audit-trace', sessionId],
        queryFn: async () => {
            const res = await fetch(`/api/audit-logs/trace/${sessionId}`);
            if (!res.ok) throw new Error('Failed to fetch trace');
            return res.json();
        },
        enabled: sessionId.length >= 8,
    });
}

// ─── Component ──────────────────────────────────────────────────────

const actionColorMap: Record<string, string> = {
    CREATE: 'green',
    UPDATE: 'blue',
    DELETE: 'red',
    EXECUTE: 'purple',
    EXPORT: 'orange',
    DELIVER: 'cyan',
};

export const AuditTracePanel = () => {
    const [sessionId, setSessionId] = useState('');
    const { data, isLoading, isFetching } = useAuditTrace(sessionId);

    const traceItems = data?.items ?? [];

    const columns = [
        {
            title: '时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 180,
            render: (t: string) => new Date(t).toLocaleString(),
        },
        {
            title: '操作',
            dataIndex: 'action',
            key: 'action',
            width: 120,
            render: (action: string) => (
                <Tag color={actionColorMap[action] ?? 'default'}>{action}</Tag>
            ),
        },
        {
            title: '资源',
            dataIndex: 'resource',
            key: 'resource',
            width: 200,
        },
        {
            title: '资源 ID',
            dataIndex: 'resourceId',
            key: 'resourceId',
            width: 200,
            render: (id: string) => id ? <Text copyable>{id.slice(0, 12)}...</Text> : '—',
        },
        {
            title: '用户',
            dataIndex: 'userId',
            key: 'userId',
            width: 120,
            render: (id: string) => <Text copyable>{id.slice(0, 8)}</Text>,
        },
    ];

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <AuditOutlined />
                    <Title level={5} style={{ margin: 0 }}>审计链路追踪</Title>
                </Flex>
            }
        >
            <Input
                prefix={<SearchOutlined />}
                placeholder="输入会话 Session ID 查询全链路审计日志"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.trim())}
                style={{ marginBottom: 24 }}
                size="large"
                allowClear
                suffix={isFetching ? <Spin size="small" /> : null}
            />

            {sessionId.length >= 8 && traceItems.length > 0 ? (
                <>
                    <Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
                        共 {data?.traceCount ?? 0} 条审计记录
                    </Text>

                    <Timeline
                        style={{ marginBottom: 24 }}
                        items={traceItems.slice(0, 10).map((item: {
                            action: string;
                            resource: string;
                            createdAt: string;
                        }) => ({
                            color: actionColorMap[item.action] ?? 'gray',
                            dot: <ClockCircleOutlined />,
                            children: (
                                <Flex vertical>
                                    <Text strong>
                                        <Tag color={actionColorMap[item.action] ?? 'default'} style={{ marginRight: 4 }}>
                                            {item.action}
                                        </Tag>
                                        {item.resource}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {new Date(item.createdAt).toLocaleString()}
                                    </Text>
                                </Flex>
                            ),
                        }))}
                    />

                    <Table
                        columns={columns}
                        dataSource={traceItems}
                        rowKey="id"
                        loading={isLoading}
                        pagination={{ pageSize: 20 }}
                        size="small"
                        scroll={{ x: 800 }}
                    />
                </>
            ) : sessionId.length >= 8 && !isLoading ? (
                <Empty description="未找到审计记录" />
            ) : (
                <Empty description="请输入 Session ID 查询" />
            )}
        </Card>
    );
};

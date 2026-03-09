import {
    Card,
    Table,
    Tag,
    Typography,
    Flex,
    Statistic,
    Row,
    Col,
    Progress,
} from 'antd';
import {
    ApiOutlined,
    CheckCircleOutlined,
    QuestionCircleOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';

const { Title, Text } = Typography;

// ─── API Hook ───────────────────────────────────────────────────────

function useConnectorHealthTimeSeries() {
    return useQuery({
        queryKey: ['connector-health-time-series'],
        queryFn: async () => {
            const res = await fetch('/api/data-connectors/health/time-series');
            if (!res.ok) throw new Error('Failed to fetch health');
            return res.json();
        },
        refetchInterval: 30000, // 每 30 秒轮询
    });
}

// ─── Component ──────────────────────────────────────────────────────

export const ConnectorHealthDashboard = () => {
    const { data, isLoading } = useConnectorHealthTimeSeries();

    const summary = data?.summary ?? { healthy: 0, unknown: 0, inactive: 0 };
    const connectors = data?.connectors ?? [];
    const total = data?.total ?? 0;
    const healthyPct = total > 0 ? Math.round((summary.healthy / total) * 100) : 0;

    const statusColor = (status: string) => {
        switch (status) {
            case 'HEALTHY': return 'green';
            case 'DEGRADED': return 'orange';
            case 'UNHEALTHY': return 'red';
            default: return 'default';
        }
    };

    const statusIcon = (status: string) => {
        switch (status) {
            case 'HEALTHY': return <CheckCircleOutlined />;
            case 'UNHEALTHY': return <CloseCircleOutlined />;
            default: return <QuestionCircleOutlined />;
        }
    };

    const columns = [
        {
            title: '连接器',
            dataIndex: 'connectorCode',
            key: 'connectorCode',
            render: (code: string, record: { connectorName: string }) => (
                <Flex vertical>
                    <Text strong>{record.connectorName}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{code}</Text>
                </Flex>
            ),
        },
        {
            title: '类型',
            dataIndex: 'connectorType',
            key: 'connectorType',
            width: 140,
            render: (type: string) => <Tag>{type}</Tag>,
        },
        {
            title: '推断健康状态',
            dataIndex: 'inferredHealth',
            key: 'inferredHealth',
            width: 140,
            render: (status: string) => (
                <Tag icon={statusIcon(status)} color={statusColor(status)}>
                    {status}
                </Tag>
            ),
        },
        {
            title: '最近更新',
            dataIndex: 'lastUpdatedAt',
            key: 'lastUpdatedAt',
            width: 180,
            render: (t: string) => t ? new Date(t).toLocaleString() : '—',
        },
    ];

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <ApiOutlined />
                    <Title level={5} style={{ margin: 0 }}>连接器健康看板</Title>
                </Flex>
            }
            extra={
                <Text type="secondary">
                    {data?.checkedAt ? `最近检查: ${new Date(data.checkedAt).toLocaleTimeString()}` : ''}
                </Text>
            }
        >
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                    <Statistic title="活跃连接器" value={total} />
                </Col>
                <Col span={6}>
                    <Statistic
                        title="健康"
                        value={summary.healthy}
                        valueStyle={{ color: '#52c41a' }}
                    />
                </Col>
                <Col span={6}>
                    <Statistic
                        title="未知/待检测"
                        value={summary.unknown}
                        valueStyle={{ color: '#faad14' }}
                    />
                </Col>
                <Col span={6}>
                    <Flex vertical align="center">
                        <Text type="secondary" style={{ marginBottom: 4 }}>可用率</Text>
                        <Progress
                            type="circle"
                            percent={healthyPct}
                            size={60}
                            strokeColor={healthyPct >= 80 ? '#52c41a' : healthyPct >= 50 ? '#faad14' : '#ff4d4f'}
                        />
                    </Flex>
                </Col>
            </Row>

            <Table
                columns={columns}
                dataSource={connectors}
                rowKey="connectorId"
                loading={isLoading}
                pagination={false}
                size="middle"
            />
        </Card>
    );
};

import { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Typography,
    Flex,
    Statistic,
    Row,
    Col,
    message,
    Popconfirm,
    Descriptions,
    Modal,
} from 'antd';
import {
    HistoryOutlined,
    RollbackOutlined,
    ApartmentOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const { Title, Text } = Typography;

const PARAM_API = '/api/parameter-center/sets';

// ─── API Hooks ──────────────────────────────────────────────────────

function usePublishHistory(parameterSetId: string) {
    return useQuery({
        queryKey: ['param-publish-history', parameterSetId],
        queryFn: async () => {
            const res = await fetch(`${PARAM_API}/${parameterSetId}/publish-history`);
            if (!res.ok) throw new Error('Failed to fetch history');
            return res.json();
        },
        enabled: Boolean(parameterSetId),
    });
}

function useRollbackSet(parameterSetId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (version: number) => {
            const res = await fetch(`${PARAM_API}/${parameterSetId}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version }),
            });
            if (!res.ok) throw new Error('Failed to rollback');
            return res.json();
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['param-publish-history', parameterSetId] });
        },
    });
}

function useImpactAnalysis(parameterSetId: string) {
    return useQuery({
        queryKey: ['param-impact', parameterSetId],
        queryFn: async () => {
            const res = await fetch(`${PARAM_API}/${parameterSetId}/impact`);
            if (!res.ok) throw new Error('Failed to fetch impact');
            return res.json();
        },
        enabled: Boolean(parameterSetId),
    });
}

// ─── Component ──────────────────────────────────────────────────────

interface ParameterVersionPanelProps {
    parameterSetId: string;
    parameterSetName?: string;
}

export const ParameterVersionPanel = ({
    parameterSetId,
    parameterSetName = '参数包',
}: ParameterVersionPanelProps) => {
    const { data: historyData, isLoading: isLoadingHistory } = usePublishHistory(parameterSetId);
    const { data: impactData } = useImpactAnalysis(parameterSetId);
    const rollbackMutation = useRollbackSet(parameterSetId);
    const [isImpactModalOpen, setIsImpactModalOpen] = useState(false);

    const history = historyData?.snapshots ?? [];

    const handleRollback = (version: number) => {
        rollbackMutation.mutate(version, {
            onSuccess: () => message.success(`已回滚到版本 v${version}`),
            onError: () => message.error('回滚失败'),
        });
    };

    const columns = [
        {
            title: '版本',
            dataIndex: 'version',
            key: 'version',
            width: 80,
            render: (v: number) => <Tag color="blue">v{v}</Tag>,
        },
        {
            title: '备注',
            dataIndex: 'comment',
            key: 'comment',
            ellipsis: true,
            render: (text: string) => text || <Text type="secondary">—</Text>,
        },
        {
            title: '发布时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 180,
            render: (t: string) => new Date(t).toLocaleString(),
        },
        {
            title: '操作者',
            dataIndex: 'createdByUserId',
            key: 'createdByUserId',
            width: 120,
            render: (id: string) => id ? <Text copyable>{id.slice(0, 8)}</Text> : '—',
        },
        {
            title: '操作',
            key: 'actions',
            width: 100,
            render: (_: unknown, record: { version: number }) => (
                <Popconfirm
                    title={`确定回滚到 v${record.version}？`}
                    description="当前版本参数将被覆盖"
                    onConfirm={() => handleRollback(record.version)}
                >
                    <Button
                        type="link"
                        icon={<RollbackOutlined />}
                        loading={rollbackMutation.isPending}
                    >
                        回滚
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <HistoryOutlined />
                    <Title level={5} style={{ margin: 0 }}>{parameterSetName} — 版本历史</Title>
                </Flex>
            }
            extra={
                <Button icon={<ApartmentOutlined />} onClick={() => setIsImpactModalOpen(true)}>
                    影响面分析
                </Button>
            }
        >
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                    <Statistic title="总版本数" value={history.length} />
                </Col>
                <Col span={8}>
                    <Statistic title="当前版本" value={history[0]?.version ?? 0} prefix="v" />
                </Col>
                <Col span={8}>
                    <Statistic
                        title="最近发布"
                        value={history[0]?.createdAt ? new Date(history[0].createdAt).toLocaleDateString() : '—'}
                    />
                </Col>
            </Row>

            <Table
                columns={columns}
                dataSource={history}
                rowKey="id"
                loading={isLoadingHistory}
                pagination={{ pageSize: 10 }}
                size="small"
            />

            <Modal
                title="影响面分析"
                open={isImpactModalOpen}
                onCancel={() => setIsImpactModalOpen(false)}
                footer={null}
                width={600}
            >
                {impactData ? (
                    <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label="引用的工作流">
                            {impactData?.workflowCount ?? 0} 个
                        </Descriptions.Item>
                        <Descriptions.Item label="引用的智能体">
                            {impactData?.agentCount ?? 0} 个
                        </Descriptions.Item>
                        <Descriptions.Item label="关联指标">
                            {impactData?.metricCount ?? 0} 个
                        </Descriptions.Item>
                        <Descriptions.Item label="风险等级">
                            <Tag color={impactData?.riskLevel === 'HIGH' ? 'red' : impactData?.riskLevel === 'MEDIUM' ? 'orange' : 'green'}>
                                {impactData?.riskLevel ?? 'LOW'}
                            </Tag>
                        </Descriptions.Item>
                    </Descriptions>
                ) : (
                    <Text type="secondary">加载中...</Text>
                )}
            </Modal>
        </Card>
    );
};

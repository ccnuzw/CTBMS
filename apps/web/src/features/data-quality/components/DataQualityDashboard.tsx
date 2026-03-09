import { useMemo } from 'react';
import {
    Card,
    Col,
    Flex,
    Progress,
    Row,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
    theme,
    Spin,
    Tooltip,
} from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    DashboardOutlined,
    ApiOutlined,
    SafetyCertificateOutlined,
    ExperimentOutlined,
    ThunderboltOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useDataQuality } from '../api';
import type { DataQualityAggregation } from '../api';

const { Text, Title } = Typography;

const GRADE_CONFIG = {
    A: { color: '#52c41a', label: '优秀', bgColor: 'rgba(82,196,26,0.1)' },
    B: { color: '#1677ff', label: '良好', bgColor: 'rgba(22,119,255,0.1)' },
    C: { color: '#faad14', label: '一般', bgColor: 'rgba(250,173,20,0.1)' },
    D: { color: '#ff4d4f', label: '较差', bgColor: 'rgba(255,77,79,0.1)' },
};

const DIMENSION_CONFIG = [
    { key: 'completeness', label: '完整性', icon: <CheckCircleOutlined /> },
    { key: 'timeliness', label: '时效性', icon: <ClockCircleOutlined /> },
    { key: 'consistency', label: '一致性', icon: <SafetyCertificateOutlined /> },
    { key: 'anomalyStability', label: '稳定性', icon: <ExperimentOutlined /> },
] as const;

const DOMAIN_LABELS: Record<string, string> = {
    SPOT_PRICE: '现货价格',
    FUTURES: '期货数据',
    EXTERNAL: '外部 API',
    KNOWLEDGE: '知识库',
    OTHER: '其他',
};

export const DataQualityDashboard = () => {
    const { token } = theme.useToken();
    const { data: quality, isLoading } = useDataQuality({ days: 7 });

    const gradeConfig = useMemo(() => {
        return quality ? GRADE_CONFIG[quality.grade] : GRADE_CONFIG.B;
    }, [quality]);

    if (isLoading || !quality) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Spin size="large">
                    <div style={{ width: 1, height: 1 }} />
                </Spin>
            </Flex>
        );
    }

    const domainColumns: ColumnsType<DataQualityAggregation['domainBreakdown'][0]> = [
        {
            title: '数据域',
            dataIndex: 'domain',
            key: 'domain',
            render: (d: string) => (
                <Space>
                    <ApiOutlined style={{ color: token.colorPrimary }} />
                    <Text strong>{DOMAIN_LABELS[d] ?? d}</Text>
                </Space>
            ),
        },
        {
            title: '评分',
            dataIndex: 'score',
            key: 'score',
            width: 100,
            render: (s: number) => (
                <Progress
                    percent={s}
                    size="small"
                    strokeColor={s >= 90 ? '#52c41a' : s >= 70 ? '#1677ff' : s >= 50 ? '#faad14' : '#ff4d4f'}
                />
            ),
        },
        {
            title: '等级',
            dataIndex: 'grade',
            key: 'grade',
            width: 80,
            align: 'center',
            render: (g: 'A' | 'B' | 'C' | 'D') => (
                <Tag color={GRADE_CONFIG[g].color}>{GRADE_CONFIG[g].label}</Tag>
            ),
        },
        {
            title: '数据集数',
            dataIndex: 'datasetCount',
            key: 'datasetCount',
            width: 100,
            align: 'right',
        },
        {
            title: '最近采集',
            dataIndex: 'latestFetchAt',
            key: 'latestFetchAt',
            width: 160,
            render: (v: string | null) =>
                v ? (
                    <Tooltip title={v}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(v).toLocaleString('zh-CN')}
                        </Text>
                    </Tooltip>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
    ];

    return (
        <Flex vertical gap={16}>
            {/* 顶部概览 */}
            <Row gutter={16}>
                {/* 总分卡 */}
                <Col xs={24} md={6}>
                    <Card
                        style={{
                            background: `linear-gradient(135deg, ${gradeConfig.bgColor}, ${token.colorBgContainer})`,
                            borderColor: gradeConfig.color,
                        }}
                    >
                        <Flex vertical align="center" gap={8}>
                            <DashboardOutlined style={{ fontSize: 28, color: gradeConfig.color }} />
                            <Statistic
                                title="数据质量总分"
                                value={quality.overallScore}
                                suffix="/ 100"
                                valueStyle={{ color: gradeConfig.color, fontSize: 36, fontWeight: 700 }}
                            />
                            <Tag
                                color={gradeConfig.color}
                                style={{ fontSize: 14, padding: '4px 16px' }}
                            >
                                {gradeConfig.label}
                            </Tag>
                        </Flex>
                    </Card>
                </Col>

                {/* 四维度 */}
                {DIMENSION_CONFIG.map((dim) => (
                    <Col xs={12} md={4} lg={4} key={dim.key}>
                        <Card size="small">
                            <Flex vertical align="center" gap={4}>
                                <span style={{ fontSize: 18, color: token.colorPrimary }}>{dim.icon}</span>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {dim.label}
                                </Text>
                                <Progress
                                    type="circle"
                                    percent={quality.dimensions[dim.key]}
                                    size={64}
                                    strokeColor={
                                        quality.dimensions[dim.key] >= 80
                                            ? token.colorSuccess
                                            : quality.dimensions[dim.key] >= 50
                                                ? token.colorWarning
                                                : token.colorError
                                    }
                                    format={(p) => <span style={{ fontSize: 14 }}>{p}</span>}
                                />
                            </Flex>
                        </Card>
                    </Col>
                ))}

                {/* 概要统计 */}
                <Col xs={24} md={6} lg={6}>
                    <Card size="small" style={{ height: '100%' }}>
                        <Flex vertical gap={16} justify="center" style={{ height: '100%' }}>
                            <Statistic
                                title="活跃连接器"
                                value={quality.activeConnectorCount}
                                prefix={<ApiOutlined style={{ color: token.colorPrimary }} />}
                            />
                            <Statistic
                                title="采集成功率"
                                value={quality.fetchSuccessRate}
                                suffix="%"
                                prefix={<ThunderboltOutlined style={{ color: token.colorSuccess }} />}
                            />
                        </Flex>
                    </Card>
                </Col>
            </Row>

            {/* 趋势 + 域分组 */}
            <Row gutter={16}>
                {/* 7 日趋势 */}
                <Col xs={24} md={12}>
                    <Card
                        title={
                            <Space>
                                <SyncOutlined />
                                <span>7 日质量趋势</span>
                            </Space>
                        }
                        size="small"
                    >
                        <Flex vertical gap={8}>
                            {quality.trend.length === 0 ? (
                                <Text type="secondary" style={{ textAlign: 'center', padding: 32 }}>
                                    暂无趋势数据
                                </Text>
                            ) : (
                                quality.trend.map((tp) => (
                                    <Flex key={tp.date} justify="space-between" align="center">
                                        <Text style={{ fontSize: 12, width: 80 }}>{tp.date.slice(5)}</Text>
                                        <Progress
                                            percent={tp.score}
                                            size="small"
                                            style={{ flex: 1, margin: '0 12px' }}
                                            strokeColor={tp.score >= 80 ? '#52c41a' : tp.score >= 50 ? '#faad14' : '#ff4d4f'}
                                        />
                                        <Space size={16} style={{ minWidth: 100 }}>
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {tp.fetchCount} 次
                                            </Text>
                                            {tp.errorCount > 0 && (
                                                <Text type="danger" style={{ fontSize: 11 }}>
                                                    {tp.errorCount} 错
                                                </Text>
                                            )}
                                        </Space>
                                    </Flex>
                                ))
                            )}
                        </Flex>
                    </Card>
                </Col>

                {/* 域分组 */}
                <Col xs={24} md={12}>
                    <Card
                        title={
                            <Space>
                                <ApiOutlined />
                                <span>数据域质量明细</span>
                            </Space>
                        }
                        size="small"
                    >
                        <Table
                            columns={domainColumns}
                            dataSource={quality.domainBreakdown}
                            rowKey="domain"
                            size="small"
                            pagination={false}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 底部元信息 */}
            <Flex justify="flex-end">
                <Text type="secondary" style={{ fontSize: 11 }}>
                    数据更新时间：{new Date(quality.generatedAt).toLocaleString('zh-CN')}
                </Text>
            </Flex>
        </Flex>
    );
};

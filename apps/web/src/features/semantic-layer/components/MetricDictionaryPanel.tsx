import { useState, useMemo } from 'react';
import {
    Card,
    Table,
    Tag,
    Space,
    Input,
    Select,
    Typography,
    Flex,
    Badge,
    Tooltip,
    Statistic,
    Row,
    Col,
    theme,
} from 'antd';
import {
    SearchOutlined,
    ThunderboltOutlined,
    ClockCircleOutlined,
    DatabaseOutlined,
    FunctionOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMetricDefinitions } from '../api';
import type { MetricDefinition } from '@packages/types';

const { Text, Title } = Typography;

const DOMAIN_COLOR_MAP: Record<string, string> = {
    SPOT_PRICE: 'blue',
    FUTURES: 'purple',
    BASIS: 'cyan',
    INVENTORY: 'orange',
    COST: 'gold',
    LOGISTICS: 'green',
    WEATHER: 'geekblue',
    SUPPLY_DEMAND: 'magenta',
    RISK: 'red',
};

const DOMAIN_LABEL_MAP: Record<string, string> = {
    SPOT_PRICE: '现货价格',
    FUTURES: '期货',
    BASIS: '基差',
    INVENTORY: '库存',
    COST: '成本',
    LOGISTICS: '物流',
    WEATHER: '天气',
    SUPPLY_DEMAND: '供需',
    RISK: '风险',
};

const FREQUENCY_LABEL_MAP: Record<string, string> = {
    REAL_TIME: '实时',
    MINUTE: '分钟',
    HOURLY: '小时',
    DAILY: '日频',
    WEEKLY: '周频',
    MONTHLY: '月频',
};

const DATA_TYPE_ICON_MAP: Record<string, React.ReactNode> = {
    NUMERIC: <FunctionOutlined />,
    PERCENTAGE: <span>%</span>,
    INDEX: <ThunderboltOutlined />,
    CATEGORY: <DatabaseOutlined />,
    BOOLEAN: <span>⊘</span>,
};

export const MetricDictionaryPanel = () => {
    const { token } = theme.useToken();
    const [keyword, setKeyword] = useState('');
    const [domain, setDomain] = useState<string | undefined>();
    const [frequency, setFrequency] = useState<string | undefined>();
    const [page, setPage] = useState(1);

    const { data: result, isLoading } = useMetricDefinitions({
        keyword: keyword || undefined,
        domain: domain as MetricDefinition['domain'],
        frequency: frequency as MetricDefinition['frequency'],
        page,
        pageSize: 20,
    });

    const stats = useMemo(() => {
        if (!result) return { total: 0, domains: 0, active: 0 };
        const domainSet = new Set(result.data.map((m) => m.domain));
        return {
            total: result.total,
            domains: domainSet.size,
            active: result.data.filter((m) => m.isActive).length,
        };
    }, [result]);

    const columns: ColumnsType<MetricDefinition> = [
        {
            title: '指标代码',
            dataIndex: 'metricCode',
            key: 'metricCode',
            width: 200,
            render: (code: string) => (
                <Text strong copyable style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {code}
                </Text>
            ),
        },
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (name: string, record: MetricDefinition) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{name}</Text>
                    {record.nameEn && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.nameEn}
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: '数据域',
            dataIndex: 'domain',
            key: 'domain',
            width: 100,
            render: (d: string) => (
                <Tag color={DOMAIN_COLOR_MAP[d] ?? 'default'}>{DOMAIN_LABEL_MAP[d] ?? d}</Tag>
            ),
        },
        {
            title: '类型',
            dataIndex: 'dataType',
            key: 'dataType',
            width: 80,
            align: 'center',
            render: (dt: string) => (
                <Tooltip title={dt}>
                    <span style={{ fontSize: 16 }}>{DATA_TYPE_ICON_MAP[dt] ?? dt}</span>
                </Tooltip>
            ),
        },
        {
            title: '频率',
            dataIndex: 'frequency',
            key: 'frequency',
            width: 80,
            render: (f: string) => (
                <Space size={4}>
                    <ClockCircleOutlined style={{ color: token.colorTextSecondary }} />
                    <Text type="secondary">{FREQUENCY_LABEL_MAP[f] ?? f}</Text>
                </Space>
            ),
        },
        {
            title: 'TTL',
            dataIndex: 'ttlMinutes',
            key: 'ttlMinutes',
            width: 80,
            align: 'right',
            render: (ttl: number) => <Text type="secondary">{ttl}m</Text>,
        },
        {
            title: '单位',
            dataIndex: 'unit',
            key: 'unit',
            width: 80,
            render: (u: string | null) => u ? <Tag>{u}</Tag> : <Text type="secondary">—</Text>,
        },
        {
            title: '公式',
            dataIndex: 'formula',
            key: 'formula',
            width: 200,
            ellipsis: { showTitle: false },
            render: (f: string | null) =>
                f ? (
                    <Tooltip title={f}>
                        <Text code style={{ fontSize: 12 }}>
                            {f}
                        </Text>
                    </Tooltip>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 80,
            align: 'center',
            render: (active: boolean) => (
                <Badge status={active ? 'success' : 'default'} text={active ? '活跃' : '停用'} />
            ),
        },
    ];

    return (
        <Flex vertical gap={16}>
            {/* 统计卡片 */}
            <Row gutter={16}>
                <Col xs={8}>
                    <Card size="small">
                        <Statistic
                            title="指标总数"
                            value={stats.total}
                            prefix={<DatabaseOutlined style={{ color: token.colorPrimary }} />}
                        />
                    </Card>
                </Col>
                <Col xs={8}>
                    <Card size="small">
                        <Statistic
                            title="覆盖数据域"
                            value={stats.domains}
                            prefix={<ThunderboltOutlined style={{ color: token.colorSuccess }} />}
                        />
                    </Card>
                </Col>
                <Col xs={8}>
                    <Card size="small">
                        <Statistic
                            title="活跃指标"
                            value={stats.active}
                            prefix={<ClockCircleOutlined style={{ color: token.colorWarning }} />}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 主表格 */}
            <Card
                title={
                    <Flex align="center" gap={8}>
                        <DatabaseOutlined />
                        <Title level={5} style={{ margin: 0 }}>
                            指标字典
                        </Title>
                    </Flex>
                }
                extra={
                    <Space>
                        <Input
                            placeholder="搜索指标代码或名称"
                            prefix={<SearchOutlined />}
                            allowClear
                            style={{ width: 220 }}
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                setPage(1);
                            }}
                        />
                        <Select
                            allowClear
                            placeholder="数据域"
                            style={{ width: 120 }}
                            value={domain}
                            onChange={(v) => {
                                setDomain(v);
                                setPage(1);
                            }}
                            options={Object.entries(DOMAIN_LABEL_MAP).map(([value, label]) => ({
                                value,
                                label,
                            }))}
                        />
                        <Select
                            allowClear
                            placeholder="频率"
                            style={{ width: 100 }}
                            value={frequency}
                            onChange={(v) => {
                                setFrequency(v);
                                setPage(1);
                            }}
                            options={Object.entries(FREQUENCY_LABEL_MAP).map(([value, label]) => ({
                                value,
                                label,
                            }))}
                        />
                    </Space>
                }
            >
                <Table<MetricDefinition>
                    columns={columns}
                    dataSource={result?.data}
                    loading={isLoading}
                    rowKey="metricCode"
                    size="middle"
                    scroll={{ x: 1000 }}
                    pagination={{
                        current: page,
                        total: result?.total ?? 0,
                        pageSize: 20,
                        showSizeChanger: false,
                        showTotal: (total) => `共 ${total} 项`,
                        onChange: setPage,
                    }}
                />
            </Card>
        </Flex>
    );
};

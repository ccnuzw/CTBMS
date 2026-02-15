import React, { useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import {
    App,
    Button,
    DatePicker,
    Drawer,
    Flex,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Timeline,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    type AlertStatusLog,
    useAlertLogs,
    useAlerts,
    useAlertRules,
    useCreateAlertRule,
    useDeleteAlertRule,
    useEvaluateAlerts,
    useUpdateAlertRule,
    useUpdateAlertStatus,
    type MarketAlert,
    type MarketAlertRule,
} from '../api/hooks';
import { useDictionary } from '@/hooks/useDictionaries';

const { Title, Text } = Typography;

type RuleForm = {
    name: string;
    type: MarketAlertRule['type'];
    threshold?: number;
    days?: number;
    direction?: 'UP' | 'DOWN' | 'BOTH';
    severity: MarketAlertRule['severity'];
    priority: number;
    isActive: boolean;
};

const RULE_TYPE_OPTIONS = [
    { label: '单日涨跌额', value: 'DAY_CHANGE_ABS' },
    { label: '单日涨跌幅', value: 'DAY_CHANGE_PCT' },
    { label: '偏离均值幅度', value: 'DEVIATION_FROM_MEAN_PCT' },
    { label: '连续涨跌', value: 'CONTINUOUS_DAYS' },
] as const;

const SEVERITY_OPTIONS = [
    { label: '低', value: 'LOW' },
    { label: '中', value: 'MEDIUM' },
    { label: '高', value: 'HIGH' },
    { label: '严重', value: 'CRITICAL' },
] as const;

const SEVERITY_COLOR: Record<MarketAlert['severity'], string> = {
    LOW: 'default',
    MEDIUM: 'blue',
    HIGH: 'orange',
    CRITICAL: 'red',
};

const STATUS_COLOR: Record<MarketAlert['status'], string> = {
    OPEN: 'red',
    ACKNOWLEDGED: 'blue',
    CLOSED: 'green',
};

export const AlertCenterPage: React.FC = () => {
    const { message } = App.useApp();
    const { data: commodityDict } = useDictionary('COMMODITY');

    const [commodity, setCommodity] = useState<string>();
    const [severity, setSeverity] = useState<MarketAlert['severity']>();
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => [
        dayjs().subtract(29, 'day'),
        dayjs(),
    ]);
    const [editingRule, setEditingRule] = useState<MarketAlertRule | null>(null);
    const [ruleModalVisible, setRuleModalVisible] = useState(false);
    const [closingAlert, setClosingAlert] = useState<MarketAlert | null>(null);
    const [closeReason, setCloseReason] = useState('');
    const [logAlertId, setLogAlertId] = useState<string>();
    const [form] = Form.useForm<RuleForm>();

    const query = useMemo(() => ({
        commodity,
        severity,
        startDate: dateRange?.[0]?.startOf('day').toDate(),
        endDate: dateRange?.[1]?.endOf('day').toDate(),
        limit: 200,
        refresh: false,
    }), [commodity, severity, dateRange]);

    const alertsQuery = useAlerts(query);
    const rulesQuery = useAlertRules();
    const createRule = useCreateAlertRule();
    const updateRule = useUpdateAlertRule();
    const deleteRule = useDeleteAlertRule();
    const updateStatus = useUpdateAlertStatus();
    const evaluateAlerts = useEvaluateAlerts();
    const alertLogsQuery = useAlertLogs(logAlertId);

    const openCreateModal = () => {
        setEditingRule(null);
        form.setFieldsValue({
            name: '',
            type: 'DAY_CHANGE_ABS',
            threshold: 20,
            direction: 'BOTH',
            severity: 'MEDIUM',
            priority: 0,
            isActive: true,
        });
        setRuleModalVisible(true);
    };

    const openEditModal = (rule: MarketAlertRule) => {
        setEditingRule(rule);
        form.setFieldsValue({
            name: rule.name,
            type: rule.type,
            threshold: rule.threshold,
            days: rule.days,
            direction: rule.direction || 'BOTH',
            severity: rule.severity,
            priority: rule.priority,
            isActive: rule.isActive,
        });
        setRuleModalVisible(true);
    };

    const handleSaveRule = async () => {
        const values = await form.validateFields();
        if (editingRule) {
            await updateRule.mutateAsync({ id: editingRule.id, payload: values });
            message.success('规则已更新');
        } else {
            await createRule.mutateAsync(values as any);
            message.success('规则已创建');
        }
        setRuleModalVisible(false);
    };

    const handleRunEvaluate = async () => {
        const result = await evaluateAlerts.mutateAsync(query);
        message.success(
            `预警重算完成：命中 ${result.total}，新建 ${result.created}，更新 ${result.updated}，自动关闭 ${result.closed ?? 0}`,
        );
    };

    const openCloseModal = (record: MarketAlert) => {
        setClosingAlert(record);
        setCloseReason(record.note || '');
    };

    const handleCloseAlert = async () => {
        if (!closingAlert) return;
        const reason = closeReason.trim();
        if (reason.length < 4) {
            message.error('关闭原因至少 4 个字');
            return;
        }
        await updateStatus.mutateAsync({
            id: closingAlert.id,
            status: 'CLOSED',
            note: reason,
            reason,
        });
        message.success('预警已关闭');
        setClosingAlert(null);
        setCloseReason('');
    };

    const alertColumns: ColumnsType<MarketAlert> = [
        {
            title: '时间',
            dataIndex: 'date',
            key: 'date',
            width: 110,
            render: (value) => dayjs(value).format('MM-DD HH:mm'),
        },
        {
            title: '级别',
            dataIndex: 'severity',
            key: 'severity',
            width: 90,
            render: (value: MarketAlert['severity']) => (
                <Tag color={SEVERITY_COLOR[value]}>{value}</Tag>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (value: MarketAlert['status']) => (
                <Tag color={STATUS_COLOR[value]}>{value}</Tag>
            ),
        },
        {
            title: '采集点',
            key: 'point',
            width: 180,
            render: (_, record) => (
                <Flex vertical>
                    <Text>{record.pointName}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.regionLabel || '-'}
                    </Text>
                </Flex>
            ),
        },
        {
            title: '规则',
            dataIndex: 'ruleName',
            key: 'ruleName',
            width: 150,
        },
        {
            title: '预警描述',
            dataIndex: 'message',
            key: 'message',
        },
        {
            title: '数值',
            key: 'value',
            width: 150,
            render: (_, record) => `${record.value} / 阈值 ${record.threshold}`,
        },
        {
            title: '操作',
            key: 'actions',
            width: 260,
            render: (_, record) => (
                <Space size={4}>
                    <Button
                        size="small"
                        disabled={record.status === 'ACKNOWLEDGED'}
                        onClick={() => updateStatus.mutate({ id: record.id, status: 'ACKNOWLEDGED' })}
                    >
                        确认
                    </Button>
                    <Button
                        size="small"
                        disabled={record.status === 'CLOSED'}
                        onClick={() => openCloseModal(record)}
                    >
                        关闭
                    </Button>
                    <Button
                        size="small"
                        onClick={() => updateStatus.mutate({ id: record.id, status: 'OPEN' })}
                    >
                        重开
                    </Button>
                    <Button
                        size="small"
                        onClick={() => setLogAlertId(record.id)}
                    >
                        日志
                    </Button>
                </Space>
            ),
        },
    ];

    const logItems = (alertLogsQuery.data || []).map((log: AlertStatusLog) => ({
        color:
            log.action === 'CLOSE'
                ? 'red'
                : log.action === 'AUTO_CLOSE'
                  ? 'orange'
                  : log.action === 'ACK'
                    ? 'blue'
                    : 'green',
        children: (
            <Flex vertical gap={2}>
                <Text strong>{`${log.action} ${log.fromStatus ? `${log.fromStatus} -> ` : ''}${log.toStatus}`}</Text>
                <Text type="secondary">{dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
                <Text type="secondary">{`操作人: ${log.operator}`}</Text>
                {log.reason ? <Text>{`原因: ${log.reason}`}</Text> : null}
                {log.note ? <Text>{`备注: ${log.note}`}</Text> : null}
            </Flex>
        ),
    }));

    const ruleColumns: ColumnsType<MarketAlertRule> = [
        { title: '名称', dataIndex: 'name', key: 'name' },
        {
            title: '类型',
            dataIndex: 'type',
            key: 'type',
            width: 160,
        },
        {
            title: '参数',
            key: 'params',
            width: 220,
            render: (_, rule) => (
                <Text type="secondary">
                    阈值: {rule.threshold ?? '-'} / 天数: {rule.days ?? '-'} / 方向: {rule.direction || '-'}
                </Text>
            ),
        },
        {
            title: '级别',
            dataIndex: 'severity',
            key: 'severity',
            width: 90,
            render: (value: MarketAlertRule['severity']) => <Tag color={SEVERITY_COLOR[value]}>{value}</Tag>,
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            key: 'priority',
            width: 90,
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 90,
            render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>,
        },
        {
            title: '操作',
            key: 'actions',
            width: 140,
            render: (_, record) => (
                <Space size={4}>
                    <Button size="small" onClick={() => openEditModal(record)}>
                        编辑
                    </Button>
                    <Popconfirm
                        title="确认删除该规则？"
                        onConfirm={() => deleteRule.mutate(record.id)}
                    >
                        <Button size="small" danger>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Flex vertical gap={16}>
            <Flex justify="space-between" align="center">
                <Title level={4} style={{ margin: 0 }}>A类预警中心</Title>
                <Button type="primary" onClick={openCreateModal}>新建规则</Button>
            </Flex>

            <Tabs
                items={[
                    {
                        key: 'alerts',
                        label: '预警实例',
                        children: (
                            <Flex vertical gap={12}>
                                <Space wrap>
                                    <Select
                                        allowClear
                                        placeholder="选择品种"
                                        style={{ width: 160 }}
                                        value={commodity}
                                        onChange={setCommodity}
                                        options={(commodityDict || []).map((item) => ({
                                            value: item.code,
                                            label: item.label,
                                        }))}
                                    />
                                    <Select
                                        allowClear
                                        placeholder="级别"
                                        style={{ width: 140 }}
                                        value={severity}
                                        onChange={setSeverity}
                                        options={SEVERITY_OPTIONS as any}
                                    />
                                    <DatePicker.RangePicker
                                        value={dateRange}
                                        onChange={(val) => {
                                            if (!val || !val[0] || !val[1]) return;
                                            setDateRange([val[0], val[1]]);
                                        }}
                                    />
                                    <Button
                                        onClick={handleRunEvaluate}
                                        loading={evaluateAlerts.isPending}
                                    >
                                        重算预警
                                    </Button>
                                </Space>
                                <Table<MarketAlert>
                                    rowKey="id"
                                    loading={alertsQuery.isLoading}
                                    dataSource={alertsQuery.data?.data || []}
                                    columns={alertColumns}
                                    pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条` }}
                                    scroll={{ x: 1200 }}
                                />
                            </Flex>
                        ),
                    },
                    {
                        key: 'rules',
                        label: '规则配置',
                        children: (
                            <Table<MarketAlertRule>
                                rowKey="id"
                                loading={rulesQuery.isLoading}
                                dataSource={rulesQuery.data || []}
                                columns={ruleColumns}
                                pagination={{ pageSize: 10 }}
                                scroll={{ x: 980 }}
                            />
                        ),
                    },
                ]}
            />

            <Modal
                title={editingRule ? '编辑预警规则' : '新建预警规则'}
                open={ruleModalVisible}
                onCancel={() => setRuleModalVisible(false)}
                onOk={handleSaveRule}
                confirmLoading={createRule.isPending || updateRule.isPending}
                width={560}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
                        <Input placeholder="例如：单日涨跌额预警" />
                    </Form.Item>
                    <Form.Item name="type" label="规则类型" rules={[{ required: true, message: '请选择类型' }]}>
                        <Select options={RULE_TYPE_OPTIONS as any} />
                    </Form.Item>
                    <Form.Item noStyle dependencies={['type']}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type') as RuleForm['type'];
                            if (type === 'CONTINUOUS_DAYS') {
                                return (
                                    <Space style={{ width: '100%' }} size={12}>
                                        <Form.Item
                                            name="days"
                                            label="连续天数"
                                            rules={[{ required: true, message: '请输入连续天数' }]}
                                            style={{ flex: 1 }}
                                        >
                                            <InputNumber min={2} style={{ width: '100%' }} />
                                        </Form.Item>
                                        <Form.Item name="direction" label="方向" style={{ flex: 1 }}>
                                            <Select
                                                options={[
                                                    { label: '双向', value: 'BOTH' },
                                                    { label: '上涨', value: 'UP' },
                                                    { label: '下跌', value: 'DOWN' },
                                                ]}
                                            />
                                        </Form.Item>
                                    </Space>
                                );
                            }
                            return (
                                <Form.Item
                                    name="threshold"
                                    label="阈值"
                                    rules={[{ required: true, message: '请输入阈值' }]}
                                >
                                    <InputNumber min={0.01} style={{ width: '100%' }} />
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                    <Space style={{ width: '100%' }} size={12}>
                        <Form.Item name="severity" label="告警级别" style={{ flex: 1 }}>
                            <Select options={SEVERITY_OPTIONS as any} />
                        </Form.Item>
                        <Form.Item name="priority" label="优先级" style={{ flex: 1 }}>
                            <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item name="isActive" label="启用状态" style={{ flex: 1 }}>
                            <Select
                                options={[
                                    { label: '启用', value: true },
                                    { label: '停用', value: false },
                                ]}
                            />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>

            <Modal
                title={closingAlert ? `关闭预警：${closingAlert.pointName}` : '关闭预警'}
                open={!!closingAlert}
                onOk={handleCloseAlert}
                onCancel={() => {
                    setClosingAlert(null);
                    setCloseReason('');
                }}
                confirmLoading={updateStatus.isPending}
            >
                <Input.TextArea
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    rows={4}
                    placeholder="请输入关闭原因（至少 4 个字）"
                />
            </Modal>

            <Drawer
                title="预警状态日志"
                open={!!logAlertId}
                onClose={() => setLogAlertId(undefined)}
                width={520}
            >
                <Timeline items={logItems} />
            </Drawer>
        </Flex>
    );
};

export default AlertCenterPage;

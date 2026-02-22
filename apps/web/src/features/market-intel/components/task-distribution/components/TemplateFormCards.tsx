import React, { useState } from 'react';
import {
    Card,
    Form,
    Input,
    Select,
    Switch,
    InputNumber,
    Row,
    Col,
    Typography,
    Alert,
    DatePicker,
    Segmented,
    Space,
    Button,
    Modal,
    Table,
    Tag,
} from 'antd';
import {
    ApartmentOutlined,
    BankOutlined,
} from '@ant-design/icons';
import { useUsersPaged, useUsers } from '../../../../users/api/users';
import { useCollectionPoints } from '../../../api/collection-point';
import { useDictionaries } from '@/hooks/useDictionaries';
import { OrgDeptTreeSelect } from '../../../../organization/components/OrgDeptTreeSelect';
import dayjs from 'dayjs';
import { TaskScheduleMode, CollectionPointType } from '@packages/types';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Text } = Typography;
const { TextArea } = Input;

// 周期类型选项
const CYCLE_TYPE_OPTIONS = [
    { value: 'DAILY', label: '每日', description: '每天自动执行' },
    { value: 'WEEKLY', label: '每周', description: '每周执行一次' },
    { value: 'MONTHLY', label: '每月', description: '每月执行一次' },
    { value: 'ONE_TIME', label: '一次性', description: '仅执行一次' },
];

const SCHEDULE_MODE_OPTIONS = [
    { value: TaskScheduleMode.POINT_DEFAULT, label: '继承采集点频率' },
    { value: TaskScheduleMode.TEMPLATE_OVERRIDE, label: '模板覆盖频率' },
];

// 优先级选项
const PRIORITY_OPTIONS = [
    { value: 'LOW', label: '低', color: 'default' },
    { value: 'MEDIUM', label: '中', color: 'blue' },
    { value: 'HIGH', label: '高', color: 'orange' },
    { value: 'URGENT', label: '紧急', color: 'red' },
];

const WEEKDAY_OPTIONS = [
    { value: 1, label: '周一' },
    { value: 2, label: '周二' },
    { value: 3, label: '周三' },
    { value: 4, label: '周四' },
    { value: 5, label: '周五' },
    { value: 6, label: '周六' },
    { value: 7, label: '周日' },
];

const MONTH_DAY_OPTIONS = [
    ...Array.from({ length: 31 }, (_, index) => ({
        value: index + 1,
        label: `${index + 1}日`,
    })),
    { value: 0, label: '月末' },
];

// 采集点类型选项
const POINT_TYPE_OPTIONS = [
    { value: 'PORT', label: '港口', icon: '⚓' },
    { value: 'ENTERPRISE', label: '企业', icon: '🏭' },
    { value: 'STATION', label: '站台', icon: '🚂' },
    { value: 'MARKET', label: '市场', icon: '🏪' },
    { value: 'REGION', label: '区域', icon: '📍' },
];

const POINT_TYPE_LABELS = POINT_TYPE_OPTIONS.reduce<Record<string, string>>((acc, item) => {
    acc[item.value] = item.label;
    return acc;
}, {});

// 分配模式选项
const ASSIGNEE_MODE_OPTIONS = [
    { value: 'BY_COLLECTION_POINT', label: '按采集点负责人', description: '按采集点类型或指定采集点分配负责人' },
    { value: 'MANUAL', label: '手动指定', description: '手动选择分配人员' },
    { value: 'BY_DEPARTMENT', label: '按部门', description: '分配给指定部门的所有成员' },
    { value: 'BY_ORGANIZATION', label: '按组织', description: '分配给指定组织的所有成员' },
];

interface TemplateFormCardsProps {
    form: ReturnType<typeof Form.useForm>[0];
    containerRef?: React.RefObject<HTMLDivElement>;
    autoFocusFieldProps?: Record<string, string>;
}

interface CollectionPointPickerProps {
    value?: string[];
    onChange?: (ids: string[]) => void;
}

const CollectionPointPicker: React.FC<CollectionPointPickerProps> = ({ value = [], onChange }) => {
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [types, setTypes] = useState<CollectionPointType[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [cache, setCache] = useState(new Map<string, { id: string; name: string; code?: string | null; type?: string; regionName?: string | null; owners?: number }>());
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const normalizedKeyword = keyword.trim();
    const { data, isLoading } = useCollectionPoints({
        page,
        pageSize,
        keyword: normalizedKeyword || undefined,
        types: types.length ? types : undefined,
        isActive: true,
    });

    React.useEffect(() => {
        if (!data?.data?.length) return;
        setCache((prev) => {
            const next = new Map(prev);
            data.data.forEach((point) => {
                next.set(point.id, {
                    id: point.id,
                    name: point.name,
                    code: point.code,
                    type: point.type,
                    regionName: point.region?.name ?? point.regionCode ?? null,
                    owners: point.allocations?.length ?? 0,
                });
            });
            return next;
        });
    }, [data]);

    const selectedIds = value || [];
    const updateSelected = (ids: string[]) => {
        onChange?.(ids);
    };

    const pageIds = (data?.data || []).map((item) => item.id);

    const handleSelectPage = () => {
        const next = Array.from(new Set([...selectedIds, ...pageIds]));
        updateSelected(next);
    };

    const handleUnselectPage = () => {
        const next = selectedIds.filter((id) => !pageIds.includes(id));
        updateSelected(next);
    };

    const selectedSummary = selectedIds.map((id) => cache.get(id) || { id, name: id });

    const columns = [
        {
            title: '采集点',
            dataIndex: 'name',
            render: (_: string, record: Record<string, any>) => (
                <Space direction="vertical" size={0}>
                    <span>{record.name}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.code || record.id}
                    </Text>
                </Space>
            ),
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: 100,
            render: (value: string) => POINT_TYPE_LABELS[value] || value,
        },
        {
            title: '区域',
            dataIndex: 'region',
            width: 140,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AntD table column render callback
            render: (_: any, record: Record<string, any>) => record.region?.name || record.regionCode || '--',
        },
        {
            title: '负责人',
            dataIndex: 'allocations',
            width: 90,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic form/parameter value
            render: (value: any[]) => value?.length ?? 0,
        },
    ];

    return (
        <div>
            <Space wrap>
                <Button type="primary" onClick={() => setOpen(true)}>
                    选择采集点
                </Button>
                <Text type="secondary">已选 {selectedIds.length} 个</Text>
                {selectedIds.length > 0 && (
                    <Button onClick={() => updateSelected([])} size="small">
                        清空
                    </Button>
                )}
            </Space>
            {selectedIds.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <Space wrap size={[4, 8]}>
                        {selectedSummary.slice(0, 6).map((item) => (
                            <Tag key={item.id}>
                                {item.name}
                            </Tag>
                        ))}
                        {selectedSummary.length > 6 && <Tag>+{selectedSummary.length - 6}</Tag>}
                    </Space>
                </div>
            )}
            <Modal
                title="选择采集点"
                open={open}
                onCancel={() => setOpen(false)}
                onOk={() => setOpen(false)}
                width={900}
                destroyOnClose
                {...modalProps}
            >
                <div ref={containerRef}>
                    <Space wrap style={{ marginBottom: 12 }}>
                        <Input
                            allowClear
                            placeholder="搜索名称/编码/别名"
                            style={{ width: 220 }}
                            value={keyword}
                            onChange={(e) => {
                                setKeyword(e.target.value);
                                setPage(1);
                            }}
                            {...autoFocusFieldProps}
                        />
                        <Select
                            mode="multiple"
                            allowClear
                            placeholder="采集点类型"
                            style={{ minWidth: 200 }}
                            value={types}
                            onChange={(vals) => {
                                setTypes(vals as CollectionPointType[]);
                                setPage(1);
                            }}
                            options={POINT_TYPE_OPTIONS.map((item) => ({
                                value: item.value,
                                label: `${item.icon} ${item.label}`,
                            }))}
                        />
                        <Button onClick={handleSelectPage}>全选当前页</Button>
                        <Button onClick={handleUnselectPage}>取消当前页</Button>
                    </Space>
                    <Table
                        rowKey="id"
                        loading={isLoading}
                        dataSource={data?.data || []}
                        columns={columns}
                        pagination={{
                            current: data?.page || page,
                            pageSize: data?.pageSize || pageSize,
                            total: data?.total || 0,
                            showSizeChanger: true,
                            onChange: (nextPage, nextSize) => {
                                setPage(nextPage);
                                setPageSize(nextSize);
                            },
                        }}
                        rowSelection={{
                            selectedRowKeys: selectedIds,
                            preserveSelectedRowKeys: true,
                            onChange: (keys) => updateSelected(keys as string[]),
                        }}
                    />
                </div>
            </Modal>
        </div>
    );
};

interface UserPickerProps {
    value?: string[];
    onChange?: (ids: string[]) => void;
}

const UserPicker: React.FC<UserPickerProps> = ({ value = [], onChange }) => {
    const [open, setOpen] = useState(false);
    const [scopeIds, setScopeIds] = useState<string[]>([]);
    const [keyword, setKeyword] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [cache, setCache] = useState(new Map<string, { id: string; name: string; username?: string; departmentName?: string | null; organizationName?: string | null }>());
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const orgIds = React.useMemo(
        () => scopeIds.filter((id) => id.startsWith('org-')).map((id) => id.slice(4)),
        [scopeIds],
    );
    const deptIds = React.useMemo(
        () => scopeIds.filter((id) => id.startsWith('dept-')).map((id) => id.slice(5)),
        [scopeIds],
    );

    const shouldQuery = Boolean(keyword.trim() || orgIds.length || deptIds.length);
    const { data, isLoading } = useUsersPaged({
        page,
        pageSize,
        status: 'ACTIVE',
        organizationIds: orgIds.length ? orgIds : undefined,
        departmentIds: deptIds.length ? deptIds : undefined,

    }, { enabled: open && shouldQuery });

    // [FIX] ID回显问题：当组件挂载且有初始值时，请求这些用户的详情
    const { data: initialUsers } = useUsers({ ids: value }, {
        enabled: value.length > 0 && Array.from(value).some(id => !cache.has(id))
    });

    // 将初始用户数据写入缓存
    React.useEffect(() => {
        if (!initialUsers?.length) return;
        setCache((prev) => {
            const next = new Map(prev);
            initialUsers.forEach((user) => {
                if (!next.has(user.id)) {
                    next.set(user.id, {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        departmentName: user.department?.name,
                        organizationName: user.organization?.name,
                    });
                }
            });
            return next;
        });
    }, [initialUsers]);

    React.useEffect(() => {
        if (!data?.data?.length) return;
        setCache((prev) => {
            const next = new Map(prev);
            data.data.forEach((user) => {
                next.set(user.id, {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    departmentName: user.department?.name,
                    organizationName: user.organization?.name,
                });
            });
            return next;
        });
    }, [data]);

    const selectedIds = value || [];
    const updateSelected = (ids: string[]) => {
        onChange?.(ids);
    };

    const pageIds = (data?.data || []).map((user) => user.id);
    const handleSelectPage = () => {
        const next = Array.from(new Set([...selectedIds, ...pageIds]));
        updateSelected(next);
    };
    const handleUnselectPage = () => {
        const next = selectedIds.filter((id) => !pageIds.includes(id));
        updateSelected(next);
    };

    const selectedSummary = selectedIds.map((id) => cache.get(id) || { id, name: id });

    const columns = [
        {
            title: '姓名',
            dataIndex: 'name',
            render: (_: string, record: Record<string, any>) => (
                <Space direction="vertical" size={0}>
                    <span>{record.name}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.username}
                    </Text>
                </Space>
            ),
        },
        {
            title: '组织',
            dataIndex: 'organization',
            width: 160,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AntD table column render callback
            render: (_: any, record: Record<string, any>) => record.organization?.name || '--',
        },
        {
            title: '部门',
            dataIndex: 'department',
            width: 160,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AntD table column render callback
            render: (_: any, record: Record<string, any>) => record.department?.name || '--',
        },
    ];

    return (
        <div>
            <Space wrap>
                <Button type="primary" onClick={() => setOpen(true)}>
                    选择人员
                </Button>
                <Text type="secondary">已选 {selectedIds.length} 人</Text>
                {selectedIds.length > 0 && (
                    <Button onClick={() => updateSelected([])} size="small">
                        清空
                    </Button>
                )}
            </Space>
            {selectedIds.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <Space wrap size={[4, 8]}>
                        {selectedSummary.slice(0, 6).map((item) => (
                            <Tag key={item.id}>
                                {item.name}
                            </Tag>
                        ))}
                        {selectedSummary.length > 6 && <Tag>+{selectedSummary.length - 6}</Tag>}
                    </Space>
                </div>
            )}
            <Modal
                title="选择人员"
                open={open}
                onCancel={() => setOpen(false)}
                onOk={() => setOpen(false)}
                width={900}
                destroyOnClose
                {...modalProps}
            >
                <div ref={containerRef}>
                    <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col flex="300px">
                            <OrgDeptTreeSelect
                                mode="both"
                                multiple
                                returnRawValue
                                showUserCount
                                placeholder="按组织/部门筛选"
                                value={scopeIds}
                                onChange={(ids) => {
                                    setScopeIds(ids);
                                    setPage(1);
                                }}
                                style={{ width: '100%' }}
                            />
                        </Col>
                        <Col flex="220px">
                            <Input
                                allowClear
                                placeholder="姓名/账号/手机号/邮箱"
                                value={keyword}
                                onChange={(e) => {
                                    setKeyword(e.target.value);
                                    setPage(1);
                                }}
                                {...autoFocusFieldProps}
                            />
                        </Col>
                        <Col flex="none">
                            <Space>
                                <Button onClick={handleSelectPage} disabled={!pageIds.length}>
                                    全选当前页
                                </Button>
                                <Button onClick={handleUnselectPage} disabled={!pageIds.length}>
                                    取消当前页
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                    {!shouldQuery && (
                        <Alert
                            type="info"
                            showIcon
                            message="请先选择组织/部门或输入关键词后加载人员"
                            style={{ marginBottom: 12 }}
                        />
                    )}
                    <Table
                        rowKey="id"
                        loading={shouldQuery && isLoading}
                        dataSource={shouldQuery ? (data?.data || []) : []}
                        columns={columns}
                        pagination={shouldQuery ? {
                            current: data?.page || page,
                            pageSize: data?.pageSize || pageSize,
                            total: data?.total || 0,
                            showSizeChanger: true,
                            onChange: (nextPage, nextSize) => {
                                setPage(nextPage);
                                setPageSize(nextSize);
                            },
                        } : false}
                        rowSelection={{
                            selectedRowKeys: selectedIds,
                            preserveSelectedRowKeys: true,
                            onChange: (keys) => updateSelected(keys as string[]),
                        }}
                    />
                </div>
            </Modal>
        </div>
    );
};

/**
 * 任务模板表单卡片布局
 * 从 TaskTemplateManager 移植的分卡片表单
 */
export const TemplateFormCards: React.FC<TemplateFormCardsProps> = ({ form, containerRef, autoFocusFieldProps }) => {
    const [pointScope, setPointScope] = useState<'TYPE' | 'POINTS'>('TYPE');
    const watchedCollectionPointIds = Form.useWatch('collectionPointIds', form) || [];
    const watchedTargetPointTypes = Form.useWatch('targetPointTypes', form) || [];

    React.useEffect(() => {
        if ((watchedCollectionPointIds as string[]).length > 0) {
            setPointScope('POINTS');
            return;
        }
        if ((watchedTargetPointTypes as string[]).length > 0) {
            setPointScope('TYPE');
        }
    }, [watchedCollectionPointIds, watchedTargetPointTypes]);

    const { data: dictionaries } = useDictionaries([
        'INTEL_TASK_TYPE',
        'INTEL_TASK_PRIORITY',
        'TASK_CYCLE_TYPE',
    ]);


    // 从字典获取任务类型选项
    const taskTypeOptions = React.useMemo(() => {
        const items = dictionaries?.INTEL_TASK_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) {
            return [
                { value: 'COLLECTION', label: '采集任务' },
                { value: 'REPORT', label: '报告任务' },
                { value: 'VERIFICATION', label: '核实任务' },
            ];
        }
        return items.map((item) => ({ value: item.code, label: item.label }));
    }, [dictionaries]);

    // 处理分配模式切换时清空相关字段
    const handleAssigneeModeChange = (mode: string) => {
        if (mode !== 'MANUAL') {
            form.setFieldValue('assigneeIds', []);
        }
        if (mode !== 'BY_COLLECTION_POINT') {
            form.setFieldValue('targetPointTypes', []);
            form.setFieldValue('collectionPointIds', []);
            setPointScope('TYPE');
        }
        if (mode !== 'BY_DEPARTMENT') {
            form.setFieldValue('departmentIds', []);
        }
        if (mode !== 'BY_ORGANIZATION') {
            form.setFieldValue('organizationIds', []);
        }
    };

    const handlePointScopeChange = (value: 'TYPE' | 'POINTS') => {
        setPointScope(value);
        if (value === 'TYPE') {
            form.setFieldValue('collectionPointIds', []);
        } else {
            form.setFieldValue('targetPointTypes', []);
        }
    };

    return (
        <div ref={containerRef}>
            <Row gutter={24}>
                <Col span={16}>
                    {/* 基础信息 */}
                    <Card size="small" title="基础信息" style={{ marginBottom: 16 }}>
                        <Form.Item
                            name="name"
                            label="模板名称"
                            rules={[{ required: true, message: '请输入模板名称' }]}
                        >
                            <Input placeholder="如：每日港口采集任务" {...autoFocusFieldProps} />
                        </Form.Item>

                        <Form.Item name="description" label="任务描述">
                            <TextArea rows={2} placeholder="任务说明和要求" />
                        </Form.Item>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item
                                    name="taskType"
                                    label="任务类型"
                                    rules={[{ required: true, message: '请选择任务类型' }]}
                                >
                                    <Select
                                        options={taskTypeOptions}
                                        onChange={(value) => {
                                            if (value === 'COLLECTION') {
                                                const currentMode = form.getFieldValue('scheduleMode');
                                                if (!currentMode || currentMode === TaskScheduleMode.TEMPLATE_OVERRIDE) {
                                                    form.setFieldsValue({ scheduleMode: TaskScheduleMode.POINT_DEFAULT });
                                                }
                                                if (form.getFieldValue('assigneeMode') !== 'BY_COLLECTION_POINT') {
                                                    form.setFieldsValue({ assigneeMode: 'BY_COLLECTION_POINT' });
                                                }
                                            } else {
                                                form.setFieldsValue({ scheduleMode: TaskScheduleMode.TEMPLATE_OVERRIDE });
                                            }
                                        }}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="priority" label="优先级">
                                    <Select
                                        options={PRIORITY_OPTIONS.map((p) => ({
                                            value: p.value,
                                            label: p.label,
                                        }))}
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    {/* 周期配置 */}
                    <Card size="small" title="周期配置" style={{ marginBottom: 16 }}>
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.taskType !== cur.taskType || prev.scheduleMode !== cur.scheduleMode}>
                            {({ getFieldValue }) => {
                                const isCollection = getFieldValue('taskType') === 'COLLECTION';
                                if (!isCollection) return null;
                                return (
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item
                                                name="scheduleMode"
                                                label="频率来源"
                                                rules={[{ required: true, message: '请选择频率来源' }]}
                                            >
                                                <Select options={SCHEDULE_MODE_OPTIONS} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                );
                            }}
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(prev, cur) => (
                            prev.taskType !== cur.taskType
                            || prev.scheduleMode !== cur.scheduleMode
                            || prev.cycleType !== cur.cycleType
                        )}>
                            {({ getFieldValue }) => {
                                const isCollection = getFieldValue('taskType') === 'COLLECTION';
                                const scheduleMode = getFieldValue('scheduleMode');
                                const showTemplateSchedule = !isCollection || scheduleMode === TaskScheduleMode.TEMPLATE_OVERRIDE;
                                const cycleType = getFieldValue('cycleType');

                                return (
                                    <>
                                        {!showTemplateSchedule && (
                                            <Alert
                                                type="info"
                                                showIcon
                                                message="该模板将继承采集点频率下发，仅需配置截止时间与 SLA。"
                                                style={{ marginBottom: 12 }}
                                            />
                                        )}

                                        <Row gutter={16}>
                                            {showTemplateSchedule && (
                                                <Col span={12}>
                                                    <Form.Item
                                                        name="cycleType"
                                                        label="执行周期"
                                                        rules={[{ required: true, message: '请选择周期' }]}
                                                    >
                                                        <Select
                                                            optionLabelProp="label"
                                                            onChange={(value) => {
                                                                if (value === 'WEEKLY') {
                                                                    form.setFieldsValue({
                                                                        runDayOfWeek: form.getFieldValue('runDayOfWeek') ?? 1,
                                                                        dueDayOfWeek: form.getFieldValue('dueDayOfWeek') ?? 7,
                                                                        runDayOfMonth: undefined,
                                                                        dueDayOfMonth: undefined,
                                                                    });
                                                                } else if (value === 'MONTHLY') {
                                                                    form.setFieldsValue({
                                                                        runDayOfMonth: form.getFieldValue('runDayOfMonth') ?? 1,
                                                                        dueDayOfMonth: form.getFieldValue('dueDayOfMonth') ?? 0,
                                                                        runDayOfWeek: undefined,
                                                                        dueDayOfWeek: undefined,
                                                                    });
                                                                } else {
                                                                    form.setFieldsValue({
                                                                        runDayOfWeek: undefined,
                                                                        dueDayOfWeek: undefined,
                                                                        runDayOfMonth: undefined,
                                                                        dueDayOfMonth: undefined,
                                                                    });
                                                                }
                                                            }}
                                                            options={CYCLE_TYPE_OPTIONS.map((c) => ({
                                                                value: c.value,
                                                                label: c.label,
                                                            }))}
                                                        />
                                                    </Form.Item>
                                                </Col>
                                            )}
                                            <Col span={showTemplateSchedule ? 12 : 24}>
                                                <Form.Item name="deadlineOffset" label="完成时限（小时）" tooltip="任务分发后多少小时内需完成">
                                                    <InputNumber min={1} max={72} style={{ width: '100%' }} />
                                                </Form.Item>
                                            </Col>
                                        </Row>

                                        {/* 周期日条件显示 */}
                                        {showTemplateSchedule && cycleType === 'WEEKLY' && (
                                            <Row gutter={16}>
                                                <Col span={12}>
                                                    <Form.Item
                                                        name="runDayOfWeek"
                                                        label="分发日（周）"
                                                        rules={[{ required: true, message: '请选择分发日' }]}
                                                    >
                                                        <Select options={WEEKDAY_OPTIONS} />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={12}>
                                                    <Form.Item
                                                        name="dueDayOfWeek"
                                                        label="截止日（周）"
                                                        rules={[
                                                            { required: true, message: '请选择截止日' },
                                                            ({ getFieldValue }) => ({
                                                                validator(_, value) {
                                                                    const runDay = getFieldValue('runDayOfWeek');
                                                                    if (runDay && value != null && value < runDay) {
                                                                        return Promise.reject(new Error('截止日不能早于分发日'));
                                                                    }
                                                                    return Promise.resolve();
                                                                },
                                                            }),
                                                        ]}
                                                    >
                                                        <Select options={WEEKDAY_OPTIONS} />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                        )}

                                        {showTemplateSchedule && cycleType === 'MONTHLY' && (
                                            <Row gutter={16}>
                                                <Col span={12}>
                                                    <Form.Item
                                                        name="runDayOfMonth"
                                                        label="分发日（月）"
                                                        rules={[{ required: true, message: '请选择分发日' }]}
                                                        extra="选择月末将自动适配不同月份天数"
                                                    >
                                                        <Select options={MONTH_DAY_OPTIONS} />
                                                    </Form.Item>
                                                </Col>
                                                <Col span={12}>
                                                    <Form.Item
                                                        name="dueDayOfMonth"
                                                        label="截止日（月）"
                                                        rules={[
                                                            { required: true, message: '请选择截止日' },
                                                            ({ getFieldValue }) => ({
                                                                validator(_, value) {
                                                                    const runDay = getFieldValue('runDayOfMonth');
                                                                    if (runDay == null || value == null) return Promise.resolve();
                                                                    const runValue = runDay === 0 ? 32 : runDay;
                                                                    const dueValue = value === 0 ? 32 : value;
                                                                    if (dueValue < runValue) {
                                                                        return Promise.reject(new Error('截止日不能早于分发日'));
                                                                    }
                                                                    return Promise.resolve();
                                                                },
                                                            }),
                                                        ]}
                                                        extra="选择月末将自动适配不同月份天数"
                                                    >
                                                        <Select options={MONTH_DAY_OPTIONS} />
                                                    </Form.Item>
                                                </Col>
                                            </Row>
                                        )}

                                        <Row gutter={16}>
                                            {showTemplateSchedule && (
                                                <Col span={12}>
                                                    <Form.Item label="下发时间">
                                                        <Space>
                                                            <Form.Item name="runAtHour" noStyle>
                                                                <InputNumber min={0} max={23} placeholder="时" style={{ width: 80 }} />
                                                            </Form.Item>
                                                            <span>:</span>
                                                            <Form.Item name="runAtMin" noStyle>
                                                                <InputNumber min={0} max={59} placeholder="分" style={{ width: 80 }} />
                                                            </Form.Item>
                                                        </Space>
                                                    </Form.Item>
                                                </Col>
                                            )}
                                            <Col span={showTemplateSchedule ? 12 : 24}>
                                                <Form.Item label="截止时间">
                                                    <Space>
                                                        <Form.Item name="dueAtHour" noStyle>
                                                            <InputNumber min={0} max={23} placeholder="时" style={{ width: 80 }} />
                                                        </Form.Item>
                                                        <span>:</span>
                                                        <Form.Item name="dueAtMin" noStyle>
                                                            <InputNumber min={0} max={59} placeholder="分" style={{ width: 80 }} />
                                                        </Form.Item>
                                                    </Space>
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </>
                                );
                            }}
                        </Form.Item>
                    </Card>

                    {/* 高级配置 */}
                    <Card size="small" title="高级配置" style={{ marginBottom: 16 }}>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="activeFrom" label="生效时间">
                                    <DatePicker showTime style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item
                                    name="activeUntil"
                                    label="失效时间"
                                    dependencies={['activeFrom']}
                                    rules={[
                                        ({ getFieldValue }) => ({
                                            validator(_, value) {
                                                const start = getFieldValue('activeFrom');
                                                if (!start || !value) return Promise.resolve();
                                                if (dayjs(value).isBefore(dayjs(start))) {
                                                    return Promise.reject(new Error('失效时间不能早于生效时间'));
                                                }
                                                return Promise.resolve();
                                            },
                                        }),
                                    ]}
                                >
                                    <DatePicker showTime style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="maxBackfillPeriods" label="允许补发周期数">
                                    <InputNumber min={0} max={365} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="allowLate" label="允许延期" valuePropName="checked">
                                    <Switch checkedChildren="允许" unCheckedChildren="不允许" />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>

                    {/* 分配范围 */}
                    <Card size="small" title="分配范围" style={{ marginBottom: 16 }}>
                        <Form.Item
                            name="assigneeMode"
                            label="分配模式"
                            dependencies={['taskType']}
                            rules={[
                                { required: true, message: '请选择分配模式' },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (getFieldValue('taskType') === 'COLLECTION' && value !== 'BY_COLLECTION_POINT') {
                                            return Promise.reject(new Error('采集任务需要绑定采集点'));
                                        }
                                        return Promise.resolve();
                                    },
                                }),
                            ]}
                        >
                            <Select
                                onChange={handleAssigneeModeChange}
                                optionLabelProp="label"
                                options={ASSIGNEE_MODE_OPTIONS.map((m) => ({
                                    value: m.value,
                                    label: m.label,
                                }))}
                            />
                        </Form.Item>

                        {/* 任务类型警告 */}
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.taskType !== cur.taskType || prev.assigneeMode !== cur.assigneeMode}>
                            {({ getFieldValue }) => {
                                if (getFieldValue('taskType') === 'COLLECTION' && getFieldValue('assigneeMode') !== 'BY_COLLECTION_POINT') {
                                    return (
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="采集任务需要绑定采集点，建议选择「按采集点负责人」"
                                            style={{ marginBottom: 12 }}
                                        />
                                    );
                                }
                                return null;
                            }}
                        </Form.Item>

                        {/* 分配模式条件显示 */}
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.assigneeMode !== cur.assigneeMode}>
                            {({ getFieldValue }) => {
                                const mode = getFieldValue('assigneeMode');

                                if (mode === 'MANUAL') {
                                    return (
                                        <Form.Item
                                            name="assigneeIds"
                                            label="选择人员"
                                            rules={[{ required: true, message: '请选择至少一名业务员' }]}
                                        >
                                            <UserPicker />
                                        </Form.Item>
                                    );
                                }

                                if (mode === 'BY_COLLECTION_POINT') {
                                    return (
                                        <>
                                            <Form.Item label="采集点范围">
                                                <Segmented
                                                    value={pointScope}
                                                    onChange={(value) => handlePointScopeChange(value as 'TYPE' | 'POINTS')}
                                                    options={[
                                                        { label: '按类型', value: 'TYPE' },
                                                        { label: '按采集点', value: 'POINTS' },
                                                    ]}
                                                />
                                            </Form.Item>

                                            {pointScope === 'TYPE' && (
                                                <Form.Item
                                                    name="targetPointTypes"
                                                    label="目标采集点类型"
                                                    rules={[{ required: true, message: '请选择采集点类型' }]}
                                                    extra="可多选类型，将为这些类型下的采集点负责人创建任务"
                                                >
                                                    <Select
                                                        mode="multiple"
                                                        allowClear
                                                        placeholder="选择采集点类型"
                                                        options={POINT_TYPE_OPTIONS.map((t) => ({
                                                            value: t.value,
                                                            label: `${t.icon} ${t.label}`,
                                                        }))}
                                                    />
                                                </Form.Item>
                                            )}

                                            {pointScope === 'POINTS' && (
                                                <Form.Item
                                                    name="collectionPointIds"
                                                    label="指定采集点"
                                                    rules={[{ required: true, message: '请选择采集点' }]}
                                                    extra="将为这些采集点的负责人生成任务，并绑定到具体采集点"
                                                >
                                                    <CollectionPointPicker />
                                                </Form.Item>
                                            )}

                                            <Alert
                                                type="info"
                                                showIcon
                                                message="采集类任务会绑定采集点，便于后续填报、统计和追溯"
                                            />
                                        </>
                                    );
                                }

                                if (mode === 'BY_DEPARTMENT') {
                                    return (
                                        <Form.Item
                                            name="departmentIds"
                                            label={
                                                <Space>
                                                    <ApartmentOutlined />
                                                    <span>选择部门</span>
                                                </Space>
                                            }
                                            rules={[{ required: true, message: '请选择至少一个部门' }]}
                                            extra="将为所选部门的所有成员创建任务"
                                        >
                                            <OrgDeptTreeSelect
                                                mode="dept"
                                                multiple
                                                showUserCount
                                                placeholder="选择目标部门"
                                            />
                                        </Form.Item>
                                    );
                                }

                                if (mode === 'BY_ORGANIZATION') {
                                    return (
                                        <Form.Item
                                            name="organizationIds"
                                            label={
                                                <Space>
                                                    <BankOutlined />
                                                    <span>选择组织</span>
                                                </Space>
                                            }
                                            rules={[{ required: true, message: '请选择至少一个组织' }]}
                                            extra="将为所选组织的所有成员创建任务"
                                        >
                                            <OrgDeptTreeSelect
                                                mode="org"
                                                multiple
                                                showUserCount
                                                placeholder="选择目标组织"
                                            />
                                        </Form.Item>
                                    );
                                }

                                return null;
                            }}
                        </Form.Item>

                        <Form.Item name="isActive" label="启用状态" valuePropName="checked" style={{ marginBottom: 0 }}>
                            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                        </Form.Item>
                    </Card>
                </Col>

                {/* 右侧使用说明 */}
                <Col span={8}>
                    <Card size="small" title="使用说明" style={{ position: 'sticky', top: 0 }}>
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            <Alert
                                type="info"
                                showIcon
                                message="建议先配置模板，再预览分发结果"
                            />
                            <div>
                                <Text strong>1. 任务类型</Text>
                                <div style={{ marginTop: 4 }}>
                                    <Text type="secondary">采集任务必须绑定采集点；报告类任务适合按部门/组织；核实任务建议优先级设为高或紧急。</Text>
                                </div>
                            </div>
                            <div>
                                <Text strong>2. 周期配置</Text>
                                <div style={{ marginTop: 4 }}>
                                    <Text type="secondary">每日/每周/每月/一次性。周/月任务需设置分发日与截止日，截止日不能早于分发日。</Text>
                                </div>
                            </div>
                            <div>
                                <Text strong>3. 高级配置</Text>
                                <div style={{ marginTop: 4 }}>
                                    <Text type="secondary">生效/失效时间控制模板周期，允许补发用于补齐历史周期，允许延期用于特殊情况延长截止。</Text>
                                </div>
                            </div>
                            <div>
                                <Text strong>4. 分配范围</Text>
                                <div style={{ marginTop: 4 }}>
                                    <Text type="secondary">按采集点负责人支持"按类型/按采集点"两种方式；按部门/组织会给所有成员生成任务。</Text>
                                </div>
                            </div>
                        </Space>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default TemplateFormCards;

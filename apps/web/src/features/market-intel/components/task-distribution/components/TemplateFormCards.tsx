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
} from 'antd';
import {
    ApartmentOutlined,
    BankOutlined,
} from '@ant-design/icons';
import { useDictionaries } from '@/hooks/useDictionaries';
import dayjs from 'dayjs';
import { TaskScheduleMode } from '@packages/types';
import CollectionPointPicker from './CollectionPointPicker';
import UserPicker from './UserPicker';
import { OrgDeptTreeSelect } from '../../../../organization/components/OrgDeptTreeSelect';
import {
    CYCLE_TYPE_OPTIONS,
    SCHEDULE_MODE_OPTIONS,
    PRIORITY_OPTIONS,
    WEEKDAY_OPTIONS,
    MONTH_DAY_OPTIONS,
    POINT_TYPE_OPTIONS,
    ASSIGNEE_MODE_OPTIONS,
} from './templateFormConstants';

const { Text } = Typography;
const { TextArea } = Input;

interface TemplateFormCardsProps {
    form: ReturnType<typeof Form.useForm>[0];
    containerRef?: React.RefObject<HTMLDivElement>;
    autoFocusFieldProps?: Record<string, string>;
}

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

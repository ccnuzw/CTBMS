import React from 'react';
import { App, Alert, Button, Space, Tag, Drawer, Timeline, Divider, Popconfirm, Form, Modal, Table, Select, Switch, TimePicker, Input, Segmented, InputNumber } from 'antd';
import {
    ProTable,
    ProColumns,
} from '@ant-design/pro-components';
import { PlusOutlined, EditOutlined, ScheduleOutlined, SendOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
    IntelTaskType,
    IntelTaskPriority,
    TaskScheduleMode,
    IntelTaskTemplateResponse,
    IntelTaskRuleScopeType,
    IntelTaskCompletionPolicy,
    IntelTaskRuleResponse,
} from '@packages/types';
import { TemplateScheduleGrid } from './TemplateScheduleGrid';
import { DistributionPreview } from '../../DistributionPreview';
import { TemplateFormCards } from './TemplateFormCards';
import { OrgDeptTreeSelect } from '../../../../organization/components/OrgDeptTreeSelect';
import { RuleConfigHelp } from './RuleConfigHelp';
import { TemplateConfigHelp } from './TemplateConfigHelp';
import {
    useTaskTemplateListViewModel,
    computeNextRuns,
    formatMinute,
    DEFAULT_TEMPLATE_VALUES,
    SCHEDULE_MODE_LABELS,
    normalizeTemplateForForm,
} from './useTaskTemplateListViewModel';

export const TaskTemplateList: React.FC = () => {
    const vm = useTaskTemplateListViewModel();
    const { message } = App.useApp();

    const ruleColumns = [
        {
            title: '范围',
            dataIndex: 'scopeType',
            render: (value: string) => vm.computed.ruleScopeLabels[value] || value,
        },
        {
            title: '频率',
            dataIndex: 'frequencyType',
            render: (value: string) => vm.computed.cycleTypeLabels[value] || value,
        },
        {
            title: '时间',
            dataIndex: 'dispatchAtMinute',
            render: (value: number) => formatMinute(value),
        },
        {
            title: '分配',
            dataIndex: 'assigneeStrategy',
            render: (value: string) => vm.computed.ruleAssigneeLabels[value] || value,
        },
        {
            title: '完成',
            dataIndex: 'completionPolicy',
            render: (value: string) => vm.computed.ruleCompletionLabels[value] || value,
        },
        {
            title: '监控(30天)',
            render: (_: any, record: IntelTaskRuleResponse) => {
                const metrics = vm.computed.ruleMetricsMap.get(record.id);
                if (!metrics) return '--';
                const lastRun = metrics.lastCreatedAt ? dayjs(metrics.lastCreatedAt).format('YYYY-MM-DD') : '--';
                return (
                    <Space wrap>
                        <Tag color="blue">总 {metrics.total}</Tag>
                        <Tag color="green">完 {metrics.completed}</Tag>
                        <Tag color="red">逾 {metrics.overdue}</Tag>
                        <Tag>迟 {metrics.late}</Tag>
                        <Tag>最近 {lastRun}</Tag>
                    </Space>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '禁用'}</Tag>,
        },
        {
            title: '操作',
            render: (_: any, record: IntelTaskRuleResponse) => (
                <Space size="small">
                    <Button size="small" onClick={() => {
                        vm.actions.blurActiveElement();
                        vm.setters.setRuleLogTarget(record);
                        vm.setters.setRuleLogOpen(true);
                    }}>记录</Button>
                    <Button size="small" onClick={() => vm.actions.openRuleModal(record)}>编辑</Button>
                    <Popconfirm
                        title="确定删除该规则吗？"
                        onConfirm={async () => {
                            await vm.mutations.deleteRuleMutation.mutateAsync({ id: record.id, templateId: record.templateId });
                        }}
                    >
                        <Button size="small" danger>删除</Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const columns: ProColumns<IntelTaskTemplateResponse>[] = [
        {
            title: '模板名称',
            dataIndex: 'name',
            copyable: true,
            formItemProps: { rules: [{ required: true }] },
        },
        {
            title: '生成任务类型',
            dataIndex: 'taskType',
            valueType: 'select',
            valueEnum: vm.computed.taskTypeValueEnum,
            render: (_, r) => <Tag>{vm.computed.taskTypeLabels[r.taskType] || r.taskType}</Tag>
        },
        {
            title: '分配对象',
            dataIndex: 'assigneeMode',
            render: (_, r) => {
                if (r.assigneeMode === 'ALL_ACTIVE') {
                    return <Tag color="green">{vm.computed.assigneeModeLabels[r.assigneeMode] || '全员'}</Tag>;
                }
                if (r.assigneeMode === 'BY_ORGANIZATION') {
                    return (
                        <Space wrap>
                            {(r.organizationIds || []).slice(0, 3).map((id: string) => (
                                <Tag key={id}>{vm.computed.orgMap.get(id) || id}</Tag>
                            ))}
                            {(r.organizationIds || []).length > 3 && <Tag>+{(r.organizationIds || []).length - 3}</Tag>}
                        </Space>
                    );
                }
                if (r.assigneeMode === 'BY_DEPARTMENT') {
                    return (
                        <Space wrap>
                            {(r.departmentIds || []).slice(0, 3).map((id: string) => (
                                <Tag key={id}>{vm.computed.deptMap.get(id) || id}</Tag>
                            ))}
                            {(r.departmentIds || []).length > 3 && <Tag>+{(r.departmentIds || []).length - 3}</Tag>}
                        </Space>
                    );
                }
                if (r.assigneeMode === 'BY_COLLECTION_POINT') {
                    const types = (r.targetPointTypes && r.targetPointTypes.length > 0)
                        ? r.targetPointTypes
                        : (r.targetPointType ? [r.targetPointType] : []);
                    if (types.length > 0) {
                        return (
                            <Space wrap>
                                <Tag color="orange">{vm.computed.assigneeModeLabels[r.assigneeMode] || '按采集点分配'}</Tag>
                                {types.slice(0, 3).map((type) => (
                                    <Tag key={type} color="orange">
                                        {vm.computed.collectionPointTypeLabels[type] || type}
                                    </Tag>
                                ))}
                                {types.length > 3 && <Tag>+{types.length - 3}</Tag>}
                            </Space>
                        );
                    }
                    return (
                        <Space wrap>
                            <Tag color="orange">{vm.computed.assigneeModeLabels[r.assigneeMode] || '采集点'}</Tag>
                            {(r.collectionPointIds || []).length} 个
                        </Space>
                    );
                }
                return (
                    <Space wrap>
                        {(r.assigneeIds || []).slice(0, 3).map((id: string) => (
                            <Tag key={id}>{vm.computed.userMap.get(id) || id}</Tag>
                        ))}
                        {(r.assigneeIds || []).length > 3 && <Tag>+{(r.assigneeIds || []).length - 3}</Tag>}
                    </Space>
                );
            },
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            valueType: 'select',
            valueEnum: vm.computed.taskPriorityValueEnum,
            render: (_, r) => (
                <Tag color={vm.computed.taskPriorityMeta.colors[r.priority] || (r.priority === IntelTaskPriority.URGENT ? 'red' : 'blue')}>
                    {vm.computed.taskPriorityMeta.labels[r.priority] || r.priority}
                </Tag>
            )
        },
        {
            title: '周期',
            dataIndex: 'cycleType',
            valueType: 'select',
            valueEnum: vm.computed.cycleTypeValueEnum,
            render: (_, r) => {
                if (r.taskType === IntelTaskType.COLLECTION && r.scheduleMode === TaskScheduleMode.POINT_DEFAULT) {
                    return <Tag color="cyan">{SCHEDULE_MODE_LABELS[TaskScheduleMode.POINT_DEFAULT]}</Tag>;
                }
                return <Tag color="geekblue">{vm.computed.cycleTypeLabels[r.cycleType] || r.cycleType}</Tag>;
            }
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            valueType: 'select',
            valueEnum: {
                true: { text: '启用', status: 'Success' },
                false: { text: '禁用', status: 'Default' },
            },
        },
        {
            title: '下次运行',
            dataIndex: 'nextRunAt',
            valueType: 'dateTime',
            search: false,
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            valueType: 'dateTime',
            sorter: true,
            hideInSearch: true,
            width: 160,
        },
        {
            title: '分配给用户',
            dataIndex: 'assigneeId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                showSearch: true,
                options: vm.data.users.map(u => ({ label: u.name, value: u.id })),
            },
        },
        {
            title: '分配给部门',
            dataIndex: 'departmentId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                options: vm.data.departments.map(d => ({ label: d.name, value: d.id })),
            },
        },
        {
            title: '分配给组织',
            dataIndex: 'organizationId',
            hideInTable: true,
            valueType: 'select',
            fieldProps: {
                options: vm.data.organizations.map(o => ({ label: o.name, value: o.id })),
            },
        },
        {
            title: '操作',
            valueType: 'option',
            render: (_text, record, _, action) => [
                <Space key="actions" size="small">
                    <Button
                        key="edit"
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                            vm.actions.blurActiveElement();
                            vm.setters.setCurrentTemplate(record);
                            vm.setters.setIsEditModalOpen(true);
                        }}
                    >
                        编辑
                    </Button>
                    <Button
                        key="preview"
                        size="small"
                        icon={<ScheduleOutlined />}
                        onClick={() => {
                            vm.actions.blurActiveElement();
                            vm.setters.setCurrentTemplate(record);
                            vm.setters.setPreviewDrawerVisible(true);
                        }}
                    >
                        调度
                    </Button>
                    <Button
                        key="distribute"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={async () => {
                            vm.actions.blurActiveElement();
                            vm.setters.setCurrentTemplate(record);
                            const data = await vm.mutations.previewMutation.mutateAsync(record.id);
                            vm.setters.setDistributionPreviewData(data);
                            vm.setters.setIsDistributionPreviewOpen(true);
                        }}
                    >
                        分发
                    </Button>
                    <Button
                        key="rules"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={() => vm.actions.openRulesDrawer(record)}
                    >
                        规则
                    </Button>
                    <Popconfirm
                        title="确定要删除该模板吗？"
                        description="删除后将无法恢复，且不再生成新任务。"
                        onConfirm={async () => {
                            await vm.mutations.deleteMutation.mutateAsync(record.id);
                            message.success('模板已删除');
                            action?.reload();
                        }}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            key="delete"
                            type="primary"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ],
        },
    ];

    return (
        <>
            <ProTable<IntelTaskTemplateResponse>
                headerTitle="任务模板管理"
                actionRef={vm.refs.actionRef}
                rowKey="id"
                dataSource={vm.data.templates}
                columns={columns}
                search={{
                    labelWidth: 'auto',
                }}
                toolBarRender={() => [
                    <Button
                        key="create"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            vm.actions.blurActiveElement();
                            vm.setters.setIsCreateModalOpen(true);
                        }}
                    >
                        新建模板
                    </Button>,
                    <TemplateConfigHelp key="help" />,
                ]}
            />

            <Modal
                title="创建任务模板"
                open={vm.state.isCreateModalOpen}
                onCancel={() => {
                    vm.actions.blurActiveElement();
                    vm.setters.setIsCreateModalOpen(false);
                }}
                onOk={async () => {
                    try {
                        const values = await vm.state.createForm.validateFields();
                        await vm.actions.handleCreate({
                            ...values,
                            runAtMinute: (values.runAtHour || 0) * 60 + (values.runAtMin || 0),
                            dueAtMinute: (values.dueAtHour || 0) * 60 + (values.dueAtMin || 0),
                        });
                        vm.actions.blurActiveElement();
                        vm.setters.setIsCreateModalOpen(false);
                    } catch (err) {
                        // ignore validation errors
                    }
                }}
                width={980}
                destroyOnClose
                centered
                confirmLoading={vm.mutations.createMutation.isPending}
                focusTriggerAfterClose={false}
                afterOpenChange={vm.refs.createFocus.modalProps.afterOpenChange}
            >
                <Form
                    form={vm.state.createForm}
                    layout="vertical"
                    initialValues={normalizeTemplateForForm(DEFAULT_TEMPLATE_VALUES)}
                >
                    <TemplateFormCards
                        form={vm.state.createForm}
                        containerRef={vm.refs.createFocus.containerRef}
                        autoFocusFieldProps={vm.refs.createFocus.autoFocusFieldProps}
                    />
                </Form>
            </Modal>

            <Modal
                title="编辑任务模板"
                open={vm.state.isEditModalOpen}
                onCancel={() => {
                    vm.actions.blurActiveElement();
                    vm.setters.setIsEditModalOpen(false);
                }}
                onOk={async () => {
                    try {
                        const values = await vm.state.editForm.validateFields();
                        await vm.actions.handleUpdate({
                            ...values,
                            runAtMinute: (values.runAtHour || 0) * 60 + (values.runAtMin || 0),
                            dueAtMinute: (values.dueAtHour || 0) * 60 + (values.dueAtMin || 0),
                        });
                        vm.actions.blurActiveElement();
                        vm.setters.setIsEditModalOpen(false);
                    } catch (err) {
                        // ignore
                    }
                }}
                width={980}
                destroyOnClose
                centered
                confirmLoading={vm.mutations.updateMutation.isPending}
                focusTriggerAfterClose={false}
                afterOpenChange={vm.refs.editFocus.modalProps.afterOpenChange}
            >
                <Form
                    form={vm.state.editForm}
                    layout="vertical"
                    initialValues={vm.state.currentTemplate ? normalizeTemplateForForm(vm.state.currentTemplate) : undefined}
                >
                    <TemplateFormCards
                        form={vm.state.editForm}
                        containerRef={vm.refs.editFocus.containerRef}
                        autoFocusFieldProps={vm.refs.editFocus.autoFocusFieldProps}
                    />
                </Form>
            </Modal>

            <Drawer
                title="调度预览"
                width={800}
                open={vm.state.previewDrawerVisible}
                onClose={() => {
                    vm.actions.blurActiveElement();
                    vm.setters.setPreviewDrawerVisible(false);
                }}
            >
                {vm.state.currentTemplate && (
                    <>
                        {vm.state.currentTemplate.taskType === IntelTaskType.COLLECTION
                            && vm.state.currentTemplate.scheduleMode === TaskScheduleMode.POINT_DEFAULT ? (
                            <Alert
                                type="info"
                                showIcon
                                message="该模板按采集点频率下发，调度预览请以采集点配置为准。"
                            />
                        ) : (
                            <>
                                <Timeline
                                    items={computeNextRuns(vm.state.currentTemplate).map((time, idx) => ({
                                        color: idx === 0 ? 'green' : 'blue',
                                        children: (
                                            <>
                                                {time} {idx === 0 && <Tag color="green">下次运行</Tag>}
                                            </>
                                        ),
                                    }))}
                                />
                                <Divider />
                                <TemplateScheduleGrid template={vm.state.currentTemplate} weeks={4} />
                            </>
                        )}
                    </>
                )}
            </Drawer>

            <DistributionPreview
                open={vm.state.isDistributionPreviewOpen}
                onCancel={() => {
                    vm.actions.blurActiveElement();
                    vm.setters.setIsDistributionPreviewOpen(false);
                }}
                data={vm.state.distributionPreviewData}
                loading={vm.mutations.distributeMutation.isPending}
                onExecute={async () => {
                    if (vm.state.currentTemplate) {
                        await vm.mutations.distributeMutation.mutateAsync({ templateId: vm.state.currentTemplate.id });
                        message.success('任务分发成功');
                        vm.actions.blurActiveElement();
                        vm.setters.setIsDistributionPreviewOpen(false);
                    }
                }}
            />

            <Drawer
                title={`规则配置${vm.state.ruleTemplate ? ` - ${vm.state.ruleTemplate.name}` : ''}`}
                width={720}
                open={vm.state.rulesDrawerOpen}
                onClose={vm.actions.closeRulesDrawer}
            >
                <Space style={{ marginBottom: 16 }}>
                    <Button type="primary" onClick={() => vm.actions.openRuleModal()}>新增规则</Button>
                    <RuleConfigHelp />
                </Space>
                {vm.data.ruleMetrics && (
                    <Alert
                        type="info"
                        showIcon
                        message={`统计区间：${dayjs(vm.data.ruleMetrics.rangeStart).format('YYYY-MM-DD')} ~ ${dayjs(vm.data.ruleMetrics.rangeEnd).format('YYYY-MM-DD')}`}
                        style={{ marginBottom: 16 }}
                    />
                )}
                <Table
                    rowKey="id"
                    columns={ruleColumns as any}
                    dataSource={vm.data.rules}
                    loading={vm.data.rulesLoading}
                    pagination={false}
                />
            </Drawer>

            <Modal
                title={vm.state.editingRule ? '编辑规则' : '新增规则'}
                open={vm.state.isRuleModalOpen}
                onCancel={() => {
                    vm.actions.blurActiveElement();
                    vm.setters.setIsRuleModalOpen(false);
                }}
                onOk={vm.actions.handleSaveRule}
                destroyOnClose
                focusTriggerAfterClose={false}
                afterOpenChange={vm.refs.ruleFocus.modalProps.afterOpenChange}
            >
                <div ref={vm.refs.ruleFocus.containerRef}>
                    <Form form={vm.state.ruleForm} layout="vertical">
                        <Form.Item name="templateId" hidden>
                            <Input />
                        </Form.Item>
                        <Form.Item
                            name="scopeType"
                            label="范围"
                            rules={[{ required: true, message: '请选择范围' }]}
                        >
                            <Select
                                ref={vm.refs.ruleFocus.focusRef}
                                options={Object.entries(vm.computed.ruleScopeLabels).map(([value, label]) => ({ value, label }))}
                            />
                        </Form.Item>
                        <Form.Item label="范围配置">
                            <Space>
                                <Switch checked={vm.state.useAdvancedScope} onChange={vm.setters.setUseAdvancedScope} />
                                <span>高级 JSON</span>
                            </Space>
                        </Form.Item>

                        {vm.state.useAdvancedScope ? (
                            <Form.Item name="scopeQueryJson" label="范围条件（JSON）">
                                <Input.TextArea rows={3} placeholder='例如：{"collectionPointIds":["..."]}' />
                            </Form.Item>
                        ) : (
                            <>
                                {vm.computed.ruleScopeType === IntelTaskRuleScopeType.POINT && (
                                    <>
                                        <Form.Item label="采集点范围">
                                            <Segmented
                                                value={vm.state.rulePointScope}
                                                onChange={(value) => vm.actions.handleRulePointScopeChange(value as 'TYPE' | 'POINTS')}
                                                options={[
                                                    { label: '按类型', value: 'TYPE' },
                                                    { label: '按采集点', value: 'POINTS' },
                                                ]}
                                            />
                                        </Form.Item>
                                        {vm.state.rulePointScope === 'TYPE' && (
                                            <Form.Item name="scopeTargetPointType" label="采集点类型">
                                                <Select
                                                    mode="multiple"
                                                    allowClear
                                                    placeholder="选择采集点类型（可多选）"
                                                    options={Object.entries(vm.computed.collectionPointTypeLabels).map(([value, label]) => ({
                                                        value,
                                                        label,
                                                    }))}
                                                />
                                            </Form.Item>
                                        )}
                                        {vm.state.rulePointScope === 'POINTS' && (
                                            <Form.Item name="scopePointIds" label="指定采集点">
                                                <Select
                                                    mode="multiple"
                                                    placeholder="搜索并选择采集点"
                                                    showSearch
                                                    optionFilterProp="label"
                                                    maxTagCount={5}
                                                    options={vm.data.collectionPoints.map((point) => ({
                                                        value: point.id,
                                                        label: `${point.name}${point.code ? ` (${point.code})` : ''}`,
                                                    }))}
                                                />
                                            </Form.Item>
                                        )}
                                    </>
                                )}

                                {vm.computed.ruleScopeType === IntelTaskRuleScopeType.USER && (
                                    <Form.Item name="scopeUserIds" label="指定人员">
                                        <Select
                                            mode="multiple"
                                            placeholder="搜索并选择人员"
                                            showSearch
                                            optionFilterProp="label"
                                            maxTagCount={5}
                                            options={vm.data.users.map((user) => ({
                                                value: user.id,
                                                label: `${user.name}${user.department?.name ? ` (${user.department?.name})` : ''}`,
                                            }))}
                                        />
                                    </Form.Item>
                                )}

                                {vm.computed.ruleScopeType === IntelTaskRuleScopeType.DEPARTMENT && (
                                    <Form.Item name="scopeDepartmentIds" label="选择部门">
                                        <OrgDeptTreeSelect
                                            mode="dept"
                                            multiple
                                            showUserCount
                                            placeholder="选择目标部门"
                                        />
                                    </Form.Item>
                                )}

                                {vm.computed.ruleScopeType === IntelTaskRuleScopeType.ORGANIZATION && (
                                    <Form.Item name="scopeOrganizationIds" label="选择组织">
                                        <OrgDeptTreeSelect
                                            mode="org"
                                            multiple
                                            placeholder="选择目标组织"
                                        />
                                    </Form.Item>
                                )}

                                {vm.computed.ruleScopeType === IntelTaskRuleScopeType.ROLE && (
                                    <Form.Item name="scopeRoleIds" label="选择角色">
                                        <Select
                                            mode="multiple"
                                            placeholder="选择角色"
                                            showSearch
                                            optionFilterProp="label"
                                            maxTagCount={5}
                                            options={vm.data.roles.map((role) => ({
                                                value: role.id,
                                                label: `${role.name}${role.code ? ` (${role.code})` : ''}`,
                                            }))}
                                        />
                                    </Form.Item>
                                )}

                                {vm.computed.ruleScopeType === IntelTaskRuleScopeType.QUERY && (
                                    <>
                                        <Divider orientation="left">人员范围</Divider>
                                        <Form.Item name="scopeUserIds" label="指定人员">
                                            <Select
                                                mode="multiple"
                                                placeholder="搜索并选择人员"
                                                showSearch
                                                optionFilterProp="label"
                                                maxTagCount={5}
                                                options={vm.data.users.map((user) => ({
                                                    value: user.id,
                                                    label: `${user.name}${user.department?.name ? ` (${user.department?.name})` : ''}`,
                                                }))}
                                            />
                                        </Form.Item>
                                        <Form.Item name="scopeDepartmentIds" label="部门条件">
                                            <OrgDeptTreeSelect
                                                mode="dept"
                                                multiple
                                                showUserCount
                                                placeholder="选择目标部门"
                                            />
                                        </Form.Item>
                                        <Form.Item name="scopeOrganizationIds" label="组织条件">
                                            <OrgDeptTreeSelect
                                                mode="org"
                                                multiple
                                                placeholder="选择目标组织"
                                            />
                                        </Form.Item>
                                        <Form.Item name="scopeRoleIds" label="角色条件">
                                            <Select
                                                mode="multiple"
                                                placeholder="选择角色"
                                                showSearch
                                                optionFilterProp="label"
                                                maxTagCount={5}
                                                options={vm.data.roles.map((role) => ({
                                                    value: role.id,
                                                    label: `${role.name}${role.code ? ` (${role.code})` : ''}`,
                                                }))}
                                            />
                                        </Form.Item>

                                        <Divider orientation="left">采集点范围</Divider>
                                        <Form.Item label="采集点范围">
                                            <Segmented
                                                value={vm.state.rulePointScope}
                                                onChange={(value) => vm.actions.handleRulePointScopeChange(value as 'TYPE' | 'POINTS')}
                                                options={[
                                                    { label: '按类型', value: 'TYPE' },
                                                    { label: '按采集点', value: 'POINTS' },
                                                ]}
                                            />
                                        </Form.Item>
                                        {vm.state.rulePointScope === 'TYPE' && (
                                            <Form.Item name="scopeTargetPointType" label="采集点类型">
                                                <Select
                                                    mode="multiple"
                                                    allowClear
                                                    placeholder="选择采集点类型（可多选）"
                                                    options={Object.entries(vm.computed.collectionPointTypeLabels).map(([value, label]) => ({
                                                        value,
                                                        label,
                                                    }))}
                                                />
                                            </Form.Item>
                                        )}
                                        {vm.state.rulePointScope === 'POINTS' && (
                                            <Form.Item name="scopePointIds" label="指定采集点">
                                                <Select
                                                    mode="multiple"
                                                    placeholder="搜索并选择采集点"
                                                    showSearch
                                                    optionFilterProp="label"
                                                    maxTagCount={5}
                                                    options={vm.data.collectionPoints.map((point) => ({
                                                        value: point.id,
                                                        label: `${point.name}${point.code ? ` (${point.code})` : ''}`,
                                                    }))}
                                                />
                                            </Form.Item>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        <Form.Item
                            name="frequencyType"
                            label="频率"
                            rules={[{ required: true, message: '请选择频率' }]}
                        >
                            <Select options={vm.computed.cycleTypeOptions} />
                        </Form.Item>
                        <Form.Item name="dispatchTime" label="下发时间">
                            <TimePicker format="HH:mm" />
                        </Form.Item>

                        {/* Since cycleTypeOptions mapping includes value, let's use weekDayOptions here from the original component */}
                        {vm.computed.ruleFrequencyType === 'WEEKLY' && (
                            <Form.Item name="weekdays" label="每周">
                                <Select mode="multiple" options={[
                                    { label: '周一', value: 1 },
                                    { label: '周二', value: 2 },
                                    { label: '周三', value: 3 },
                                    { label: '周四', value: 4 },
                                    { label: '周五', value: 5 },
                                    { label: '周六', value: 6 },
                                    { label: '周日', value: 7 },
                                ]} />
                            </Form.Item>
                        )}

                        {vm.computed.ruleFrequencyType === 'MONTHLY' && (
                            <Form.Item name="monthDays" label="每月">
                                <Select mode="multiple" options={[
                                    { label: '月末', value: 0 },
                                    ...Array.from({ length: 31 }, (_, idx) => ({
                                        label: `${idx + 1} 日`,
                                        value: idx + 1,
                                    })),
                                ]} />
                            </Form.Item>
                        )}

                        <Form.Item name="assigneeStrategy" label="分配策略">
                            <Select options={Object.entries(vm.computed.ruleAssigneeLabels).map(([value, label]) => ({ value, label }))} />
                        </Form.Item>
                        <Form.Item name="completionPolicy" label="完成策略">
                            <Select options={Object.entries(vm.computed.ruleCompletionLabels).map(([value, label]) => ({ value, label }))} />
                        </Form.Item>
                        {vm.computed.ruleCompletionPolicy === IntelTaskCompletionPolicy.QUORUM && (
                            <Space style={{ display: 'flex', marginBottom: 16 }} size="large" align="start">
                                <Form.Item name="quorumCount" label="达标数" style={{ marginBottom: 0 }}>
                                    <InputNumber min={1} placeholder="如 3" />
                                </Form.Item>
                                <Form.Item name="quorumRatio" label="达标比例" style={{ marginBottom: 0 }}>
                                    <InputNumber min={0.1} max={1} step={0.1} placeholder="如 0.6" />
                                </Form.Item>
                            </Space>
                        )}
                        <Form.Item name="grouping" label="生成任务组" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="isActive" label="启用" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Form>
                </div>
            </Modal>

            <Modal
                title={`执行记录${vm.state.ruleLogTarget ? ` - ${vm.computed.ruleScopeLabels[vm.state.ruleLogTarget.scopeType] || vm.state.ruleLogTarget.scopeType}` : ''}`}
                open={vm.state.ruleLogOpen}
                onCancel={() => {
                    vm.actions.blurActiveElement();
                    vm.setters.setRuleLogOpen(false);
                }}
                footer={(
                    <Button
                        ref={vm.refs.ruleLogFocus.focusRef}
                        onClick={() => {
                            vm.actions.blurActiveElement();
                            vm.setters.setRuleLogOpen(false);
                        }}
                    >
                        关闭
                    </Button>
                )}
                destroyOnClose
                focusTriggerAfterClose={false}
                afterOpenChange={vm.refs.ruleLogFocus.modalProps.afterOpenChange}
            >
                <div ref={vm.refs.ruleLogFocus.containerRef}>
                    {vm.state.ruleLogTarget ? (
                        (() => {
                            const logs = vm.computed.ruleDailyMap.get(vm.state.ruleLogTarget.id) || [];
                            if (!logs.length) {
                                return <Alert type="info" showIcon message="当前规则暂无执行记录" />;
                            }
                            return (
                                <Timeline
                                    items={logs.slice(0, 30).map((item: any) => ({
                                        color: item.overdue > 0 ? 'red' : item.completed > 0 ? 'green' : 'blue',
                                        children: `${item.date} 生成 ${item.total} 完成 ${item.completed} 逾期 ${item.overdue}`,
                                    }))}
                                />
                            );
                        })()
                    ) : (
                        <Alert type="info" showIcon message="请选择规则查看执行记录" />
                    )}
                </div>
            </Modal>
        </>
    );
};

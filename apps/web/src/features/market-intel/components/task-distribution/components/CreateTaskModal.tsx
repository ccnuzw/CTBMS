import React from 'react';
import {
    ModalForm,
    ProFormText,
    ProFormSelect,
    ProFormRadio,
    ProFormDatePicker,
    ProFormTextArea,
} from '@ant-design/pro-components';
import { Alert, Collapse, Form, Space } from 'antd';
import { IntelTaskType, INTEL_TASK_TYPE_LABELS, IntelTaskPriority } from '@packages/types';
import { useUsers } from '../../../../users/api/users';
import { useOrganizations } from '../../../../organization/api/organizations';
import { useDepartments } from '../../../../organization/api/departments';
import { useTaskTemplates } from '../../../api/tasks';

interface CreateTaskModalProps {
    open: boolean;
    onCancel: () => void;
    onCreate: (values: any) => void;
    onGoTemplates?: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ open, onCancel, onCreate, onGoTemplates }) => {
    const [form] = Form.useForm();
    const orgId = Form.useWatch('orgId', form);
    const deptId = Form.useWatch('deptId', form);
    const { data: organizations = [] } = useOrganizations();
    const { data: departments = [] } = useDepartments(orgId);
    const { data: users = [] } = useUsers({ status: 'ACTIVE', organizationId: orgId, departmentId: deptId });
    const { data: notifyUsers = [] } = useUsers({ status: 'ACTIVE' });
    const { data: templates = [] } = useTaskTemplates();

    return (
        <ModalForm
            title="创建单次任务"
            open={open}
            form={form}
            onOpenChange={(visible) => !visible && onCancel()}
            onFinish={async (values) => {
                // ... same logic
                const { orgId: _orgId, deptId: _deptId, notifyMethods, notifyUserIds, ...rest } = values;
                const formattedValues = {
                    ...rest,
                    deadline: values.deadline ? values.deadline.toDate() : undefined,
                    attachmentUrls: values.attachmentUrls || [],
                    notifyConfig: notifyMethods || notifyUserIds || values.assigneeId ? {
                        methods: notifyMethods || [],
                        userIds: notifyUserIds && notifyUserIds.length > 0
                            ? notifyUserIds
                            : values.assigneeId
                                ? [values.assigneeId]
                                : [],
                    } : undefined,
                };
                onCreate(formattedValues);
                return true;
            }}
            width={800}
            grid={true}
            modalProps={{
                destroyOnClose: true,
                centered: true,
            }}
        >
            <Alert
                type="info"
                showIcon
                message="用于临时/一次性任务"
                description={
                    <Space>
                        <span>周期性任务请在“任务模板”中配置分发。</span>
                        {onGoTemplates && (
                            <a onClick={onGoTemplates}>去模板配置</a>
                        )}
                    </Space>
                }
                style={{ marginBottom: 24 }}
            />

            <ProFormText
                name="title"
                label="任务标题"
                placeholder="例如：2026年1月市场调研"
                rules={[{ required: true, message: '请输入任务标题' }]}
                colProps={{ span: 16 }}
            />
            <ProFormRadio.Group
                name="priority"
                label="优先级"
                initialValue={IntelTaskPriority.MEDIUM}
                options={[
                    { label: '高', value: IntelTaskPriority.HIGH },
                    { label: '中', value: IntelTaskPriority.MEDIUM },
                    { label: '低', value: IntelTaskPriority.LOW },
                ]}
                colProps={{ span: 8 }}
            />

            <ProFormSelect
                name="type"
                label="任务类型"
                options={Object.entries(INTEL_TASK_TYPE_LABELS).map(([value, label]) => ({
                    label,
                    value,
                }))}
                rules={[{ required: true, message: '请选择任务类型' }]}
                colProps={{ span: 8 }}
            />
            <ProFormDatePicker
                name="deadline"
                label="截止时间"
                width="md"
                fieldProps={{ showTime: true, style: { width: '100%' } }}
                rules={[{ required: true, message: '请选择截止时间' }]}
                colProps={{ span: 8 }}
            />
            <ProFormSelect
                name="templateId"
                label="模板引用（可选）"
                placeholder="作为来源标记"
                options={templates.map(template => ({ label: template.name, value: template.id }))}
                fieldProps={{ showSearch: true, optionFilterProp: 'label', allowClear: true }}
                colProps={{ span: 8 }}
            />

            <ProFormSelect
                name="orgId"
                label="组织筛选"
                placeholder="选择组织"
                options={organizations.map(org => ({ label: org.name, value: org.id }))}
                fieldProps={{ allowClear: true }}
                colProps={{ span: 8 }}
            />
            <ProFormSelect
                name="deptId"
                label="部门筛选"
                placeholder="选择部门"
                options={departments.map(dept => ({ label: dept.name, value: dept.id }))}
                fieldProps={{ allowClear: true }}
                colProps={{ span: 8 }}
            />
            <ProFormSelect
                name="assigneeId"
                label="指派给"
                options={users.map(user => ({ label: user.name, value: user.id }))}
                placeholder="选择执行人员"
                rules={[{ required: true, message: '请选择执行人员' }]}
                fieldProps={{ showSearch: true, optionFilterProp: 'label' }}
                colProps={{ span: 8 }}
            />

            <ProFormTextArea
                name="description"
                label="任务描述"
                rows={4}
                colProps={{ span: 24 }}
            />

            <div style={{ width: '100%' }}>
                <Collapse
                    ghost
                    items={[
                        {
                            key: 'advanced',
                            label: '更多设置（任务要求、附件、提醒方式）',
                            children: (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <ProFormTextArea
                                        name="requirements"
                                        label="任务要求"
                                        rows={3}
                                        placeholder="补充具体要求、验收标准、注意事项等"
                                    />
                                    <ProFormSelect
                                        name="attachmentUrls"
                                        label="任务附件（链接）"
                                        fieldProps={{
                                            mode: 'tags',
                                            tokenSeparators: [',', ' '],
                                            placeholder: '粘贴或输入链接，回车分隔',
                                        }}
                                    />
                                    <Space style={{ display: 'flex', width: '100%' }} align="start">
                                        <ProFormSelect
                                            name="notifyMethods"
                                            label="提醒方式"
                                            options={[
                                                { label: '站内通知', value: 'IN_APP' },
                                                { label: '短信', value: 'SMS' },
                                                { label: '邮件', value: 'EMAIL' },
                                            ]}
                                            fieldProps={{ mode: 'multiple', placeholder: '选择提醒方式' }}
                                            width="md"
                                        />
                                        <ProFormSelect
                                            name="notifyUserIds"
                                            label="通知对象"
                                            options={notifyUsers.map(user => ({ label: user.name, value: user.id }))}
                                            fieldProps={{ mode: 'multiple', placeholder: '选择通知人员', optionFilterProp: 'label' }}
                                            width="md"
                                        />
                                    </Space>
                                </Space>
                            ),
                        },
                    ]}
                />
            </div>
        </ModalForm>
    );
};

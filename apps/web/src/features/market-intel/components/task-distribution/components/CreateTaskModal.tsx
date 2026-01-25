import React from 'react';
import { Modal, Form, Input, DatePicker, Select, Radio } from 'antd';
import { IntelTaskType, INTEL_TASK_TYPE_LABELS, IntelTaskPriority } from '@packages/types';

interface CreateTaskModalProps {
    open: boolean;
    onCancel: () => void;
    onCreate: (values: any) => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ open, onCancel, onCreate }) => {
    const [form] = Form.useForm();

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            onCreate(values);
            form.resetFields();
        } catch (error) {
            console.error('Validate Failed:', error);
        }
    };

    return (
        <Modal
            title="创建新任务"
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            width={600}
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    name="title"
                    label="任务标题"
                    rules={[{ required: true, message: '请输入任务标题' }]}
                >
                    <Input placeholder="例如：2026年1月市场调研" />
                </Form.Item>

                <Form.Item
                    name="type"
                    label="任务类型"
                    rules={[{ required: true, message: '请选择任务类型' }]}
                >
                    <Select>
                        {Object.entries(INTEL_TASK_TYPE_LABELS).map(([value, label]) => (
                            <Select.Option key={value} value={value}>
                                {label}
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item
                    name="priority"
                    label="优先级"
                    initialValue={IntelTaskPriority.MEDIUM}
                >
                    <Radio.Group>
                        <Radio value={IntelTaskPriority.HIGH}>高</Radio>
                        <Radio value={IntelTaskPriority.MEDIUM}>中</Radio>
                        <Radio value={IntelTaskPriority.LOW}>低</Radio>
                    </Radio.Group>
                </Form.Item>

                <Form.Item
                    name="deadline"
                    label="截止日期"
                    rules={[{ required: true, message: '请选择截止日期' }]}
                >
                    <DatePicker style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                    name="assigneeId"
                    label="指派给"
                >
                    <Select placeholder="选择执行人员">
                        <Select.Option value="u1">张三</Select.Option>
                        <Select.Option value="u2">李四</Select.Option>
                        <Select.Option value="u3">王五</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="description"
                    label="任务描述"
                >
                    <Input.TextArea rows={4} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

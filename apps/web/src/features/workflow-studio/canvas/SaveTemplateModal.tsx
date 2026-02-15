import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import { useCreateTemplate } from '../api/templateCatalogApi';
import { TemplateCategoryEnum } from '@packages/types';

interface SaveTemplateModalProps {
    open: boolean;
    onClose: () => void;
    sourceVersionId: string;
    sourceWorkflowDefinitionId?: string;
    initialName?: string;
    initialCode?: string;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
    open,
    onClose,
    sourceVersionId,
    sourceWorkflowDefinitionId,
    initialName,
    initialCode,
}) => {
    const [form] = Form.useForm();
    const { mutate: createTemplate, isPending } = useCreateTemplate();

    useEffect(() => {
        if (open) {
            form.resetFields();
            form.setFieldsValue({
                name: initialName,
                templateCode: initialCode ? `${initialCode}-tpl-${Date.now()}` : `tpl-${Date.now()}`,
                category: 'CUSTOM',
            });
        }
    }, [open, initialName, initialCode, form]);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            createTemplate(
                {
                    ...values,
                    sourceVersionId,
                    // DslSnapshot will be fetched from the version by the backend
                    sourceWorkflowDefinitionId:
                        sourceWorkflowDefinitionId ?? '00000000-0000-0000-0000-000000000000',
                },
                {
                    onSuccess: () => {
                        message.success('模板创建成功');
                        onClose();
                    },
                    onError: () => {
                        message.error('模板创建失败');
                    }
                }
            );
        } catch (error) {
            // Validation failed
        }
    };

    return (
        <Modal
            title="保存为模板"
            open={open}
            onOk={handleOk}
            onCancel={onClose}
            confirmLoading={isPending}
            destroyOnClose
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    name="name"
                    label="模板名称"
                    rules={[{ required: true, message: '请输入模板名称' }]}
                >
                    <Input placeholder="例如：通用风险审批流" />
                </Form.Item>

                <Form.Item
                    name="templateCode"
                    label="模板编码"
                    rules={[{ required: true, message: '请输入模板编码' }]}
                >
                    <Input placeholder="unique-template-code" />
                </Form.Item>

                <Form.Item
                    name="category"
                    label="分类"
                    rules={[{ required: true, message: '请选择分类' }]}
                >
                    <Select
                        options={TemplateCategoryEnum.options.map((value) => ({
                            label: value,
                            value,
                        }))}
                    />
                </Form.Item>

                <Form.Item name="tags" label="标签">
                    <Select mode="tags" placeholder="输入标签按回车" />
                </Form.Item>

                <Form.Item name="description" label="描述">
                    <Input.TextArea rows={3} />
                </Form.Item>

                <Form.Item name="coverImageUrl" label="封面图片URL">
                    <Input placeholder="http://..." />
                </Form.Item>
            </Form>
        </Modal>
    );
};

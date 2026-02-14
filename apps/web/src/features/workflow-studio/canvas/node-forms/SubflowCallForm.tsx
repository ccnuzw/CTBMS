import React from 'react';
import { Form, Input } from 'antd';

interface SubflowCallFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const SubflowCallForm: React.FC<SubflowCallFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item
                label="子流程定义 ID"
                required
                help="填写 workflow definition UUID，运行时会调用其已发布版本或指定版本"
            >
                <Input
                    value={(config.workflowDefinitionId as string) ?? ''}
                    onChange={(event) => onChange('workflowDefinitionId', event.target.value)}
                    placeholder="workflowDefinitionId"
                />
            </Form.Item>
            <Form.Item label="子流程版本 ID (可选)">
                <Input
                    value={(config.workflowVersionId as string) ?? ''}
                    onChange={(event) => onChange('workflowVersionId', event.target.value)}
                    placeholder="workflowVersionId（留空则取已发布版本）"
                />
            </Form.Item>
            <Form.Item label="输出字段前缀 (可选)">
                <Input
                    value={(config.outputKeyPrefix as string) ?? ''}
                    onChange={(event) => onChange('outputKeyPrefix', event.target.value)}
                    placeholder="例如: child"
                />
            </Form.Item>
        </Form>
    );
};

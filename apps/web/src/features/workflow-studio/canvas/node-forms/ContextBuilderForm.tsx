import React from 'react';
import { Form, Select, InputNumber } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ContextBuilderForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="上下文来源 (Context Sources)" help="选择要包含的信息源">
                <Select
                    mode="multiple"
                    value={config.sources as string[]}
                    onChange={(v) => onChange('sources', v)}
                    options={[
                        { label: '上游节点输出 (Upstream Outputs)', value: 'UPSTREAM' },
                        { label: '全局变量 (Global Variables)', value: 'GLOBAL' },
                        { label: '知识库引用 (Knowledge Base)', value: 'KNOWLEDGE' },
                        { label: '历史辩论记录 (History)', value: 'HISTORY' },
                    ]}
                    placeholder="选择来源"
                />
            </Form.Item>

            <Form.Item label="输出格式 (Output Format)">
                <Select
                    value={config.format as string ?? 'MARKDOWN'}
                    onChange={(v) => onChange('format', v)}
                    options={[
                        { label: 'Markdown 文本', value: 'MARKDOWN' },
                        { label: 'JSON 对象', value: 'JSON' },
                        { label: '纯文本 (Plain Text)', value: 'TEXT' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="最大 Token 数 (Max Tokens)">
                <InputNumber
                    value={config.maxTokens as number ?? 2000}
                    onChange={(v) => onChange('maxTokens', v)}
                    style={{ width: '100%' }}
                    step={100}
                />
            </Form.Item>
        </Form>
    );
};

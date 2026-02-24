import React from 'react';
import { Form, Select, InputNumber, Alert, Space, Button } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

const TOKEN_PRESETS = [
    { label: '对话 (2K)', value: 2000 },
    { label: '图文 (8K)', value: 8000 },
    { label: '研报档 (32K)', value: 32000 },
    { label: '全量拉取 (128K)', value: 128000 },
];

export const ContextBuilderForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="上下文信息打包中心"
                description="这个节点负责把历史消息、知识库以及前面节点的输出“揉”在一起，打包成一段带有结构的大文本，投喂给后续的 AI 模型使用。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />
            <Form.Item label="信息采信来源" required help="多选：决定我们要把哪些模块的数据打包送给大模型">
                <Select
                    mode="multiple"
                    value={config.sources as string[]}
                    onChange={(v) => onChange('sources', v)}
                    options={[
                        { label: '上游节点的直接输出', value: 'UPSTREAM' },
                        { label: '工作流全局变量', value: 'GLOBAL' },
                        { label: '已关联的知识库内容', value: 'KNOWLEDGE' },
                        { label: '本会话相关的历史辩论', value: 'HISTORY' },
                    ]}
                    placeholder="请至少选择一个来源"
                />
            </Form.Item>

            <Form.Item label="最终打包吐出格式" required>
                <Select
                    value={config.format as string ?? 'MARKDOWN'}
                    onChange={(v) => onChange('format', v)}
                    options={[
                        { label: '📝 通用 Markdown (最适合大模型阅读)', value: 'MARKDOWN' },
                        { label: '📦 结构化 JSON (适合系统严格解析)', value: 'JSON' },
                        { label: '📄 系统原始拼插文本', value: 'TEXT' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="单次喂给模型的最大容量限制 (Max Tokens)">
                <div style={{ marginBottom: 8 }}>
                    <Space size={[4, 4]} wrap>
                        {TOKEN_PRESETS.map((preset) => (
                            <Button
                                key={preset.value}
                                size="small"
                                onClick={() => onChange('maxTokens', preset.value)}
                                type={config.maxTokens === preset.value ? 'primary' : 'default'}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </Space>
                </div>
                <InputNumber
                    value={config.maxTokens as number ?? 2000}
                    onChange={(v) => onChange('maxTokens', v)}
                    style={{ width: '100%' }}
                    step={100}
                    placeholder="输入限制阈值，防止文字过长撑爆 AI API"
                />
            </Form.Item>
        </Form>
    );
};

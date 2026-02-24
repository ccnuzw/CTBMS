import React from 'react';
import { Form, Select, Input } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const NotifyForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="通知渠道">
                <Select
                    value={config.channel as string}
                    onChange={(v) => onChange('channel', v)}
                    options={[
                        { label: '邮件', value: 'EMAIL' },
                        { label: '企业微信', value: 'WECOM' },
                        { label: '钉钉', value: 'DINGTALK' },
                        { label: '系统站内信', value: 'IN_APP' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="接收人">
                <Select
                    mode="tags"
                    value={config.recipients as string[]}
                    onChange={(v) => onChange('recipients', v)}
                    placeholder="输入邮箱或用户 ID，按回车确认"
                />
            </Form.Item>

            <Form.Item label="消息模板 ID">
                <Input
                    value={config.templateId as string}
                    onChange={(e) => onChange('templateId', e.target.value)}
                    placeholder="例如：user_welcome_msg (选填)"
                />
            </Form.Item>

            <Form.Item label="消息内容">
                <Input.TextArea
                    value={config.content as string}
                    onChange={(e) => onChange('content', e.target.value)}
                    rows={6}
                    placeholder="输入通知的正文内容，支持使用 {{变量}} 插入前面步骤的数据"
                />
            </Form.Item>
        </Form>
    );
};

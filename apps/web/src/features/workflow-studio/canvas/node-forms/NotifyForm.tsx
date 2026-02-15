import React from 'react';
import { Form, Select, Input } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const NotifyForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="通知渠道 (Channel)">
                <Select
                    value={config.channel as string}
                    onChange={(v) => onChange('channel', v)}
                    options={[
                        { label: '邮件 (Email)', value: 'EMAIL' },
                        { label: '企业微信 (WeCom)', value: 'WECOM' },
                        { label: '钉钉 (DingTalk)', value: 'DINGTALK' },
                        { label: '系统站内信 (In-App)', value: 'IN_APP' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="接收人 (Recipients)">
                <Select
                    mode="tags"
                    value={config.recipients as string[]}
                    onChange={(v) => onChange('recipients', v)}
                    placeholder="输入邮箱或用户ID"
                />
            </Form.Item>

            <Form.Item label="消息模板 ID (Template ID)">
                <Input
                    value={config.templateId as string}
                    onChange={(e) => onChange('templateId', e.target.value)}
                    placeholder="可选，引用通知模板"
                />
            </Form.Item>

            <Form.Item label="消息内容 (Content Content)">
                <Input.TextArea
                    value={config.content as string}
                    onChange={(e) => onChange('content', e.target.value)}
                    rows={4}
                    placeholder="支持 Markdown 及变量 {{node.field}}"
                />
            </Form.Item>
        </Form>
    );
};

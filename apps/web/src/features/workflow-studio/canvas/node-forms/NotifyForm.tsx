import React from 'react';
import { Form, Select, Input, Alert, Typography } from 'antd';

const { Text } = Typography;

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const NotifyForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="静默消息通知"
                description="这是一个“旁路动作”节点：当流程跑到这里时，会根据您的配置自动向负责人发送消息。发送完毕后节点立即通过，不会阻断工作流后续进度。"
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form.Item label="通知送达渠道" required>
                <Select
                    value={config.channel as string}
                    onChange={(v) => onChange('channel', v)}
                    options={[
                        { label: '📧 电子邮件 (Email)', value: 'EMAIL' },
                        { label: '🏢 企业微信 (WeCom)', value: 'WECOM' },
                        { label: '🔵 钉钉 (DingTalk)', value: 'DINGTALK' },
                        { label: '📮 系统站内信 (App Notice)', value: 'IN_APP' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="接收人员列表" required help="直接输入员工的工号、企业邮箱或拼音，敲击回车录入多个。">
                <Select
                    mode="tags"
                    value={config.recipients as string[]}
                    onChange={(v) => onChange('recipients', v)}
                    placeholder="例如: zhangsan@company.com"
                />
            </Form.Item>

            <Form.Item label="套用消息模板 ID (选填)" help="如果您在管理中心配好了格式漂亮的富文本排版模板，这里可以直接填写它的编号。">
                <Input
                    value={config.templateId as string}
                    onChange={(e) => onChange('templateId', e.target.value)}
                    placeholder="业务模板编号，如：RISK_ALERT_T01"
                />
            </Form.Item>

            <Form.Item
                label="自定义消息正文"
                help={
                    <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            支持用双大括号动态拼接上游数据。范例：
                            <br />
                            <code style={{ background: '#f5f5f5', padding: '2px 4px', borderRadius: 4 }}>
                                警告：节点 {`{{$nodes.node_2.data.riskScore}}`} 发现异常！
                            </code>
                        </Text>
                    </div>
                }
            >
                <Input.TextArea
                    value={config.content as string}
                    onChange={(e) => onChange('content', e.target.value)}
                    rows={6}
                    placeholder="在此输入您想要发送的文本报告内容"
                />
            </Form.Item>
        </Form>
    );
};

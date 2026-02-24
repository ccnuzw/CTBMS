import React from 'react';
import { Form, Input, Button, Space, Typography } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface CronTriggerFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

const PRESETS = [
    { label: '每分钟', value: '* * * * *' },
    { label: '每10分钟', value: '*/10 * * * *' },
    { label: '每小时', value: '0 * * * *' },
    { label: '每天早9点', value: '0 9 * * *' },
    { label: '工作日早9点', value: '0 9 * * 1-5' },
];

export const CronTriggerForm: React.FC<CronTriggerFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="Cron 表达式" help="支持标准 Cron 语法（分 时 日 月 周）">
                <Input
                    value={config.cronExpression as string}
                    onChange={(e) => onChange('cronExpression', e.target.value)}
                    placeholder="* * * * *"
                    prefix={<ClockCircleOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
                />
            </Form.Item>
            <Form.Item>
                <div style={{ marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>快捷预设：</Text>
                </div>
                <Space wrap size={[4, 8]}>
                    {PRESETS.map((preset) => (
                        <Button
                            key={preset.value}
                            size="small"
                            onClick={() => onChange('cronExpression', preset.value)}
                            type={config.cronExpression === preset.value ? 'primary' : 'default'}
                        >
                            {preset.label}
                        </Button>
                    ))}
                </Space>
            </Form.Item>
        </Form>
    );
};

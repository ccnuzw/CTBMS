import React from 'react';
import { Form, Input, Select, Space, Typography } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface CronTriggerFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const CronTriggerForm: React.FC<CronTriggerFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="Cron 表达式" help="例如: 0 9 * * 1-5 (周一至周五 9:00)">
                <Input
                    value={config.cronExpression as string}
                    onChange={(e) => onChange('cronExpression', e.target.value)}
                    placeholder="* * * * *"
                    prefix={<ClockCircleOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
                />
            </Form.Item>
            {/* Future: Add a cron builder or helper */}
        </Form>
    );
};

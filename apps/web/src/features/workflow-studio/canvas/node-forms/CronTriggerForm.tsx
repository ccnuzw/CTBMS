import React, { useMemo } from 'react';
import { Form, Input, Button, Space, Typography, Checkbox, TimePicker } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useWorkflowUxMode } from '../../../../hooks/useWorkflowUxMode';

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

const WEEKDAY_OPTIONS = [
    { label: '周一', value: 1 },
    { label: '周二', value: 2 },
    { label: '周三', value: 3 },
    { label: '周四', value: 4 },
    { label: '周五', value: 5 },
    { label: '周六', value: 6 },
    { label: '周日', value: 0 },
];

/**
 * 从 cron 表达式解析工作日和时间
 * 只处理简单模式的 "M H * * DOW" 格式
 */
const parseCron = (cron?: string): { weekdays: number[]; hour: number; minute: number } => {
    const defaults = { weekdays: [1, 2, 3, 4, 5], hour: 9, minute: 0 };
    if (!cron || typeof cron !== 'string') return defaults;
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return defaults;

    const minute = parts[0] === '*' ? 0 : parseInt(parts[0], 10);
    const hour = parts[1] === '*' ? 0 : parseInt(parts[1], 10);

    let weekdays: number[] = [];
    const dowPart = parts[4];
    if (dowPart === '*') {
        weekdays = [0, 1, 2, 3, 4, 5, 6];
    } else {
        // handle ranges like 1-5 and lists like 1,3,5
        const segments = dowPart.split(',');
        for (const seg of segments) {
            if (seg.includes('-')) {
                const [start, end] = seg.split('-').map(Number);
                for (let i = start; i <= end; i++) weekdays.push(i);
            } else {
                weekdays.push(Number(seg));
            }
        }
    }

    return {
        weekdays,
        hour: isNaN(hour) ? 9 : hour,
        minute: isNaN(minute) ? 0 : minute,
    };
};

const buildCron = (weekdays: number[], hour: number, minute: number): string => {
    const dow = weekdays.length === 7 || weekdays.length === 0 ? '*' : weekdays.sort((a, b) => a - b).join(',');
    return `${minute} ${hour} * * ${dow}`;
};

export const CronTriggerForm: React.FC<CronTriggerFormProps> = ({ config, onChange }) => {
    const uxMode = useWorkflowUxMode((s) => s.mode);
    const isExpert = uxMode === 'expert';

    const parsed = useMemo(() => parseCron(config.cronExpression as string), [config.cronExpression]);

    const handleWeekdaysChange = (checkedValues: number[]) => {
        onChange('cronExpression', buildCron(checkedValues, parsed.hour, parsed.minute));
    };

    const handleTimeChange = (_: unknown, timeString: string | string[]) => {
        const str = Array.isArray(timeString) ? timeString[0] : timeString;
        const [h, m] = (str || '09:00').split(':').map(Number);
        onChange('cronExpression', buildCron(parsed.weekdays, h, m));
    };

    if (!isExpert) {
        return (
            <Form layout="vertical" size="small">
                <Form.Item label="执行日期" help="选择工作流在哪些天自动运行">
                    <Checkbox.Group
                        options={WEEKDAY_OPTIONS}
                        value={parsed.weekdays}
                        onChange={(values) => handleWeekdaysChange(values as number[])}
                    />
                </Form.Item>
                <Form.Item label="执行时间">
                    <TimePicker
                        format="HH:mm"
                        value={dayjs().hour(parsed.hour).minute(parsed.minute)}
                        onChange={handleTimeChange}
                        style={{ width: '100%' }}
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
    }

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

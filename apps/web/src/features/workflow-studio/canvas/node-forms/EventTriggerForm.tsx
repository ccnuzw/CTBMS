import React from 'react';
import { Form, Input, Select } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const EventTriggerForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="事件类型 (Event Type)" required>
                <Select
                    value={config.eventType as string}
                    onChange={(v) => onChange('eventType', v)}
                    options={[
                        { label: '市场异动 (Market Anomaly)', value: 'MARKET_ANOMALY' },
                        { label: '新闻舆情 (News Alert)', value: 'NEWS_ALERT' },
                        { label: '系统通知 (System Notification)', value: 'SYSTEM_NOTIFICATION' },
                        { label: '订单状态 (Order Status)', value: 'ORDER_STATUS' },
                    ]}
                    placeholder="选择事件类型"
                />
            </Form.Item>

            <Form.Item label="订阅主题 (Topic)">
                <Input
                    value={config.topic as string}
                    onChange={(e) => onChange('topic', e.target.value)}
                    placeholder="例如: market.us.corn"
                />
            </Form.Item>

            <Form.Item label="过滤条件 (Filter Expression)">
                <Input.TextArea
                    value={config.filter as string}
                    onChange={(e) => onChange('filter', e.target.value)}
                    rows={2}
                    placeholder="JSONPath 或简易表达式"
                />
            </Form.Item>
        </Form>
    );
};

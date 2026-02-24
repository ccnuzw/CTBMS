import React from 'react';
import { Form, Input, Select } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const EventTriggerForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="监听事件类型" required>
                <Select
                    value={config.eventType as string}
                    onChange={(v) => onChange('eventType', v)}
                    options={[
                        { label: '外部市场异动', value: 'MARKET_ANOMALY' },
                        { label: '外部新闻舆情', value: 'NEWS_ALERT' },
                        { label: '内部系统通知', value: 'SYSTEM_NOTIFICATION' },
                        { label: '内部订单状态变更', value: 'ORDER_STATUS' },
                    ]}
                    placeholder="选择触发该工作流的事件类型"
                />
            </Form.Item>

            <Form.Item label="精准过滤主题 (可选)" help="例如仅监听市场异动大类下的玉米分类">
                <Input
                    value={config.topic as string}
                    onChange={(e) => onChange('topic', e.target.value)}
                    placeholder="例如: market.agri.corn"
                />
            </Form.Item>

            <Form.Item label="条件白名单 (可选)" help="仅当事件承载的数据符合下方条件时触发工作流">
                <Input.TextArea
                    value={config.filter as string}
                    onChange={(e) => onChange('filter', e.target.value)}
                    rows={3}
                    style={{ fontFamily: 'monospace' }}
                    placeholder="输入匹配条件表达式，例如: data.price > 1000"
                />
            </Form.Item>
        </Form>
    );
};

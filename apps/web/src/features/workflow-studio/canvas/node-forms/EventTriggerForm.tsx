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

            <Form.Item label="条件过滤表达式 (可选)" help="使用条件表达式进行精确拦截，仅当数据匹配且非空/非假时触发">
                <Input.TextArea
                    value={config.filter as string}
                    onChange={(e) => onChange('filter', e.target.value)}
                    rows={3}
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                    placeholder={`支持标准表达式引擎语法，示例：
payload.price > 1000
payload.region == 'CN' && payload.urgency == 'HIGH'`}
                />
            </Form.Item>
        </Form>
    );
};

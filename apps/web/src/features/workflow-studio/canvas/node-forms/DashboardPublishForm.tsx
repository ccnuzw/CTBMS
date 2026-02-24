import React from 'react';
import { Form, Input, Alert } from 'antd';

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const DashboardPublishForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="系统看板推送 (BI"
                description="节点能将流经此处的数据集直接喂给管理层看板（Dashboard）的指标卡或图眼中。常作为分析流的终点使用。"
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form.Item label="目标看板编号 (Dashboard ID)" required help="您希望把数据推送到哪个仪表盘？">
                <Input
                    value={config.dashboardId as string}
                    onChange={(e) => onChange('dashboardId', e.target.value)}
                    placeholder="输入系统看板 ID，例如：sys_monitor_01"
                />
            </Form.Item>

            <Form.Item label="目标数据集名称 (Dataset Name)" required help="挂载到该看板上的哪个核心指标/图表中？">
                <Input
                    value={config.datasetName as string}
                    onChange={(e) => onChange('datasetName', e.target.value)}
                    placeholder="输入图表对应的数据集名称，例如：daily_risk_metrics"
                />
            </Form.Item>
        </Form>
    );
};

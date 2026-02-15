import React from 'react';
import { Form, InputNumber, Select } from 'antd';
import { useDataConnectors } from '../../../workflow-data-connector/api';

interface MarketDataFetchFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const MarketDataFetchForm: React.FC<MarketDataFetchFormProps> = ({ config, onChange }) => {
    const { data: connectorPage, isLoading } = useDataConnectors({
        isActive: true,
        page: 1,
        pageSize: 200,
    });
    const selectedConnectorCode = (config.dataSourceCode as string) || (config.connectorCode as string);

    return (
        <Form layout="vertical" size="small">
            <Form.Item label="数据连接器" required>
                <Select
                    value={selectedConnectorCode}
                    onChange={(value) => {
                        onChange('dataSourceCode', value);
                        onChange('connectorCode', value);
                    }}
                    loading={isLoading}
                    showSearch
                    optionFilterProp="label"
                    options={(connectorPage?.data || [])
                        .filter((item) => item.isActive)
                        .map((item) => ({
                            label: `${item.connectorName} (${item.connectorCode})`,
                            value: item.connectorCode,
                        }))}
                    placeholder="选择数据源"
                />
            </Form.Item>
            <Form.Item label="时间范围类型">
                <Select
                    value={config.timeRangeType as string}
                    onChange={(v) => onChange('timeRangeType', v)}
                    options={[
                        { label: '最近 N 天', value: 'LAST_N_DAYS' },
                        { label: '最近 N 小时', value: 'LAST_N_HOURS' },
                        { label: '指定范围', value: 'SPECIFIC_RANGE' },
                    ]}
                />
            </Form.Item>
            {(config.timeRangeType === 'LAST_N_DAYS' || !config.timeRangeType) && (
                <Form.Item label="回溯天数">
                    <InputNumber
                        value={config.lookbackDays as number}
                        onChange={(v) => onChange('lookbackDays', v)}
                        min={1}
                        max={365}
                        style={{ width: '100%' }}
                    />
                </Form.Item>
            )}
            {config.timeRangeType === 'LAST_N_HOURS' && (
                <Form.Item label="回溯小时">
                    <InputNumber
                        value={config.lookbackHours as number}
                        onChange={(v) => onChange('lookbackHours', v)}
                        min={1}
                        max={72}
                        style={{ width: '100%' }}
                    />
                </Form.Item>
            )}
        </Form>
    );
};

import React from 'react';
import { Form, InputNumber, Select } from 'antd';

interface MarketDataFetchFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const MarketDataFetchForm: React.FC<MarketDataFetchFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="数据连接器 (Connector)" required>
                <Select
                    value={config.connectorCode as string}
                    onChange={(v) => onChange('connectorCode', v)}
                    options={[
                        { label: 'Binance Market Data', value: 'binance-market' },
                        { label: 'CoinGecko API', value: 'coingecko' },
                        { label: 'Internal DB', value: 'internal-db' },
                    ]}
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

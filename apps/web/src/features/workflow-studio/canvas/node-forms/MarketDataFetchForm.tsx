import React, { useMemo } from 'react';
import { Form, InputNumber, Select } from 'antd';
import { useDataConnectors } from '../../../workflow-data-connector/api';
import { useDictionary } from '@/hooks/useDictionaries';
import { useProvinces } from '../../../market-intel/api/hooks';

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

    const { data: commodityDict, isLoading: loadingCommodities } = useDictionary('COMMODITY');
    const { data: provinces, isLoading: loadingProvinces } = useProvinces();

    const MAIN_COMMODITIES = ['CORN', 'WHEAT', 'SOYBEAN', 'RICE', 'SORGHUM', 'BARLEY'];
    const COMMODITY_LABELS_FALLBACK: Record<string, string> = {
        CORN: '玉米', WHEAT: '小麦', SOYBEAN: '大豆', RICE: '稻谷', SORGHUM: '高粱', BARLEY: '大麦',
    };

    const commodityOptions = useMemo(() => {
        const items = (commodityDict || []).filter((item) => item.isActive);
        if (items.length > 0) {
            return items.map((item) => ({
                label: item.label || item.code,
                value: item.code,
            }));
        }
        return MAIN_COMMODITIES.map((code) => ({
            label: COMMODITY_LABELS_FALLBACK[code] || code,
            value: code,
        }));
    }, [commodityDict]);

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
            <Form.Item label="相关品种 (可选)">
                <Select
                    mode="multiple"
                    allowClear
                    placeholder="不限品种"
                    value={(config.filters as Record<string, unknown>)?.commodity as string[]}
                    onChange={(v) => onChange('filters', { ...(config.filters as Record<string, unknown> || {}), commodity: v?.length ? v : undefined })}
                    options={commodityOptions}
                    loading={loadingCommodities}
                    showSearch
                    optionFilterProp="label"
                />
            </Form.Item>
            <Form.Item label="地域范围 (可选)">
                <Select
                    mode="multiple"
                    allowClear
                    placeholder="不限地域"
                    value={(config.filters as Record<string, unknown>)?.regionCode as string[]}
                    onChange={(v) => onChange('filters', { ...(config.filters as Record<string, unknown> || {}), regionCode: v?.length ? v : undefined })}
                    options={provinces?.map((p) => ({ label: p.name, value: p.code })) || []}
                    loading={loadingProvinces}
                    showSearch
                    optionFilterProp="label"
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

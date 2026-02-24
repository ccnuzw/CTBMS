import React, { useMemo } from 'react';
import { Form, InputNumber, Select } from 'antd';
import { useDictionary } from '@/hooks/useDictionaries';
import { useProvinces } from '../../../market-intel/api/hooks';

interface ReportFetchFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ReportFetchForm: React.FC<ReportFetchFormProps> = ({ config, onChange }) => {
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

    const limit = typeof config.limit === 'number' ? config.limit : 1;

    return (
        <Form layout="vertical" size="small">
            <Form.Item label="报告类型">
                <Select
                    value={config.category as string || 'daily'}
                    onChange={(v) => onChange('category', v)}
                    options={[
                        { label: '市场日报', value: 'daily' },
                        { label: '市场周报', value: 'weekly' },
                        { label: '市场月报', value: 'monthly' },
                        { label: '深度研究', value: 'research' },
                    ]}
                />
            </Form.Item>
            <Form.Item label="获取数量 (近期 N 篇)">
                <InputNumber
                    min={1}
                    max={20}
                    value={limit}
                    onChange={(v) => onChange('limit', v)}
                    style={{ width: '100%' }}
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
        </Form>
    );
};

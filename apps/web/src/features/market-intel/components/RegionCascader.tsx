import React, { useState, useMemo } from 'react';
import { Card, List, Empty, Spin, Input, Button, Space, Typography, Tag, theme, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useProvinces, useCities, useDistricts } from '../api/region';
import { AdministrativeRegion, RegionLevel } from '@packages/types';

const { Search } = Input;
const { Text } = Typography;

interface RegionCascaderProps {
    onEdit: (record: AdministrativeRegion) => void;
    onDelete: (id: string) => void;
}

export const RegionCascader: React.FC<RegionCascaderProps> = ({ onEdit, onDelete }) => {
    const { token } = theme.useToken();
    const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
    const [selectedCity, setSelectedCity] = useState<string | null>(null);

    // Data Hooks
    const { data: provinces, isLoading: loadingProvinces } = useProvinces();
    const { data: cities, isLoading: loadingCities } = useCities(selectedProvince || undefined);
    const { data: districts, isLoading: loadingDistricts } = useDistricts(selectedCity || undefined);

    // Search States
    const [provSearch, setProvSearch] = useState('');
    const [citySearch, setCitySearch] = useState('');
    const [distSearch, setDistSearch] = useState('');

    // Filtered Data
    const filteredProvinces = useMemo(() =>
        provinces?.filter(p => p.name.includes(provSearch) || p.code.includes(provSearch)) || [],
        [provinces, provSearch]
    );

    const filteredCities = useMemo(() =>
        cities?.filter(c => c.name.includes(citySearch) || c.code.includes(citySearch)) || [],
        [cities, citySearch]
    );

    const filteredDistricts = useMemo(() =>
        districts?.filter(d => d.name.includes(distSearch) || d.code.includes(distSearch)) || [],
        [districts, distSearch]
    );

    // Render Column Helper
    const renderColumn = (
        title: string,
        data: AdministrativeRegion[],
        loading: boolean,
        search: string,
        setSearch: (val: string) => void,
        selectedId: string | null,
        onSelect: (id: string) => void,
        placeholder: string
    ) => (
        <Card
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{title}</span>
                    <Tag>{data.length}</Tag>
                </div>
            }
            bodyStyle={{ padding: 0, height: '600px', display: 'flex', flexDirection: 'column' }}
            style={{ height: '100%' }}
        >
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorSplit}` }}>
                <Search
                    placeholder="搜索..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    allowClear
                    size="small"
                />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <Spin spinning={loading}>
                    {data.length === 0 && !loading ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={placeholder} />
                    ) : (
                        <List
                            dataSource={data}
                            renderItem={item => (
                                <List.Item
                                    className="region-list-item"
                                    style={{
                                        padding: '8px 16px',
                                        cursor: 'pointer',
                                        backgroundColor: item.code === selectedId ? token.colorPrimaryBg : 'transparent',
                                        borderLeft: item.code === selectedId ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
                                        transition: 'all 0.2s',
                                    }}
                                    onClick={() => onSelect(item.code)}
                                    actions={[
                                        <Button
                                            key="edit"
                                            type="text"
                                            size="small"
                                            icon={<EditOutlined />}
                                            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                                        />,
                                        <Popconfirm
                                            key="delete"
                                            title="确定删除?"
                                            onConfirm={(e) => { e?.stopPropagation(); onDelete(item.id); }}
                                            onCancel={(e) => e?.stopPropagation()}
                                        >
                                            <Button
                                                type="text"
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </Popconfirm>
                                    ]}
                                >
                                    <div style={{ width: '100%' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Text strong={item.code === selectedId}>{item.name}</Text>
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{item.code}</Text>
                                    </div>
                                </List.Item>
                            )}
                        />
                    )}
                </Spin>
            </div>
        </Card>
    );

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, height: '680px' }}>
            {/* Province Column */}
            {renderColumn(
                '省级 (Province)',
                filteredProvinces,
                loadingProvinces,
                provSearch,
                setProvSearch,
                selectedProvince,
                (id) => { setSelectedProvince(id); setSelectedCity(null); },
                '无数据'
            )}

            {/* City Column */}
            {renderColumn(
                selectedProvince ? '地级 (City)' : '地级',
                filteredCities,
                !!selectedProvince && loadingCities,
                citySearch,
                setCitySearch,
                selectedCity,
                (id) => setSelectedCity(id),
                selectedProvince ? '无城市数据' : '请先选择省份'
            )}

            {/* District Column */}
            {renderColumn(
                selectedCity ? '县级 (District)' : '县级',
                filteredDistricts,
                !!selectedCity && loadingDistricts,
                distSearch,
                setDistSearch,
                null, // No further selection
                () => { }, // No further drill-down
                selectedCity ? '无区县数据' : '请先选择城市'
            )}
        </div>
    );
};

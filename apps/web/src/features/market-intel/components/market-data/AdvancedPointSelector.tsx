import React, { useMemo, useState } from 'react';
import { Modal, Transfer, Tag, Flex, theme, Empty, Button, Space } from 'antd';
import { FilterOutlined, AimOutlined, BankOutlined, ShopOutlined, GlobalOutlined, EnvironmentOutlined } from '@ant-design/icons';
import type { TransferDirection } from 'antd/es/transfer';
import PinyinMatch from 'pinyin-match';
import { useCollectionPoints } from '../../api/hooks';

interface AdvancedPointSelectorProps {
    open: boolean;
    onCancel: () => void;
    selectedIds: string[];
    onOk: (ids: string[]) => void;
    currentPointTypeFilter: string[];
}

// 采集点类型图标映射 (复用)
const POINT_TYPE_ICONS: Record<string, React.ReactNode> = {
    PORT: <AimOutlined />,
    ENTERPRISE: <BankOutlined />,
    MARKET: <ShopOutlined />,
    REGION: <GlobalOutlined />,
    STATION: <EnvironmentOutlined />,
};

const POINT_TYPE_LABELS: Record<string, string> = {
    PORT: '港口',
    ENTERPRISE: '企业',
    MARKET: '市场',
    REGION: '地域',
    STATION: '站台',
};

interface RecordType {
    key: string;
    title: string;
    description: string;
    type: string;
    regionName?: string;
    code?: string;
}

export const AdvancedPointSelector: React.FC<AdvancedPointSelectorProps> = ({
    open,
    onCancel,
    selectedIds,
    onOk,
    currentPointTypeFilter
}) => {
    const { token } = theme.useToken();
    const [targetKeys, setTargetKeys] = useState<string[]>(selectedIds);

    // 同步外部选中的ID
    React.useEffect(() => {
        if (open) {
            setTargetKeys(selectedIds);
        }
    }, [open, selectedIds]);

    // 获取所有采集点数据 (pageSize 设大一点以获取全部，或者分页获取)
    const { data: allPointsData } = useCollectionPoints(
        undefined,
        undefined,
        { enabled: open }
    );

    const dataSource = useMemo(() => {
        if (!allPointsData?.data) return [];

        return allPointsData.data.map(item => ({
            key: item.id,
            title: item.shortName || item.name,
            description: `${POINT_TYPE_LABELS[item.type]} · ${item.region?.name || item.regionCode || '-'}`,
            type: item.type,
            regionName: item.region?.name,
            code: item.code
        }));
    }, [allPointsData]);

    const filterOption = (inputValue: string, item: RecordType) => {
        if (!inputValue) return true;

        // 拼音/模糊搜索逻辑
        // 强制匹配首字符 (index 0)，实现 "首字母缩写" 搜索体验
        // 仅匹配采集点名称 (title)
        const titleMatch = PinyinMatch.match(item.title, inputValue);
        const matchSearch = Array.isArray(titleMatch) && titleMatch[0] === 0;

        // 类型过滤逻辑 (如果有选中的类型过滤器)
        const matchType = currentPointTypeFilter.length === 0 || currentPointTypeFilter.includes(item.type);

        return !!(matchSearch && matchType);
    };

    const handleChange = (newTargetKeys: string[], direction: TransferDirection, moveKeys: string[]) => {
        setTargetKeys(newTargetKeys);
    };

    const handleOk = () => {
        onOk(targetKeys);
        onCancel();
    };

    return (
        <Modal
            title={
                <Flex align="center" gap={8}>
                    <FilterOutlined style={{ color: token.colorPrimary }} />
                    <span>选择分析采集点</span>
                    <Tag>{dataSource.length} 个可用</Tag>
                </Flex>
            }
            open={open}
            onCancel={onCancel}
            onOk={handleOk}
            width={800}
            bodyStyle={{ padding: 0 }}
            centered
        >
            <div style={{ padding: 16 }}>
                <Transfer
                    dataSource={dataSource}
                    titles={['待选列表', '已选列表']}
                    targetKeys={targetKeys}
                    onChange={handleChange}
                    filterOption={filterOption}
                    showSearch
                    render={item => ({
                        label: (
                            <Flex align="center" justify="space-between" style={{ width: '100%' }}>
                                <Space>
                                    <span style={{ color: token.colorPrimary }}>{POINT_TYPE_ICONS[item.type]}</span>
                                    <span>{item.title}</span>
                                </Space>
                                <Tag bordered={false} style={{ fontSize: 10, margin: 0 }}>
                                    {item.regionName || POINT_TYPE_LABELS[item.type]}
                                </Tag>
                            </Flex>
                        ),
                        value: item.title,
                    })}
                    listStyle={{
                        width: '100%',
                        height: 400,
                    }}
                    pagination
                />
            </div>
            <Flex justify="space-between" align="center" style={{ padding: '0 24px 16px', color: token.colorTextSecondary, fontSize: 12 }}>
                <span>提示: 仅支持搜索采集点名称或首字母</span>
                <span>已选中 {targetKeys.length} 个采集点</span>
            </Flex>
        </Modal>
    );
};

import React, { useMemo } from 'react';
import { Table, Tag, Typography, Flex, Button, Space, Tooltip, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    DownloadOutlined,
    AimOutlined,
    BankOutlined,
    ShopOutlined,
    GlobalOutlined,
    EnvironmentOutlined,
} from '@ant-design/icons';
import { usePriceData } from '../../api/hooks';
import type { PriceDataResponse } from '@packages/types';

const { Text } = Typography;

// 采集点类型图标
const POINT_TYPE_ICONS: Record<string, React.ReactNode> = {
    PORT: <AimOutlined style={{ color: '#1890ff' }} />,
    ENTERPRISE: <BankOutlined style={{ color: '#52c41a' }} />,
    MARKET: <ShopOutlined style={{ color: '#faad14' }} />,
    REGION: <GlobalOutlined style={{ color: '#722ed1' }} />,
    STATION: <EnvironmentOutlined style={{ color: '#13c2c2' }} />,
};

const PRICE_SUB_TYPE_LABELS: Record<string, string> = {
    LISTED: '挂牌价',
    TRANSACTION: '成交价',
    ARRIVAL: '到港价',
    FOB: '平舱价',
    STATION_ORIGIN: '产区站台',
    STATION_DEST: '销区站台',
    PURCHASE: '收购价',
    WHOLESALE: '批发价',
    OTHER: '其他',
};

interface DataGridProps {
    commodity: string;
    days: number;
    selectedPointIds: string[];
    selectedProvince?: string;
}

export const DataGrid: React.FC<DataGridProps> = ({
    commodity,
    days,
    selectedPointIds,
    selectedProvince,
}) => {
    const { token } = theme.useToken();

    // 计算日期范围
    const startDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d;
    }, [days]);

    // 获取价格数据
    const { data: priceDataResult, isLoading } = usePriceData({
        commodity,
        startDate,
        pageSize: 200,
    });

    const priceDataList = priceDataResult?.data || [];

    // 过滤数据
    const filteredData = useMemo(() => {
        let filtered = priceDataList;

        // 按选中的采集点过滤
        if (selectedPointIds.length > 0) {
            // 由于采集点ID可能没有直接关联，先按location匹配
            // 后续可以改进为按collectionPointId过滤
            filtered = filtered;
        }

        return filtered;
    }, [priceDataList, selectedPointIds]);

    // 导出 CSV
    const handleExport = () => {
        const headers = '日期,地点,品种,价格类型,价格(元/吨),日涨跌,水分(%)\n';
        const csvContent = filteredData
            .map(
                (item) =>
                    `${new Date(item.effectiveDate).toLocaleDateString()},${item.location},${item.commodity},${PRICE_SUB_TYPE_LABELS[item.subType] || item.subType},${item.price},${item.dayChange || ''},${item.moisture || ''}`,
            )
            .join('\n');
        const blob = new Blob(['\uFEFF' + headers + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `价格数据_${commodity}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const columns: ColumnsType<PriceDataResponse> = [
        {
            title: '日期',
            dataIndex: 'effectiveDate',
            key: 'date',
            width: 100,
            render: (date: string) => {
                const d = new Date(date);
                return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
            },
            sorter: (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
        },
        {
            title: '采集点',
            dataIndex: 'location',
            key: 'location',
            width: 150,
            render: (location: string, record: any) => {
                const pointType = record.collectionPoint?.type || record.sourceType;
                return (
                    <Flex align="center" gap={6}>
                        {POINT_TYPE_ICONS[pointType] || POINT_TYPE_ICONS['REGION']}
                        <Text ellipsis style={{ maxWidth: 120 }}>
                            {location}
                        </Text>
                    </Flex>
                );
            },
            filters: [...new Set(filteredData.map((d) => d.location))].map((loc) => ({
                text: loc,
                value: loc,
            })),
            onFilter: (value, record) => record.location === value,
        },
        {
            title: '区域',
            dataIndex: 'province',
            key: 'province',
            width: 80,
            render: (province: string | null, record: PriceDataResponse) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {province || record.city || '-'}
                </Text>
            ),
        },
        {
            title: '品种',
            dataIndex: 'commodity',
            key: 'commodity',
            width: 80,
            render: (commodity: string) => <Tag>{commodity}</Tag>,
        },
        {
            title: '价格类型',
            dataIndex: 'subType',
            key: 'subType',
            width: 100,
            render: (subType: string) => (
                <Tag color="blue">{PRICE_SUB_TYPE_LABELS[subType] || subType}</Tag>
            ),
            filters: Object.entries(PRICE_SUB_TYPE_LABELS).map(([key, label]) => ({
                text: label,
                value: key,
            })),
            onFilter: (value, record) => record.subType === value,
        },
        {
            title: '价格',
            dataIndex: 'price',
            key: 'price',
            width: 100,
            align: 'right',
            render: (price: number) => (
                <Text strong style={{ fontFamily: 'monospace' }}>
                    {price?.toLocaleString()}
                </Text>
            ),
            sorter: (a, b) => a.price - b.price,
        },
        {
            title: '日涨跌',
            dataIndex: 'dayChange',
            key: 'dayChange',
            width: 80,
            align: 'right',
            render: (change: number | null) => {
                if (change === null || change === undefined) return '-';
                const color = change > 0 ? token.colorError : change < 0 ? token.colorSuccess : token.colorTextSecondary;
                return (
                    <Text style={{ color, fontFamily: 'monospace' }}>
                        {change > 0 ? '+' : ''}{change}
                    </Text>
                );
            },
            sorter: (a, b) => (a.dayChange || 0) - (b.dayChange || 0),
        },
        {
            title: '水分',
            dataIndex: 'moisture',
            key: 'moisture',
            width: 70,
            align: 'right',
            render: (moisture: number | null) => (moisture ? `${moisture}%` : '-'),
        },
        {
            title: '备注',
            dataIndex: 'note',
            key: 'note',
            width: 120,
            ellipsis: true,
            render: (note: string | null) => (
                <Tooltip title={note}>
                    <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                        {note || '-'}
                    </Text>
                </Tooltip>
            ),
        },
    ];

    return (
        <div>
            <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
                <Text type="secondary">
                    共 {filteredData.length} 条记录
                </Text>
                <Button icon={<DownloadOutlined />} onClick={handleExport} size="small">
                    导出 CSV
                </Button>
            </Flex>
            <Table
                dataSource={filteredData}
                columns={columns}
                rowKey="id"
                size="small"
                loading={isLoading}
                pagination={{
                    pageSize: 15,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total) => `共 ${total} 条`,
                }}
                scroll={{ x: 900 }}
            />
        </div>
    );
};

export default DataGrid;

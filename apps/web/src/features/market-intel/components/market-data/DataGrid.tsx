import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { Table, Tag, Typography, Flex, Button, Space, Tooltip, theme, Empty } from 'antd';
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
import type { PriceDataResponse, PriceSubType } from '@packages/types';

const { Text } = Typography;

// 采集点类型图标
const POINT_TYPE_ICONS: Record<string, React.ReactNode> = {
    PORT: <AimOutlined style={{ color: '#1890ff' }} />,
    ENTERPRISE: <BankOutlined style={{ color: '#52c41a' }} />,
    MARKET: <ShopOutlined style={{ color: '#faad14' }} />,
    REGION: <GlobalOutlined style={{ color: '#722ed1' }} />,
    STATION: <EnvironmentOutlined style={{ color: '#13c2c2' }} />,
};

const POINT_TYPE_LABELS: Record<string, string> = {
    PORT: '港口',
    ENTERPRISE: '企业',
    MARKET: '市场',
    REGION: '地域',
    STATION: '站台',
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
    startDate?: Date;
    endDate?: Date;
    selectedPointIds: string[];
    selectedProvince?: string;
    pointTypeFilter?: string[];
    subTypes?: PriceSubType[];
}

export const DataGrid: React.FC<DataGridProps> = ({
    commodity,
    startDate,
    endDate,
    selectedPointIds,
    selectedProvince,
    pointTypeFilter,
    subTypes,
}) => {
    const { token } = theme.useToken();

    // 获取价格数据
    const { data: priceDataResult, isLoading } = usePriceData({
        commodity,
        startDate,
        endDate,
        regionCode: selectedProvince, // 服务端区域过滤
        collectionPointIds: selectedPointIds,
        pointTypes: pointTypeFilter,
        subTypes: subTypes as PriceSubType[],
        pageSize: 1000, // 扩大以支持足够的本地过滤
    }, {
        enabled: selectedPointIds.length > 0,
    });

    const priceDataList = priceDataResult?.data || [];

    const filteredData = priceDataList;

    const quality = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return null;
        const dateSet = new Set<string>();
        let latestDate: Date | null = null;

        filteredData.forEach((item) => {
            const date = new Date(item.effectiveDate);
            dateSet.add(dayjs(date).format('YYYY-MM-DD'));
            if (!latestDate || date > latestDate) latestDate = date;
        });

        let missingDays: number | null = null;
        if (startDate && endDate) {
            const expectedDays =
                dayjs(endDate).startOf('day').diff(dayjs(startDate).startOf('day'), 'day') + 1;
            missingDays = Math.max(0, expectedDays - dateSet.size);
        }

        return {
            totalSamples: filteredData.length,
            latestDate,
            missingDays,
        };
    }, [filteredData, startDate, endDate]);

    const csvEscape = (value: unknown) => {
        const text = value === null || value === undefined ? '' : String(value);
        if (text.includes('"') || text.includes(',') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    // 导出 CSV
    const handleExport = () => {
        const headers = [
            '日期',
            '地点',
            '采集点类型',
            '品种',
            '价格类型',
            '价格(元/吨)',
            '日涨跌',
            '水分(%)',
            '省份',
            '城市',
            '地理层级',
            '行政区划',
            '来源类型',
            '备注',
        ].join(',') + '\n';

        const csvContent = filteredData
            .map((item) => {
                const pointType =
                    item.collectionPoint?.type ||
                    (item.sourceType === 'REGIONAL' ? 'REGION' : item.sourceType);
                return [
                    new Date(item.effectiveDate).toLocaleDateString(),
                    item.location,
                    POINT_TYPE_LABELS[pointType] || pointType || '-',
                    item.commodity,
                    PRICE_SUB_TYPE_LABELS[item.subType] || item.subType,
                    item.price,
                    item.dayChange ?? '',
                    item.moisture ?? '',
                    item.province ?? '',
                    item.city ?? '',
                    item.geoLevel ?? '',
                    item.regionCode ?? '',
                    item.sourceType ?? '',
                    item.note ?? '',
                ].map(csvEscape).join(',');
            })
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
                const pointType =
                    record.collectionPoint?.type ||
                    (record.sourceType === 'REGIONAL' ? 'REGION' : record.sourceType);
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

    // 如果未选择采集点，显示空状态
    if (selectedPointIds.length === 0) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <Space direction="vertical" align="center">
                            <Text type="secondary">请先在左侧选择采集点以查看数据明细</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                (数据量较大，请使用筛选器精准定位)
                            </Text>
                        </Space>
                    }
                />
            </Flex>
        );
    }

    return (
        <div>
            <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                <Space size={8}>
                    <Text type="secondary">共 {filteredData.length} 条记录</Text>
                    {quality && (
                        <Space size={6}>
                            <Tag color="blue">样本 {quality.totalSamples}</Tag>
                            {quality.latestDate && (
                                <Tag color="default">
                                    最后更新 {dayjs(quality.latestDate).format('YYYY-MM-DD')}
                                </Tag>
                            )}
                            {quality.missingDays !== null && (
                                <Tag color={quality.missingDays > 0 ? 'orange' : 'green'}>
                                    缺失 {quality.missingDays} 天
                                </Tag>
                            )}
                        </Space>
                    )}
                </Space>
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

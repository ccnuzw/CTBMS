import React from 'react';
import { Card, Flex, Statistic, Divider, Tooltip, theme } from 'antd';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useUniversalSearchViewModel } from './useUniversalSearchViewModel';

interface Props {
    viewModel: ReturnType<typeof useUniversalSearchViewModel>;
}

export const UniversalSearchStats: React.FC<Props> = ({ viewModel }) => {
    const { token } = theme.useToken();
    const { state: { searchStats } } = viewModel;

    return (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
            <Flex wrap="wrap" gap={24} align="center">
                <Statistic title="总结果" value={searchStats.totalResults} valueStyle={{ fontSize: 20, fontWeight: 600 }} />
                <Divider type="vertical" style={{ height: 40 }} />
                <Statistic title="价格数据" value={searchStats.priceCount} valueStyle={{ fontSize: 18, color: token.colorSuccess }} />
                <Statistic title="市场情报" value={searchStats.intelCount} valueStyle={{ fontSize: 18, color: token.colorPrimary }} />
                <Statistic title="研究文档" value={searchStats.docCount} valueStyle={{ fontSize: 18, color: token.colorWarning }} />
                <Divider type="vertical" style={{ height: 40 }} />
                <Tooltip title="利好情报数">
                    <Statistic title="利好" value={searchStats.positiveCount} prefix={<RiseOutlined />} valueStyle={{ fontSize: 16, color: token.colorSuccess }} />
                </Tooltip>
                <Tooltip title="利空情报数">
                    <Statistic title="利空" value={searchStats.negativeCount} prefix={<FallOutlined />} valueStyle={{ fontSize: 16, color: token.colorError }} />
                </Tooltip>
                {searchStats.priceCount > 0 && (
                    <>
                        <Divider type="vertical" style={{ height: 40 }} />
                        <Statistic title="价格区间" value={`${searchStats.priceMin} - ${searchStats.priceMax}`} valueStyle={{ fontSize: 14 }} suffix="元/吨" />
                    </>
                )}
            </Flex>
        </Card>
    );
};

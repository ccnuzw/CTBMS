import React from 'react';
import { Card } from 'antd';
import { Line } from '@ant-design/plots';

interface TrendData {
    date: string;
    count: number;
}

interface ReportTrendChartProps {
    data: TrendData[];
    loading?: boolean;
}

export const ReportTrendChart: React.FC<ReportTrendChartProps> = ({ data, loading }) => {
    const config = {
        data,
        xField: 'date',
        yField: 'count',
        point: {
            size: 5,
            shape: 'circle',
        },
        label: {
            style: {
                fill: '#aaa',
            },
        },
        smooth: true,
        animation: {
            appear: {
                animation: 'path-in',
                duration: 1000,
            },
        },
    };

    return (
        <Card title="研报数量趋势" bordered={false} loading={loading}>
            <Line {...config} />
        </Card>
    );
};

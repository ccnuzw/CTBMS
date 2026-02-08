import React from 'react';
import { Card, Segmented } from 'antd';
import { Area } from '@ant-design/plots';

interface TrendData {
    date: string;
    count: number;
}

interface ReportTrendChartProps {
    data: TrendData[];
    loading?: boolean;
    days: number;
    onDaysChange: (days: number) => void;
}

export const ReportTrendChart: React.FC<ReportTrendChartProps> = ({ data, loading, days, onDaysChange }) => {
    const config = {
        data,
        xField: 'date',
        yField: 'count',
        smooth: true,
        areaStyle: () => {
            return {
                fill: 'l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff',
            };
        },
        point: {
            size: 4,
            shape: 'disc',
            style: {
                fill: 'white',
                stroke: '#5B8FF9',
                lineWidth: 2,
            },
        },
        tooltip: {
            showMarkers: false,
        },
        state: {
            active: {
                style: {
                    shadowBlur: 4,
                    stroke: '#000',
                    fill: 'red',
                },
            },
        },
        interactions: [
            {
                type: 'marker-active',
            },
        ],
    };

    return (
        <Card
            title="研报数量趋势"
            bordered={false}
            loading={loading}
            extra={
                <Segmented
                    value={days}
                    options={[
                        { label: '近7天', value: 7 },
                        { label: '近30天', value: 30 },
                        { label: '近3个月', value: 90 },
                    ]}
                    onChange={(val) => onDaysChange(Number(val))}
                />
            }
        >
            <div style={{ height: 300 }}>
                <Area {...config} />
            </div>
        </Card>
    );
};

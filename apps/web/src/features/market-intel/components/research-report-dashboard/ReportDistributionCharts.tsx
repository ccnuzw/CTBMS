import React from 'react';
import { Card, Row, Col } from 'antd';
import { Pie, Column } from '@ant-design/plots';

interface DistributionData {
    type: string;
    value: number;
}

interface SourceData {
    source: string;
    count: number;
}

interface ReportDistributionChartsProps {
    typeData: DistributionData[];
    sourceData: SourceData[];
    loading?: boolean;
}

export const ReportDistributionCharts: React.FC<ReportDistributionChartsProps> = ({
    typeData,
    sourceData,
    loading
}) => {
    const pieConfig = {
        data: typeData,
        angleField: 'value',
        colorField: 'type',
        radius: 0.8,
        innerRadius: 0.6, // Donut chart
        label: {
            text: 'value',
            style: {
                fontWeight: 'bold',
            },
        },
        legend: {
            color: {
                title: false,
                position: 'right',
                rowPadding: 5,
            },
        },
        interactions: [
            {
                type: 'element-active',
            },
        ],
    };

    const columnConfig = {
        data: sourceData,
        xField: 'source',
        yField: 'count',
        label: {
            text: (originData: SourceData) => {
                return `${originData.count}`;
            },
            position: 'top' as const,
            style: {
                fill: '#000000',
                opacity: 0.6,
            },
        },
        xAxis: {
            label: {
                autoRotate: false,
                autoHide: true,
            },
        },
        style: {
            fill: 'l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff',
        },
        meta: {
            source: {
                alias: '来源',
            },
            count: {
                alias: '数量',
            },
        },
    };

    return (
        <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
                <Card title="研报类型分布" bordered={false} loading={loading}>
                    <div style={{ height: 300 }}>
                        <Pie {...pieConfig} />
                    </div>
                </Card>
            </Col>
            <Col xs={24} lg={12}>
                <Card title="来源机构排行" bordered={false} loading={loading}>
                    <div style={{ height: 300 }}>
                        <Column {...columnConfig} />
                    </div>
                </Card>
            </Col>
        </Row>
    );
};

import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { Card, Col, Empty, Flex, Row, Skeleton, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import type { PriceReviewScope, PriceSourceScope, PriceSubType } from '@packages/types';
import { usePriceContinuityHealth } from '../../api/hooks';

const { Text } = Typography;

interface ContinuityHealthPanelProps {
    commodity: string;
    startDate?: Date;
    endDate?: Date;
    selectedRegionCode?: string;
    pointTypes?: string[];
    subTypes?: PriceSubType[];
    selectedPointIds?: string[];
    reviewScope?: PriceReviewScope;
    sourceScope?: PriceSourceScope;
}

type HealthRow = {
    pointId: string;
    pointName: string;
    pointType: string;
    regionLabel?: string | null;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D';
    coverageRate: number;
    anomalyRate: number;
    lateRate: number;
    latestDate: Date | null;
    missingDays: number;
};

const GRADE_COLOR: Record<'A' | 'B' | 'C' | 'D', string> = {
    A: 'green',
    B: 'blue',
    C: 'orange',
    D: 'red',
};

export const ContinuityHealthPanel: React.FC<ContinuityHealthPanelProps> = ({
    commodity,
    startDate,
    endDate,
    selectedRegionCode,
    pointTypes,
    subTypes,
    selectedPointIds,
    reviewScope,
    sourceScope,
}) => {
    const { token } = theme.useToken();
    const { data, isLoading } = usePriceContinuityHealth(
        {
            commodity,
            startDate,
            endDate,
            regionCode: selectedRegionCode,
            pointTypes,
            subTypes,
            collectionPointIds: selectedPointIds,
            reviewScope,
            sourceScope,
        },
        { enabled: !!commodity && (selectedPointIds?.length || 0) > 0 },
    );

    const topRisks = useMemo(() => (data?.points || []).slice(0, 6), [data]);

    const columns: ColumnsType<HealthRow> = [
        {
            title: '采集点',
            dataIndex: 'pointName',
            key: 'pointName',
            width: 180,
            render: (value: string, record) => (
                <Flex vertical>
                    <Text>{value}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.regionLabel || '-'}
                    </Text>
                </Flex>
            ),
        },
        {
            title: '健康度',
            dataIndex: 'score',
            key: 'score',
            width: 120,
            sorter: (a, b) => a.score - b.score,
            render: (value: number, record) => (
                <SpaceScore score={value} grade={record.grade} />
            ),
        },
        {
            title: '覆盖率',
            dataIndex: 'coverageRate',
            key: 'coverageRate',
            width: 100,
            render: (value: number) => `${value.toFixed(1)}%`,
        },
        {
            title: '异常率',
            dataIndex: 'anomalyRate',
            key: 'anomalyRate',
            width: 100,
            render: (value: number) => `${value.toFixed(1)}%`,
        },
        {
            title: '延迟率',
            dataIndex: 'lateRate',
            key: 'lateRate',
            width: 100,
            render: (value: number) => `${value.toFixed(1)}%`,
        },
        {
            title: '最近更新',
            dataIndex: 'latestDate',
            key: 'latestDate',
            width: 120,
            render: (value: Date | null) => (value ? dayjs(value).format('YYYY-MM-DD') : '-'),
        },
    ];

    if ((selectedPointIds?.length || 0) === 0) {
        return null;
    }

    return (
        <Card
            title={
                <Flex align="center" gap={8}>
                    <SafetyCertificateOutlined style={{ color: token.colorPrimary }} />
                    <span>连续性健康度</span>
                </Flex>
            }
            bodyStyle={{ padding: 16 }}
        >
            {isLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} />
            ) : !data ? (
                <Empty description="暂无健康度数据" />
            ) : (
                <Flex vertical gap={16}>
                    <Row gutter={12}>
                        <Col span={6}>
                            <Statistic title="总体健康度" value={data.summary.overallScore} suffix="/100" />
                        </Col>
                        <Col span={6}>
                            <Statistic title="平均覆盖率" value={data.summary.coverageRate} suffix="%" />
                        </Col>
                        <Col span={6}>
                            <Statistic title="平均异常率" value={data.summary.anomalyRate} suffix="%" />
                        </Col>
                        <Col span={6}>
                            <Statistic title="平均延迟率" value={data.summary.lateRate} suffix="%" />
                        </Col>
                    </Row>
                    <Flex gap={8} wrap="wrap">
                        <Tag color="blue">采集点 {data.summary.pointCount}</Tag>
                        <Tag color="green">健康点位 {data.summary.healthyPoints}</Tag>
                        <Tag color="red">风险点位 {data.summary.riskPoints}</Tag>
                        <Tag color="default">统计窗口 {data.summary.expectedDays} 天</Tag>
                    </Flex>
                    <Table<HealthRow>
                        rowKey="pointId"
                        size="small"
                        dataSource={topRisks}
                        columns={columns}
                        pagination={false}
                        locale={{ emptyText: '暂无点位风险数据' }}
                        scroll={{ x: 760 }}
                    />
                </Flex>
            )}
        </Card>
    );
};

const SpaceScore: React.FC<{ score: number; grade: 'A' | 'B' | 'C' | 'D' }> = ({ score, grade }) => {
    return (
        <Flex align="center" gap={8}>
            <Text strong>{score}</Text>
            <Tag color={GRADE_COLOR[grade]} style={{ margin: 0 }}>
                {grade}
            </Tag>
        </Flex>
    );
};

export default ContinuityHealthPanel;

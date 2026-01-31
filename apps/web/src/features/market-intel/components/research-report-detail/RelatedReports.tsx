
import React, { useMemo } from 'react';
import { Card, List, Empty, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useResearchReports } from '../../api/hooks';
import { REPORT_TYPE_LABELS, ReviewStatus, type ResearchReportResponse } from '@packages/types';

interface RelatedReportsProps {
    currentReportId: string;
    report?: ResearchReportResponse | null;
}

export const RelatedReports: React.FC<RelatedReportsProps> = ({ currentReportId, report }) => {
    const navigate = useNavigate();
    const { data, isLoading } = useResearchReports({
        pageSize: 50,
        reviewStatus: ReviewStatus.APPROVED,
    });

    const relatedReports = useMemo(() => {
        const candidates = data?.data || [];
        const commoditySet = new Set(report?.commodities || []);
        const regionSet = new Set(report?.regions || []);

        const scored = candidates
            .filter((item) => item.id !== currentReportId)
            .map((item) => {
                const commodityScore = item.commodities?.filter((c) => commoditySet.has(c)).length || 0;
                const regionScore = item.regions?.filter((r) => regionSet.has(r)).length || 0;
                const typeScore = report?.reportType && item.reportType === report.reportType ? 1 : 0;
                return {
                    item,
                    score: commodityScore * 3 + regionScore * 2 + typeScore,
                };
            })
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.item);

        const top = scored.slice(0, 6);
        return top.length > 0 ? top : candidates.filter((item) => item.id !== currentReportId).slice(0, 6);
    }, [data, currentReportId, report?.commodities, report?.regions, report?.reportType]);

    return (
        <Card title="相关研报" bordered={false} className="shadow-sm">
            <List
                size="small"
                loading={isLoading}
                dataSource={relatedReports}
                renderItem={(item: ResearchReportResponse) => (
                    <List.Item>
                        <List.Item.Meta
                            title={<a onClick={() => navigate(`/intel/knowledge/reports/${item.id}`)}>{item.title}</a>}
                            description={
                                <Space size={8}>
                                    <Typography.Text type="secondary">
                                        {dayjs(item.publishDate || item.createdAt).format('YYYY-MM-DD')}
                                    </Typography.Text>
                                    <Tag color="blue">{REPORT_TYPE_LABELS[item.reportType] || item.reportType}</Tag>
                                </Space>
                            }
                        />
                    </List.Item>
                )}
                locale={{ emptyText: <Empty description="暂无相关研报" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
        </Card>
    );
};

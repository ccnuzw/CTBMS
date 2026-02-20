
import React, { useMemo } from 'react';
import { Card, List, Empty, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useKnowledgeReports, KnowledgeItem } from '../../api/knowledge-hooks';
import { REPORT_TYPE_LABELS } from '@packages/types';
import { useDictionaries } from '@/hooks/useDictionaries';

interface RelatedReportsProps {
    currentReportId: string;
    report?: KnowledgeItem | null;
}

export const RelatedReports: React.FC<RelatedReportsProps> = ({ currentReportId, report }) => {
    const navigate = useNavigate();
    const { data: dictionaries } = useDictionaries(['REPORT_TYPE']);
    const { data, isLoading } = useKnowledgeReports({
        pageSize: 50,
        status: 'PUBLISHED',
    });

    const relatedReports = useMemo(() => {
        const candidates = data?.data || [];
        const commoditySet = new Set(report?.commodities || []);
        const regionSet = new Set(report?.region || []);

        const scored = candidates
            .filter((item) => item.id !== currentReportId)
            .map((item) => {
                const commodityScore = item.commodities?.filter((c) => commoditySet.has(c)).length || 0;
                const regionScore = item.region?.filter((r) => regionSet.has(r)).length || 0;

                const currentReportType = report?.analysis?.reportType || report?.type;
                const itemReportType = item.analysis?.reportType || item.type;
                const typeScore = currentReportType && itemReportType === currentReportType ? 1 : 0;

                return {
                    item,
                    score: commodityScore * 3 + regionScore * 2 + typeScore,
                };
            })
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.item);

        const top = scored.slice(0, 6);
        return top.length > 0 ? top : candidates.filter((item) => item.id !== currentReportId).slice(0, 6);
    }, [data, currentReportId, report?.commodities, report?.region, report?.analysis?.reportType, report?.type]);

    const reportTypeLabels: Record<string, string> = useMemo(() => {
        const items = dictionaries?.REPORT_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return REPORT_TYPE_LABELS as Record<string, string>;
        return items.reduce<Record<string, string>>((acc, item) => {
            acc[item.code] = item.label;
            return acc;
        }, {});
    }, [dictionaries]);

    const reportTypeColors = useMemo(() => {
        const items = dictionaries?.REPORT_TYPE?.filter((item) => item.isActive) || [];
        const fallbackColors: Record<string, string> = {
            POLICY: 'volcano',
            MARKET: 'blue',
            RESEARCH: 'purple',
            INDUSTRY: 'cyan',
        };
        if (!items.length) return fallbackColors;
        return items.reduce<Record<string, string>>((acc, item) => {
            const color = (item.meta as { color?: string } | null)?.color || fallbackColors[item.code] || 'blue';
            acc[item.code] = color;
            return acc;
        }, {});
    }, [dictionaries]);

    return (
        <Card title="相关研报" bordered={false} className="shadow-sm">
            <List
                size="small"
                loading={isLoading}
                dataSource={relatedReports}
                renderItem={(item: KnowledgeItem) => (
                    <List.Item>
                        <List.Item.Meta
                            title={<a onClick={() => navigate(`/intel/knowledge/reports/${item.id}`)}>{item.title}</a>}
                            description={
                                <Space size={8}>
                                    <Typography.Text type="secondary">
                                        {dayjs(item.publishAt || item.createdAt).format('YYYY-MM-DD')}
                                    </Typography.Text>
                                    <Tag color={reportTypeColors[item.analysis?.reportType || item.type] || 'blue'}>
                                        {reportTypeLabels[item.analysis?.reportType || item.type] || item.analysis?.reportType || item.type}
                                    </Tag>
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

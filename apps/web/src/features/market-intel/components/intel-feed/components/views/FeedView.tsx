import React, { useMemo } from 'react';
import { Space, Empty, Spin, Flex, theme } from 'antd';
import { IntelFilterState, IntelItem } from '../../types';
import { DailyReportCard } from '../cards/DailyReportCard';
import { ResearchReportCard } from '../cards/ResearchReportCard';
import { PolicyDocCard } from '../cards/PolicyDocCard';
import { SmartBriefingCard } from '../SmartBriefingCard';
import { ContentType } from '../../../../types';

interface FeedViewProps {
    items: IntelItem[];
    loading: boolean;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
    filterState?: IntelFilterState;
}

export const FeedView: React.FC<FeedViewProps> = ({
    items,
    loading,
    onIntelSelect,
    selectedIntelId,
    filterState,
}) => {
    const { token } = theme.useToken();

    if (loading) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Spin size="large" />
            </Flex>
        );
    }

    if (!items || items.length === 0) {
        return <Empty description="暂无符合条件的情报" style={{ marginTop: 60 }} />;
    }

    // 渲染情报卡片
    const renderCard = (item: IntelItem) => {
        const isSelected = selectedIntelId === item.id;
        const cardStyle = {
            marginBottom: 16,
            cursor: 'pointer',
            boxShadow: isSelected ? `0 0 0 2px ${token.colorPrimaryBg}` : undefined,
        };

        let cardNode: React.ReactNode;
        switch (item.contentType) {
            case ContentType.DAILY_REPORT:
                cardNode = (
                    <DailyReportCard
                        intel={item}
                        style={cardStyle}
                        onClick={() => onIntelSelect(item)}
                    />
                );
                break;
            case ContentType.RESEARCH_REPORT:
                cardNode = (
                    <ResearchReportCard
                        intel={item}
                        style={cardStyle}
                        onClick={() => onIntelSelect(item)}
                    />
                );
                break;
            case ContentType.POLICY_DOC:
                cardNode = (
                    <PolicyDocCard
                        intel={item}
                        style={cardStyle}
                        onClick={() => onIntelSelect(item)}
                    />
                );
                break;
            default:
                // 默认为日报卡片
                cardNode = (
                    <DailyReportCard
                        intel={item}
                        style={cardStyle}
                        onClick={() => onIntelSelect(item)}
                    />
                );
        }

        return (
            <div key={item.id} data-intel-id={item.intelId || item.id}>
                {cardNode}
            </div>
        );
    };

    return (
        <div style={{ maxWidth: 900 }}>
            {filterState && (
                <SmartBriefingCard filterState={filterState} />
            )}
            {items.map(renderCard)}
        </div>
    );
};

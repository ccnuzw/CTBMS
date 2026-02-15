import React, { useMemo } from 'react';
import { Space, Empty, Spin, Flex, theme } from 'antd';
import { IntelFilterState, IntelItem } from '../../types';
import { DailyReportCard } from '../cards/DailyReportCard';
import { ResearchReportCard } from '../cards/ResearchReportCard';
import { MarketInsightCard } from '../cards/MarketInsightCard';
import { PriceAlertCard } from '../cards/PriceAlertCard';
import { SmartBriefingCard } from '../SmartBriefingCard';
import { ContentType } from '../../../../types';

// 判断是否为价格异动（价格变动超过阈值）
const isPriceAlert = (item: IntelItem): boolean => {
    if (!item.pricePoints || item.pricePoints.length === 0) return false;

    // 判断条件：有多个价格点且存在较大变动
    const significantChanges = item.pricePoints.filter(
        p => p.change !== null && Math.abs(p.change) >= 10
    );

    // 如果超过30%的价格点有显著变动，认为是价格异动
    return significantChanges.length >= Math.max(1, item.pricePoints.length * 0.3);
};

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

        // 新增：根据数据特征选择卡片类型
        // 1. 价格异动卡片：有价格点且存在显著变动
        if (item.pricePoints && item.pricePoints.length > 0 && isPriceAlert(item)) {
            cardNode = (
                <PriceAlertCard
                    intel={item}
                    style={cardStyle}
                    onClick={() => onIntelSelect(item)}
                />
            );
        }
        // 2. 市场洞察卡片：有洞察但无价格数据
        else if (item.insights && item.insights.length > 0 && (!item.pricePoints || item.pricePoints.length === 0)) {
            cardNode = (
                <MarketInsightCard
                    intel={item}
                    style={cardStyle}
                    onClick={() => onIntelSelect(item)}
                />
            );
        }
        // 3. 按内容类型选择卡片
        else {
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

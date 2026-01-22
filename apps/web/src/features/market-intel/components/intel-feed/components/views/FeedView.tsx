import React, { useMemo } from 'react';
import { Space, Empty, Spin, Flex, theme } from 'antd';
import { IntelFilterState, IntelItem } from '../../types';
import { DailyReportCard } from '../cards/DailyReportCard';
import { ResearchReportCard } from '../cards/ResearchReportCard';
import { PolicyDocCard } from '../cards/PolicyDocCard';
import { ContentType } from '../../../../types';

interface FeedViewProps {
    filterState: IntelFilterState;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
}

// 模拟数据
const MOCK_INTEL_ITEMS: IntelItem[] = [
    {
        id: '1',
        type: 'intel',
        contentType: ContentType.DAILY_REPORT,
        sourceType: 'FIRST_LINE' as any,
        category: 'B_SEMI_STRUCTURED' as any,
        title: '锦州港玉米价格异动',
        summary: '锦州港玉米收购价上涨20元/吨，达到2350元/吨，较昨日上涨0.86%。',
        rawContent: '今日锦州港玉米挂牌价格2350元/吨，较昨日上涨20元。水分14%，容重720g/L。到港车辆明显减少，预计短期内价格将继续上行。',
        effectiveTime: new Date(),
        createdAt: new Date(),
        location: '锦州港',
        region: ['辽宁省', '锦州市'],
        confidence: 92,
        qualityScore: 85,
        status: 'confirmed',
        events: [
            { type: '价格上涨', commodity: '玉米', change: 20 },
        ],
        insights: [
            { title: '短期看涨', content: '预计东北港口价格继续上行' },
        ],
    },
    {
        id: '2',
        type: 'intel',
        contentType: ContentType.RESEARCH_REPORT,
        sourceType: 'RESEARCH_INST' as any,
        category: 'C_DOCUMENT' as any,
        title: '2024年Q1玉米市场回顾与展望',
        summary: '本报告对2024年第一季度玉米市场进行了全面分析，包括供需格局、价格走势及未来展望。',
        rawContent: '一、市场回顾...',
        effectiveTime: new Date(),
        createdAt: new Date(),
        location: 'XX期货研究院',
        confidence: 88,
        qualityScore: 90,
        status: 'confirmed',
    },
    {
        id: '3',
        type: 'intel',
        contentType: ContentType.POLICY_DOC,
        sourceType: 'OFFICIAL_GOV' as any,
        category: 'C_DOCUMENT' as any,
        title: '关于加强粮食市场监管的通知',
        summary: '国家粮食和物资储备局发布通知，要求加强粮食收购环节监管。',
        rawContent: '各省、自治区、直辖市粮食和物资储备局...',
        effectiveTime: new Date(),
        createdAt: new Date(Date.now() - 86400000),
        location: '国家粮食和物资储备局',
        confidence: 100,
        qualityScore: 95,
        status: 'confirmed',
    },
    {
        id: '4',
        type: 'intel',
        contentType: ContentType.DAILY_REPORT,
        sourceType: 'FIRST_LINE' as any,
        category: 'B_SEMI_STRUCTURED' as any,
        title: '大连港玉米到港量下降',
        summary: '大连港今日玉米到港车辆较昨日减少15%，库存压力有所缓解。',
        rawContent: '大连港今日玉米挂牌价2330元/吨，到港车辆82车，较昨日减少12车...',
        effectiveTime: new Date(),
        createdAt: new Date(Date.now() - 3600000),
        location: '大连港',
        region: ['辽宁省', '大连市'],
        confidence: 89,
        qualityScore: 80,
        status: 'pending',
    },
    {
        id: '5',
        type: 'intel',
        contentType: ContentType.DAILY_REPORT,
        sourceType: 'FIRST_LINE' as any,
        category: 'B_SEMI_STRUCTURED' as any,
        title: '中储粮锦州库开始轮换收购',
        summary: '中储粮锦州直属库今日开始新一轮玉米轮换收购，挂牌价2320元/吨。',
        rawContent: '中储粮锦州直属库公告：自即日起开始2024年度玉米轮换收购...',
        effectiveTime: new Date(),
        createdAt: new Date(Date.now() - 7200000),
        location: '中储粮锦州库',
        region: ['辽宁省', '锦州市'],
        collectionPointName: '中储粮',
        confidence: 95,
        qualityScore: 88,
        status: 'confirmed',
    },
];

export const FeedView: React.FC<FeedViewProps> = ({
    filterState,
    onIntelSelect,
    selectedIntelId,
}) => {
    const { token } = theme.useToken();
    const [loading, setLoading] = React.useState(false);

    // 根据筛选条件过滤数据
    const filteredItems = useMemo(() => {
        return MOCK_INTEL_ITEMS.filter(item => {
            // 内容类型过滤
            if (filterState.contentTypes.length > 0 && !filterState.contentTypes.includes(item.contentType)) {
                return false;
            }
            // 信源类型过滤
            if (filterState.sourceTypes.length > 0 && !filterState.sourceTypes.includes(item.sourceType)) {
                return false;
            }
            // 状态过滤
            if (filterState.status.length > 0 && !filterState.status.includes(item.status)) {
                return false;
            }
            // 可信度过滤
            if (item.confidence) {
                if (item.confidence < filterState.confidenceRange[0] || item.confidence > filterState.confidenceRange[1]) {
                    return false;
                }
            }
            // 关键词过滤
            if (filterState.keyword) {
                const keyword = filterState.keyword.toLowerCase();
                const match = (item.title?.toLowerCase().includes(keyword)) ||
                    (item.summary?.toLowerCase().includes(keyword)) ||
                    (item.rawContent.toLowerCase().includes(keyword));
                if (!match) return false;
            }
            return true;
        });
    }, [filterState]);

    if (loading) {
        return (
            <Flex justify="center" align="center" style={{ height: 400 }}>
                <Spin size="large" tip="加载情报数据..." />
            </Flex>
        );
    }

    if (filteredItems.length === 0) {
        return <Empty description="暂无符合条件的情报" style={{ marginTop: 60 }} />;
    }

    // 渲染情报卡片
    const renderCard = (item: IntelItem) => {
        const isSelected = selectedIntelId === item.id;
        const cardStyle = {
            marginBottom: 16,
            cursor: 'pointer',
            borderColor: isSelected ? token.colorPrimary : undefined,
            boxShadow: isSelected ? `0 0 0 2px ${token.colorPrimaryBg}` : undefined,
        };

        switch (item.contentType) {
            case ContentType.DAILY_REPORT:
                return (
                    <DailyReportCard
                        key={item.id}
                        intel={item}
                        style={cardStyle}
                        onClick={() => onIntelSelect(item)}
                    />
                );
            case ContentType.RESEARCH_REPORT:
                return (
                    <ResearchReportCard
                        key={item.id}
                        intel={item}
                        style={cardStyle}
                        onClick={() => onIntelSelect(item)}
                    />
                );
            case ContentType.POLICY_DOC:
                return (
                    <PolicyDocCard
                        key={item.id}
                        intel={item}
                        style={cardStyle}
                        onClick={() => onIntelSelect(item)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div style={{ maxWidth: 900 }}>
            {filteredItems.map(renderCard)}
        </div>
    );
};

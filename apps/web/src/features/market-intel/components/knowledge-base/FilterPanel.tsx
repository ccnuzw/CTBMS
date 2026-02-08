import React, { useMemo } from 'react';
import { Card, Typography, Button, Flex, Checkbox, Tag } from 'antd';
import {
    FilterOutlined,
    ClockCircleOutlined,
    BankOutlined,
    SafetyOutlined,
    FileExcelOutlined,
    FileTextOutlined
} from '@ant-design/icons';
import { theme } from 'antd';
import { IntelSourceType, INTEL_SOURCE_TYPE_LABELS } from '@packages/types';
import { useDictionary } from '@/hooks/useDictionaries';

const { Title, Text } = Typography;



export type TimeRange = '1M' | '3M' | '6M' | 'YTD' | 'ALL';

interface FilterPanelProps {
    totalDocs: number;
    timeRange: TimeRange;
    setTimeRange: (range: TimeRange) => void;
    selectedSources: Set<string>;
    toggleSource: (source: string) => void;
    selectedTags: Set<string>;
    toggleTag: (tag: string) => void;
    tagCloud: [string, number][];
    width?: number;
    style?: React.CSSProperties;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
    totalDocs,
    timeRange,
    setTimeRange,
    selectedSources,
    toggleSource,
    selectedTags,
    toggleTag,
    tagCloud,
    width = 280,
    style
}) => {
    const { token } = theme.useToken();
    const { data: sourceItems } = useDictionary('INTEL_SOURCE_TYPE');

    const sourceTypeMeta = useMemo(() => {
        const items = sourceItems?.filter((item) => item.isActive) || [];
        const fallbackColors: Record<string, string> = {
            [IntelSourceType.FIRST_LINE]: 'blue',
            [IntelSourceType.COMPETITOR]: 'warning',
            [IntelSourceType.OFFICIAL]: 'error',
            [IntelSourceType.RESEARCH_INST]: 'purple',
            [IntelSourceType.MEDIA]: 'orange',
            [IntelSourceType.INTERNAL_REPORT]: 'geekblue',
        };
        if (!items.length) {
            return {
                labels: INTEL_SOURCE_TYPE_LABELS as Record<string, string>,
                colors: fallbackColors,
                options: [IntelSourceType.OFFICIAL, IntelSourceType.COMPETITOR, IntelSourceType.FIRST_LINE],
            };
        }
        const labels: Record<string, string> = {};
        const colors: Record<string, string> = {};
        const options = items.map((item) => {
            labels[item.code] = item.label;
            colors[item.code] = (item.meta as { color?: string } | null)?.color || fallbackColors[item.code] || 'default';
            return item.code;
        });
        return { labels, colors, options };
    }, [sourceItems]);

    const getSourceIcon = (source: string) => {
        switch (source) {
            case IntelSourceType.OFFICIAL:
                return <SafetyOutlined style={{ color: token.colorError }} />;
            case IntelSourceType.COMPETITOR:
                return <FileExcelOutlined style={{ color: token.colorWarning }} />;
            default:
                return <FileTextOutlined style={{ color: token.colorPrimary }} />;
        }
    };

    return (
        <Card
            style={{ width, height: '100%', overflow: 'auto', borderRadius: 0, ...style }}
            bodyStyle={{ padding: 16 }}
        >
            <Title level={5}>
                <FilterOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                知识库索引 (Index)
            </Title>
            <Text type="secondary" style={{ fontSize: 11 }}>
                已归档 {totalDocs} 份文件
            </Text>

            {/* 时效筛选 */}
            <div style={{ marginTop: 24 }}>
                <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    时效筛选
                </Text>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {(['1M', '3M', '6M', 'YTD', 'ALL'] as const).map((range) => (
                        <Button
                            key={range}
                            size="small"
                            type={timeRange === range ? 'primary' : 'default'}
                            onClick={() => setTimeRange(range)}
                        >
                            {range === '1M' ? '近1月' : range === '3M' ? '近3月' : range === '6M' ? '近半年' : range === 'YTD' ? '今年' : '全部'}
                        </Button>
                    ))}
                </div>
            </div>

            {/* 来源渠道 */}
            <div style={{ marginTop: 24 }}>
                <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                    <BankOutlined style={{ marginRight: 4 }} />
                    来源渠道
                </Text>
                <div style={{ marginTop: 12 }}>
                    {sourceTypeMeta.options.map(
                        (source) => (
                            <Flex
                                key={source}
                                justify="space-between"
                                align="center"
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: token.borderRadius,
                                    border: `1px solid ${selectedSources.has(source) ? token.colorPrimary : token.colorBorder}`,
                                    marginBottom: 8,
                                    cursor: 'pointer',
                                    background: selectedSources.has(source) ? `${token.colorPrimary}10` : undefined,
                                }}
                                onClick={() => toggleSource(source)}
                            >
                                <Flex align="center" gap={8}>
                                    {getSourceIcon(source)}
                                    <Text style={{ fontSize: 12 }}>{sourceTypeMeta.labels[source] || source}</Text>
                                </Flex>
                                <Checkbox checked={selectedSources.has(source)} />
                            </Flex>
                        ),
                    )}
                </div>
            </div>

            {/* AI 标签云 */}
            <div style={{ marginTop: 24 }}>
                <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                    热门话题 (AI Tags)
                </Text>
                <Flex wrap="wrap" gap={8} style={{ marginTop: 12 }}>
                    {tagCloud.slice(0, 15).map(([tag, count]) => (
                        <Tag
                            key={tag}
                            style={{
                                cursor: 'pointer',
                                background: selectedTags.has(tag) ? `${token.colorPrimary}20` : undefined,
                                borderColor: selectedTags.has(tag) ? token.colorPrimary : undefined,
                            }}
                            onClick={() => toggleTag(tag)}
                        >
                            {tag} ({count})
                        </Tag>
                    ))}
                </Flex>
            </div>
        </Card>
    );
};

import React from 'react';
import { Card, Flex, Typography, Button, Modal, Tag, AutoComplete, Input, Segmented, theme } from 'antd';
import { QuestionCircleOutlined, SearchOutlined, StarFilled, StarOutlined, DeleteOutlined, HistoryOutlined, BulbOutlined, TagOutlined, LineChartOutlined, ControlOutlined } from '@ant-design/icons';
import { TimeRange, SentimentFilter, SortOption, SEARCH_HISTORY_KEY } from './types';
import { useUniversalSearchViewModel } from './useUniversalSearchViewModel';

const { Title, Text, Paragraph } = Typography;

interface Props {
    viewModel: ReturnType<typeof useUniversalSearchViewModel>;
}

export const UniversalSearchHeader: React.FC<Props> = ({ viewModel }) => {
    const { token } = theme.useToken();
    const {
        state: {
            query, showFilters, dateRange, sentimentFilter, sortBy, showHelp, debouncedQuery,
            searchHistory, suggestions, savedSearches
        },
        actions: {
            setQuery, setShowFilters, setDateRange, setSentimentFilter, setSortBy, setShowHelp,
            saveCurrentSearch, deleteSavedSearch, setSearchHistory
        }
    } = viewModel;

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <Flex justify="center" align="center" gap={8}>
                    <Title level={2} style={{ marginBottom: 0 }}>全景检索 (Universal Search)</Title>
                    <Button type="text" icon={<QuestionCircleOutlined />} onClick={() => setShowHelp(true)} style={{ color: token.colorTextSecondary }} />
                </Flex>
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>穿透数据壁垒，发现隐性关联。</Text>
            </div>

            <Modal
                title={<><QuestionCircleOutlined style={{ marginRight: 8 }} />全景检索 使用指南</>}
                open={showHelp}
                onCancel={() => setShowHelp(false)}
                footer={<Button type="primary" onClick={() => setShowHelp(false)}>知道了</Button>}
                width={640}
            >
                <div style={{ padding: '16px 0' }}>
                    <Title level={5} style={{ marginBottom: 12 }}>🔍 搜索什么？</Title>
                    <Paragraph style={{ marginBottom: 16 }}>全景检索可同时搜索系统中的<strong>三类数据</strong>：</Paragraph>
                    <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                        <li><Tag color="blue">A 类</Tag> <strong>价格数据</strong> - 各采集点的商品价格信息</li>
                        <li><Tag color="green">B 类</Tag> <strong>市场情报</strong> - 市场动态、政策变化、行业新闻</li>
                        <li><Tag color="orange">C 类</Tag> <strong>研究文档</strong> - 深度分析报告</li>
                    </ul>

                    <Title level={5} style={{ marginBottom: 12 }}>⌨️ 如何搜索？</Title>
                    <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                        <li><strong>单关键词</strong>：输入 <Tag>玉米</Tag> <Tag>补贴</Tag> <Tag>锦州港</Tag></li>
                        <li><strong>多关键词</strong>：用空格分隔，如 <Tag>玉米 补贴 东北</Tag></li>
                        <li><strong>筛选条件</strong>：点击 <ControlOutlined /> 按钮展开时间和情感筛选</li>
                    </ul>

                    <Title level={5} style={{ marginBottom: 12 }}>📊 能得到什么？</Title>
                    <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                        <li><strong>统计摘要</strong>：三类数据的匹配数量</li>
                        <li><strong>AI 智能综述</strong>：自动生成市场情绪判断、价格区间、关注点</li>
                        <li><strong>分类结果</strong>：按 A/B/C 类分组展示详细内容</li>
                    </ul>

                    <Title level={5} style={{ marginBottom: 12 }}>💡 搜索技巧</Title>
                    <ul style={{ paddingLeft: 20 }}>
                        <li>了解某品种行情：<Tag>玉米 东北</Tag></li>
                        <li>追踪政策影响：<Tag>补贴 临储</Tag></li>
                        <li>监控采集点：直接输入采集点名称如 <Tag>锦州港</Tag></li>
                        <li>点击搜索框可查看<strong>搜索历史</strong>，输入时有<strong>智能建议</strong></li>
                    </ul>
                </div>
            </Modal>

            <div style={{ maxWidth: 800, margin: '0 auto' }}>
                <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '8px 16px' }}>
                    <Flex align="center" gap={12} style={{ minHeight: 40 }}>
                        <SearchOutlined style={{ color: token.colorPrimary, fontSize: 18, flexShrink: 0 }} />
                        <AutoComplete
                            style={{ flex: 1 }}
                            value={query}
                            onChange={(value) => setQuery(value)}
                            onSelect={(value) => setQuery(value)}
                            placeholder="输入关键词：'玉米'、'补贴'、'锦州港'..."
                            options={[
                                ...(savedSearches.length > 0 && !query ? [{
                                    label: <Text type="secondary" style={{ fontSize: 12 }}><StarFilled style={{ marginRight: 4, color: token.colorWarning }} />收藏的搜索</Text>,
                                    options: savedSearches.map((search) => ({
                                        value: search.keyword,
                                        label: (
                                            <Flex align="center" justify="space-between">
                                                <Flex align="center" gap={8}>
                                                    <StarFilled style={{ color: token.colorWarning, fontSize: 12 }} />
                                                    <span>{search.keyword}</span>
                                                    <Tag style={{ fontSize: 10 }}>{search.dateRange}</Tag>
                                                </Flex>
                                                <Button type="text" size="small" icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); deleteSavedSearch(search.id); }} style={{ color: token.colorTextTertiary }} />
                                            </Flex>
                                        ),
                                    })),
                                }] : []),
                                ...(searchHistory.length > 0 && !query ? [{
                                    label: (
                                        <Flex align="center" justify="space-between">
                                            <Text type="secondary" style={{ fontSize: 12 }}><HistoryOutlined style={{ marginRight: 4 }} />搜索历史</Text>
                                            <Button type="text" size="small" onClick={(e) => { e.stopPropagation(); setSearchHistory([]); localStorage.removeItem(SEARCH_HISTORY_KEY); }} style={{ fontSize: 11, color: token.colorTextTertiary }}>清空</Button>
                                        </Flex>
                                    ),
                                    options: searchHistory.map((term) => ({
                                        value: term,
                                        label: <Flex align="center" gap={8}><HistoryOutlined style={{ color: token.colorTextTertiary }} /><span>{term}</span></Flex>,
                                    })),
                                }] : []),
                                ...(suggestions.length > 0 && query ? [{
                                    label: <Text type="secondary" style={{ fontSize: 12 }}><BulbOutlined style={{ marginRight: 4 }} />搜索建议</Text>,
                                    options: suggestions.map((s) => ({
                                        value: s.text,
                                        label: (
                                            <Flex align="center" gap={8}>
                                                {s.type === 'collection_point' && <TagOutlined style={{ color: token.colorPrimary }} />}
                                                {s.type === 'commodity' && <LineChartOutlined style={{ color: token.colorSuccess }} />}
                                                {s.type === 'tag' && <BulbOutlined style={{ color: token.colorWarning }} />}
                                                <span>{s.text}</span>
                                                {s.count && <Text type="secondary" style={{ fontSize: 11 }}>({s.count})</Text>}
                                            </Flex>
                                        ),
                                    })),
                                }] : []),
                            ]}
                        >
                            <Input bordered={false} style={{ fontSize: 16, padding: '4px 0' }} />
                        </AutoComplete>
                        <Button type={showFilters ? 'primary' : 'text'} icon={<ControlOutlined />} onClick={() => setShowFilters(!showFilters)} style={{ flexShrink: 0, background: showFilters ? token.colorPrimaryBg : 'transparent', color: showFilters ? token.colorPrimary : token.colorTextSecondary }} />
                        <Button type="text" icon={savedSearches.some((s) => s.keyword === debouncedQuery) ? <StarFilled style={{ color: token.colorWarning }} /> : <StarOutlined />} onClick={saveCurrentSearch} disabled={!debouncedQuery || debouncedQuery.length < 2} title="收藏此搜索" style={{ flexShrink: 0 }} />
                    </Flex>
                </Card>

                {showFilters && (
                    <Card style={{ marginBottom: 24 }} bodyStyle={{ padding: 16 }}>
                        <Flex gap={48}>
                            <div>
                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>时间范围</Text>
                                <Segmented options={[{ label: '全部', value: 'ALL' }, { label: '24小时', value: '24H' }, { label: '近7天', value: '7D' }, { label: '近30天', value: '30D' }]} value={dateRange} onChange={(val) => setDateRange(val as TimeRange)} />
                            </div>
                            <div>
                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>情感倾向</Text>
                                <Segmented options={[{ label: '全部', value: 'ALL' }, { label: '利好', value: 'positive' }, { label: '利空', value: 'negative' }]} value={sentimentFilter} onChange={(val) => setSentimentFilter(val as SentimentFilter)} />
                            </div>
                            <div>
                                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>排序方式</Text>
                                <Segmented options={[{ label: '最新优先', value: 'time_desc' }, { label: '最早优先', value: 'time_asc' }]} value={sortBy} onChange={(val) => setSortBy(val as SortOption)} />
                            </div>
                        </Flex>
                    </Card>
                )}
            </div>
        </div>
    );
};

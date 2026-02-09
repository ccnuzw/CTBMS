import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Typography,
  Input,
  Button,
  Tag,
  Flex,
  Segmented,
  Empty,
  theme,
  Row,
  Col,
  AutoComplete,
  Modal,
  Statistic,
  Tooltip,
  Divider,
} from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  FileTextOutlined,
  AlertOutlined,
  ReloadOutlined,
  RightOutlined,
  CalendarOutlined,
  TagOutlined,
  BulbOutlined,
  ControlOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  HistoryOutlined,
  CloseOutlined,
  QuestionCircleOutlined,
  DownloadOutlined,
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  RiseOutlined,
  FallOutlined,
  PieChartOutlined,
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import Markdown from 'react-markdown';
import { IntelCategory, INTEL_SOURCE_TYPE_LABELS } from '../types';
import { useDictionaries } from '@/hooks/useDictionaries';
import { useDebounce } from '@/hooks/useDebounce';
import { useUniversalSearch, useGenerateInsight, useSearchSuggestions } from '../api/hooks';
import { ChartContainer } from './ChartContainer';
import { SearchResultDetail, SearchResultItem } from './SearchResultDetail';

const stripHtml = (html: string) => {
  if (!html) return '';
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

/**
 * 高亮关键词：将文本中的关键词用 <mark> 标签包裹
 * @param text 原始文本
 * @param keywords 关键词（空格分隔的字符串）
 * @returns React 元素数组
 */
const highlightKeywords = (text: string, keywords: string): React.ReactNode => {
  if (!text || !keywords?.trim()) return text;

  // 将关键词拆分并创建正则表达式
  const keywordList = keywords.trim().split(/\s+/).filter(Boolean);
  if (keywordList.length === 0) return text;

  // 转义特殊正则字符
  const escaped = keywordList.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

  // 分割文本并高亮匹配部分
  const parts = text.split(regex);
  return parts.map((part, i) => {
    const isMatch = keywordList.some((k) => k.toLowerCase() === part.toLowerCase());
    return isMatch ? (
      <mark
        key={i}
        style={{
          backgroundColor: '#fff1b8',
          padding: '0 2px',
          borderRadius: 2,
        }}
      >
        {part}
      </mark>
    ) : (
      part
    );
  });
};

const { Title, Text, Paragraph } = Typography;

type TimeRange = 'ALL' | '24H' | '7D' | '30D';
type SentimentFilter = 'ALL' | 'positive' | 'negative';

export const UniversalSearch: React.FC = () => {
  const { token } = theme.useToken();
  const { data: dictionaries } = useDictionaries(['INTEL_SOURCE_TYPE']);

  const sourceTypeLabels = useMemo(() => {
    const items = dictionaries?.INTEL_SOURCE_TYPE?.filter((item) => item.isActive) || [];
    if (!items.length) return INTEL_SOURCE_TYPE_LABELS;
    return items.reduce<Record<string, string>>((acc, item) => {
      acc[item.code] = item.label;
      return acc;
    }, {});
  }, [dictionaries]);

  // 状态
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState<TimeRange>('ALL');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('ALL');
  const [isAiSummarizing, setIsAiSummarizing] = useState(false);
  const insightMutation = useGenerateInsight();

  // 排序选项
  type SortOption = 'time_desc' | 'time_asc' | 'relevance';
  const [sortBy, setSortBy] = useState<SortOption>('time_desc');

  // 折叠状态记忆
  const EXPANDED_KEY = 'universal_search_expanded';
  const [expandedSection, setExpandedSection] = useState<'price' | 'doc' | 'intel' | null>(() => {
    try {
      const stored = localStorage.getItem(EXPANDED_KEY);
      return stored as 'price' | 'doc' | 'intel' | null;
    } catch {
      return null;
    }
  });

  // 保存折叠状态到 localStorage
  useEffect(() => {
    try {
      if (expandedSection) {
        localStorage.setItem(EXPANDED_KEY, expandedSection);
      } else {
        localStorage.removeItem(EXPANDED_KEY);
      }
    } catch {
      // ignore
    }
  }, [expandedSection]);

  const [showHelp, setShowHelp] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchResultItem | null>(null);

  // 搜索防抖 (300ms 延迟)
  const debouncedQuery = useDebounce(query, 300);

  // 搜索历史 (最多保存 10 条)
  const SEARCH_HISTORY_KEY = 'universal_search_history';
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 搜索建议
  const { data: suggestionsData } = useSearchSuggestions(query, { enabled: query.length >= 1 });
  const suggestions = suggestionsData?.suggestions || [];

  // 添加搜索词到历史记录
  const addToHistory = useCallback((term: string) => {
    setSearchHistory((prev) => {
      if (!term || term.length < 2) return prev;
      // 避免重复更新导致循环
      if (prev.length > 0 && prev[0] === term.trim()) return prev;

      const updated = [term.trim(), ...prev.filter((h) => h !== term.trim())].slice(0, 10);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });
  }, []);

  // 当防抖后的搜索词变化时，添加到历史
  useEffect(() => {
    if (debouncedQuery && debouncedQuery.length >= 2) {
      addToHistory(debouncedQuery);
    }
  }, [debouncedQuery, addToHistory]);

  // 保存搜索条件
  const SAVED_SEARCHES_KEY = 'universal_saved_searches';
  interface SavedSearch {
    id: string;
    name: string;
    keyword: string;
    dateRange: TimeRange;
    sentiment: SentimentFilter;
    createdAt: number;
  }
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    try {
      const stored = localStorage.getItem(SAVED_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveCurrentSearch = useCallback(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return;

    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      name: debouncedQuery.substring(0, 20),
      keyword: debouncedQuery,
      dateRange,
      sentiment: sentimentFilter,
      createdAt: Date.now(),
    };

    const updated = [newSearch, ...savedSearches.filter((s) => s.keyword !== debouncedQuery)].slice(
      0,
      10,
    );
    setSavedSearches(updated);
    try {
      localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  }, [debouncedQuery, dateRange, sentimentFilter, savedSearches]);

  const loadSavedSearch = useCallback((search: SavedSearch) => {
    setQuery(search.keyword);
    setDateRange(search.dateRange);
    setSentimentFilter(search.sentiment);
  }, []);

  const deleteSavedSearch = useCallback(
    (id: string) => {
      const updated = savedSearches.filter((s) => s.id !== id);
      setSavedSearches(updated);
      try {
        localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
    },
    [savedSearches],
  );

  // 计算实际时间范围起始日期
  const startDate = useMemo(() => {
    if (dateRange === 'ALL') return undefined;
    const now = new Date();
    switch (dateRange) {
      case '24H':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7D':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30D':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return undefined;
    }
  }, [dateRange]);

  const toggleExpand = (section: 'price' | 'doc' | 'intel') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // 使用聚合搜索 API - 一次请求返回三类数据
  const { data: searchResult, isLoading: isSearching } = useUniversalSearch(
    {
      keyword: debouncedQuery,
      startDate,
      sentiment: sentimentFilter === 'ALL' ? undefined : sentimentFilter,
    },
    { enabled: !!debouncedQuery && debouncedQuery.length >= 2 },
  );

  // 从聚合结果中提取三类数据
  const prices = searchResult?.prices?.data || [];
  const intels = searchResult?.intels?.data || [];
  const docs = searchResult?.docs?.data || [];

  // Combined Results for Analysis
  const combinedResults = useMemo(() => {
    return [...intels, ...docs];
  }, [intels, docs]);

  const hasResults = prices.length > 0 || intels.length > 0 || docs.length > 0;

  // 图表数据
  const chartData = useMemo(() => {
    return prices
      .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())
      .map((p) => ({
        date: new Date(p.effectiveDate).toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
        }),
        price: p.price,
        location: p.location,
      }));
  }, [prices]);

  // 按采集点分组的图表数据（用于多线对比）
  const { groupedChartData, uniqueLocations } = useMemo(() => {
    const locations = [...new Set(prices.map((p) => p.location))].slice(0, 5); // 最多显示5个采集点
    const dateMap = new Map<string, Record<string, number>>();

    prices.forEach((p) => {
      const dateKey = new Date(p.effectiveDate).toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
      });
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { date: dateKey } as unknown as Record<string, number>);
      }
      const entry = dateMap.get(dateKey)!;
      entry[p.location] = p.price;
    });

    return {
      groupedChartData: Array.from(dateMap.values()).sort((a, b) =>
        (a as unknown as { date: string }).date.localeCompare(
          (b as unknown as { date: string }).date,
        ),
      ),
      uniqueLocations: locations,
    };
  }, [prices]);

  // 价格区间计算
  const priceRange = useMemo(() => {
    return chartData.length > 0
      ? `${Math.min(...chartData.map((d) => d.price))} - ${Math.max(...chartData.map((d) => d.price))}`
      : '--';
  }, [chartData]);

  // 情感趋势数据（按日期统计利好/利空数量）
  const sentimentTrendData = useMemo(() => {
    const dateMap = new Map<
      string,
      { date: string; positive: number; negative: number; neutral: number }
    >();

    [...intels, ...docs].forEach((item) => {
      const dateKey = new Date(item.effectiveTime).toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
      });
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { date: dateKey, positive: 0, negative: 0, neutral: 0 });
      }
      const entry = dateMap.get(dateKey)!;
      const sentiment = item.aiAnalysis?.sentiment || 'neutral';
      if (sentiment === 'positive') entry.positive++;
      else if (sentiment === 'negative') entry.negative++;
      else entry.neutral++;
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [intels, docs]);

  // 词云数据（从标签中提取）
  const wordCloudData = useMemo(() => {
    const tagCount = new Map<string, number>();
    [...intels, ...docs].forEach((item) => {
      item.aiAnalysis?.tags?.forEach((tag) => {
        if (tag && !tag.toLowerCase().includes(query.toLowerCase())) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
        }
      });
    });
    return Array.from(tagCount.entries())
      .map(([text, value]) => ({ text, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }, [intels, docs, query]);

  // 搜索统计指标
  const searchStats = useMemo(() => {
    const positiveCount = [...intels, ...docs].filter(
      (i) => i.aiAnalysis?.sentiment === 'positive',
    ).length;
    const negativeCount = [...intels, ...docs].filter(
      (i) => i.aiAnalysis?.sentiment === 'negative',
    ).length;
    const priceMin = prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : 0;
    const priceMax = prices.length > 0 ? Math.max(...prices.map((p) => p.price)) : 0;
    const uniqueCommodities = [...new Set(prices.map((p) => p.commodity))];
    const uniqueLocations = [...new Set(prices.map((p) => p.location))];

    return {
      totalResults: prices.length + intels.length + docs.length,
      priceCount: prices.length,
      intelCount: intels.length,
      docCount: docs.length,
      positiveCount,
      negativeCount,
      priceMin,
      priceMax,
      commodities: uniqueCommodities,
      locations: uniqueLocations,
    };
  }, [prices, intels, docs]);

  // 排序后的结果
  const sortedIntels = useMemo(() => {
    const sorted = [...intels];
    if (sortBy === 'time_desc')
      sorted.sort(
        (a, b) => new Date(b.effectiveTime).getTime() - new Date(a.effectiveTime).getTime(),
      );
    else if (sortBy === 'time_asc')
      sorted.sort(
        (a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime(),
      );
    return sorted;
  }, [intels, sortBy]);

  const sortedDocs = useMemo(() => {
    const sorted = [...docs];
    if (sortBy === 'time_desc')
      sorted.sort(
        (a, b) => new Date(b.effectiveTime).getTime() - new Date(a.effectiveTime).getTime(),
      );
    else if (sortBy === 'time_asc')
      sorted.sort(
        (a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime(),
      );
    return sorted;
  }, [docs, sortBy]);

  // 相关实体提取
  const relatedTags = useMemo(() => {
    const tags = new Map<string, number>();
    combinedResults.forEach((c) => {
      if (c.aiAnalysis) {
        c.aiAnalysis.tags.forEach((t) => {
          if (!t.toLowerCase().includes(query.toLowerCase())) tags.set(t, (tags.get(t) || 0) + 1);
        });
        c.aiAnalysis.entities?.forEach((e) => {
          if (!e.toLowerCase().includes(query.toLowerCase())) tags.set(e, (tags.get(e) || 0) + 1);
        });
      }
    });
    return Array.from(tags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [combinedResults, query]);

  // AI 分析刷新
  const handleAiRefresh = useCallback(() => {
    if (!combinedResults.length) return;

    // 1. 构建统计摘要
    const statsSummary = [
      `搜索关键词：${debouncedQuery}`,
      `结果总数：${searchStats.totalResults}`,
      `价格区间：${searchStats.priceMin} - ${searchStats.priceMax}`,
      `情感分布：利好 ${searchStats.positiveCount} / 利空 ${searchStats.negativeCount}`,
      `涉及品种：${searchStats.commodities.slice(0, 5).join(', ')}`,
      `主要产区：${searchStats.locations.slice(0, 5).join(', ')}`,
    ].join('\n');

    // 2. 收集 Top 相关情报 (按相关性/时间排序)
    const topIntels = sortedIntels
      .slice(0, 8)
      .map(
        (r) =>
          `[${new Date(r.effectiveTime).toLocaleDateString()}] ${r.rawContent.substring(0, 100)}... (情感:${r.aiAnalysis?.sentiment || '中性'})`,
      )
      .join('\n');

    // 3. 收集 Top 相关文档
    const topDocs = sortedDocs
      .slice(0, 3)
      .map((r) => {
        const docTitle =
          stripHtml(r.rawContent || '')
            .split('\n')[0]
            ?.slice(0, 24) || '文档';
        const summary = r.aiAnalysis?.summary || stripHtml(r.rawContent).substring(0, 50);
        return `[${new Date(r.effectiveTime).toLocaleDateString()}] 《${docTitle}》：${summary}...`;
      })
      .join('\n');

    // 4. 发送综合分析请求
    insightMutation.mutate({
      content: `
关键词：${debouncedQuery}
时间范围：${dateRange}

【统计数据】
${statsSummary}

【精选情报】
${topIntels}

【相关研报】
${topDocs}
            `.trim(),
    });
  }, [
    combinedResults,
    debouncedQuery,
    dateRange,
    searchStats,
    sortedIntels,
    sortedDocs,
    insightMutation,
  ]);

  const aiSummaryResult = insightMutation.data
    ? { summary: insightMutation.data.summary }
    : undefined;
  const isSummarizing = insightMutation.isPending;

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc 清空搜索
      if (e.key === 'Escape' && query) {
        setQuery('');
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [query]);

  // 导出搜索结果到 Excel
  const handleExport = useCallback(() => {
    if (!hasResults) return;

    const wb = XLSX.utils.book_new();

    // 1. 价格数据 Sheet
    if (prices.length > 0) {
      const priceSheet = XLSX.utils.json_to_sheet(
        prices.map((p) => ({
          日期: new Date(p.effectiveDate).toLocaleDateString('zh-CN'),
          采集点: p.location,
          品种: p.commodity,
          价格: p.price,
          单位: '元/吨',
        })),
      );
      XLSX.utils.book_append_sheet(wb, priceSheet, '价格数据');
    }

    // 2. 市场情报 Sheet
    if (intels.length > 0) {
      const intelSheet = XLSX.utils.json_to_sheet(
        intels.map((i) => ({
          日期: new Date(i.effectiveTime).toLocaleDateString('zh-CN'),
          摘要: i.aiAnalysis?.summary || stripHtml(i.rawContent).substring(0, 100),
          情感:
            i.aiAnalysis?.sentiment === 'positive'
              ? '利好'
              : i.aiAnalysis?.sentiment === 'negative'
                ? '利空'
                : '中性',
          来源: i.author?.name || '-',
        })),
      );
      XLSX.utils.book_append_sheet(wb, intelSheet, '市场情报');
    }

    // 3. 研究文档 Sheet
    if (docs.length > 0) {
      const docSheet = XLSX.utils.json_to_sheet(
        docs.map((d) => ({
          日期: new Date(d.effectiveTime).toLocaleDateString('zh-CN'),
          标题: stripHtml(d.rawContent).substring(0, 50),
          摘要: d.aiAnalysis?.summary || '-',
          来源: d.author?.name || '-',
        })),
      );
      XLSX.utils.book_append_sheet(wb, docSheet, '研究文档');
    }

    // 4. AI 综述 Sheet (如果有)
    if (aiSummaryResult?.summary) {
      const summarySheet = XLSX.utils.json_to_sheet([
        { 类型: 'AI 综述', 内容: aiSummaryResult.summary },
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'AI综述');
    }

    // 导出
    XLSX.writeFile(wb, `全景检索_${debouncedQuery}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [prices, intels, docs, aiSummaryResult, debouncedQuery, hasResults]);

  return (
    <>
      <div
        style={{
          height: '100%',
          overflow: 'auto',
          padding: '32px 24px',
          background: token.colorBgLayout,
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {/* 标题 */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <Flex justify="center" align="center" gap={8}>
              <Title level={2} style={{ marginBottom: 0 }}>
                全景检索 (Universal Search)
              </Title>
              <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                onClick={() => setShowHelp(true)}
                style={{ color: token.colorTextSecondary }}
              />
            </Flex>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              穿透数据壁垒，发现隐性关联。
            </Text>
          </div>

          {/* 使用说明 Modal */}
          <Modal
            title={
              <>
                <QuestionCircleOutlined style={{ marginRight: 8 }} />
                全景检索 使用指南
              </>
            }
            open={showHelp}
            onCancel={() => setShowHelp(false)}
            footer={
              <Button type="primary" onClick={() => setShowHelp(false)}>
                知道了
              </Button>
            }
            width={640}
          >
            <div style={{ padding: '16px 0' }}>
              <Title level={5} style={{ marginBottom: 12 }}>
                🔍 搜索什么？
              </Title>
              <Paragraph style={{ marginBottom: 16 }}>
                全景检索可同时搜索系统中的<strong>三类数据</strong>：
              </Paragraph>
              <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                <li>
                  <Tag color="blue">A 类</Tag> <strong>价格数据</strong> - 各采集点的商品价格信息
                </li>
                <li>
                  <Tag color="green">B 类</Tag> <strong>市场情报</strong> -
                  市场动态、政策变化、行业新闻
                </li>
                <li>
                  <Tag color="orange">C 类</Tag> <strong>研究文档</strong> - 深度分析报告
                </li>
              </ul>

              <Title level={5} style={{ marginBottom: 12 }}>
                ⌨️ 如何搜索？
              </Title>
              <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                <li>
                  <strong>单关键词</strong>：输入 <Tag>玉米</Tag> <Tag>补贴</Tag> <Tag>锦州港</Tag>
                </li>
                <li>
                  <strong>多关键词</strong>：用空格分隔，如 <Tag>玉米 补贴 东北</Tag>
                </li>
                <li>
                  <strong>筛选条件</strong>：点击 <ControlOutlined /> 按钮展开时间和情感筛选
                </li>
              </ul>

              <Title level={5} style={{ marginBottom: 12 }}>
                📊 能得到什么？
              </Title>
              <ul style={{ paddingLeft: 20, marginBottom: 20 }}>
                <li>
                  <strong>统计摘要</strong>：三类数据的匹配数量
                </li>
                <li>
                  <strong>AI 智能综述</strong>：自动生成市场情绪判断、价格区间、关注点
                </li>
                <li>
                  <strong>分类结果</strong>：按 A/B/C 类分组展示详细内容
                </li>
              </ul>

              <Title level={5} style={{ marginBottom: 12 }}>
                💡 搜索技巧
              </Title>
              <ul style={{ paddingLeft: 20 }}>
                <li>
                  了解某品种行情：<Tag>玉米 东北</Tag>
                </li>
                <li>
                  追踪政策影响：<Tag>补贴 临储</Tag>
                </li>
                <li>
                  监控采集点：直接输入采集点名称如 <Tag>锦州港</Tag>
                </li>
                <li>
                  点击搜索框可查看<strong>搜索历史</strong>，输入时有<strong>智能建议</strong>
                </li>
              </ul>
            </div>
          </Modal>

          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {/* 搜索框 (带自动补全) */}
            <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '8px 16px' }}>
              <Flex align="center" gap={12} style={{ minHeight: 40 }}>
                <SearchOutlined
                  style={{ color: token.colorPrimary, fontSize: 18, flexShrink: 0 }}
                />
                <AutoComplete
                  style={{ flex: 1 }}
                  value={query}
                  onChange={(value) => setQuery(value)}
                  onSelect={(value) => setQuery(value)}
                  placeholder="输入关键词：'玉米'、'补贴'、'锦州港'..."
                  options={[
                    // 已收藏的搜索快捷方式
                    ...(savedSearches.length > 0 && !query
                      ? [
                          {
                            label: (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                <StarFilled style={{ marginRight: 4, color: token.colorWarning }} />
                                收藏的搜索
                              </Text>
                            ),
                            options: savedSearches.map((search) => ({
                              value: search.keyword,
                              label: (
                                <Flex align="center" justify="space-between">
                                  <Flex align="center" gap={8}>
                                    <StarFilled
                                      style={{ color: token.colorWarning, fontSize: 12 }}
                                    />
                                    <span>{search.keyword}</span>
                                    <Tag style={{ fontSize: 10 }}>{search.dateRange}</Tag>
                                  </Flex>
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteSavedSearch(search.id);
                                    }}
                                    style={{ color: token.colorTextTertiary }}
                                  />
                                </Flex>
                              ),
                            })),
                          },
                        ]
                      : []),
                    // 搜索历史选项组
                    ...(searchHistory.length > 0 && !query
                      ? [
                          {
                            label: (
                              <Flex align="center" justify="space-between">
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  <HistoryOutlined style={{ marginRight: 4 }} />
                                  搜索历史
                                </Text>
                                <Button
                                  type="text"
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchHistory([]);
                                    localStorage.removeItem(SEARCH_HISTORY_KEY);
                                  }}
                                  style={{ fontSize: 11, color: token.colorTextTertiary }}
                                >
                                  清空
                                </Button>
                              </Flex>
                            ),
                            options: searchHistory.map((term) => ({
                              value: term,
                              label: (
                                <Flex align="center" gap={8}>
                                  <HistoryOutlined style={{ color: token.colorTextTertiary }} />
                                  <span>{term}</span>
                                </Flex>
                              ),
                            })),
                          },
                        ]
                      : []),
                    // 搜索建议选项组
                    ...(suggestions.length > 0 && query
                      ? [
                          {
                            label: (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                <BulbOutlined style={{ marginRight: 4 }} />
                                搜索建议
                              </Text>
                            ),
                            options: suggestions.map((s) => ({
                              value: s.text,
                              label: (
                                <Flex align="center" gap={8}>
                                  {s.type === 'collection_point' && (
                                    <TagOutlined style={{ color: token.colorPrimary }} />
                                  )}
                                  {s.type === 'commodity' && (
                                    <LineChartOutlined style={{ color: token.colorSuccess }} />
                                  )}
                                  {s.type === 'tag' && (
                                    <BulbOutlined style={{ color: token.colorWarning }} />
                                  )}
                                  <span>{s.text}</span>
                                  {s.count && (
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      ({s.count})
                                    </Text>
                                  )}
                                </Flex>
                              ),
                            })),
                          },
                        ]
                      : []),
                  ]}
                >
                  <Input bordered={false} style={{ fontSize: 16, padding: '4px 0' }} />
                </AutoComplete>
                <Button
                  type={showFilters ? 'primary' : 'text'}
                  icon={<ControlOutlined />}
                  onClick={() => setShowFilters(!showFilters)}
                  style={{
                    flexShrink: 0,
                    background: showFilters ? token.colorPrimaryBg : 'transparent',
                    color: showFilters ? token.colorPrimary : token.colorTextSecondary,
                  }}
                />
                <Button
                  type="text"
                  icon={
                    savedSearches.some((s) => s.keyword === debouncedQuery) ? (
                      <StarFilled style={{ color: token.colorWarning }} />
                    ) : (
                      <StarOutlined />
                    )
                  }
                  onClick={saveCurrentSearch}
                  disabled={!debouncedQuery || debouncedQuery.length < 2}
                  title="收藏此搜索"
                  style={{ flexShrink: 0 }}
                />
              </Flex>
            </Card>

            {/* 筛选面板 */}
            {showFilters && (
              <Card style={{ marginBottom: 24 }} bodyStyle={{ padding: 16 }}>
                <Flex gap={48}>
                  <div>
                    <Text
                      type="secondary"
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        display: 'block',
                        marginBottom: 8,
                      }}
                    >
                      时间范围
                    </Text>
                    <Segmented
                      options={[
                        { label: '全部', value: 'ALL' },
                        { label: '24小时', value: '24H' },
                        { label: '近7天', value: '7D' },
                        { label: '近30天', value: '30D' },
                      ]}
                      value={dateRange}
                      onChange={(val) => setDateRange(val as TimeRange)}
                    />
                  </div>
                  <div>
                    <Text
                      type="secondary"
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        display: 'block',
                        marginBottom: 8,
                      }}
                    >
                      情感倾向
                    </Text>
                    <Segmented
                      options={[
                        { label: '全部', value: 'ALL' },
                        { label: '利好', value: 'positive' },
                        { label: '利空', value: 'negative' },
                      ]}
                      value={sentimentFilter}
                      onChange={(val) => setSentimentFilter(val as SentimentFilter)}
                    />
                  </div>
                  <div>
                    <Text
                      type="secondary"
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        display: 'block',
                        marginBottom: 8,
                      }}
                    >
                      排序方式
                    </Text>
                    <Segmented
                      options={[
                        { label: '最新优先', value: 'time_desc' },
                        { label: '最早优先', value: 'time_asc' },
                      ]}
                      value={sortBy}
                      onChange={(val) => setSortBy(val as SortOption)}
                    />
                  </div>
                </Flex>
              </Card>
            )}
          </div>

          {hasResults ? (
            <>
              {/* 搜索结果统计卡 */}
              <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
                <Flex wrap="wrap" gap={24} align="center">
                  <Statistic
                    title="总结果"
                    value={searchStats.totalResults}
                    valueStyle={{ fontSize: 20, fontWeight: 600 }}
                  />
                  <Divider type="vertical" style={{ height: 40 }} />
                  <Statistic
                    title="价格数据"
                    value={searchStats.priceCount}
                    valueStyle={{ fontSize: 18, color: token.colorSuccess }}
                  />
                  <Statistic
                    title="市场情报"
                    value={searchStats.intelCount}
                    valueStyle={{ fontSize: 18, color: token.colorPrimary }}
                  />
                  <Statistic
                    title="研究文档"
                    value={searchStats.docCount}
                    valueStyle={{ fontSize: 18, color: token.colorWarning }}
                  />
                  <Divider type="vertical" style={{ height: 40 }} />
                  <Tooltip title="利好情报数">
                    <Statistic
                      title="利好"
                      value={searchStats.positiveCount}
                      prefix={<RiseOutlined />}
                      valueStyle={{ fontSize: 16, color: token.colorSuccess }}
                    />
                  </Tooltip>
                  <Tooltip title="利空情报数">
                    <Statistic
                      title="利空"
                      value={searchStats.negativeCount}
                      prefix={<FallOutlined />}
                      valueStyle={{ fontSize: 16, color: token.colorError }}
                    />
                  </Tooltip>
                  {searchStats.priceCount > 0 && (
                    <>
                      <Divider type="vertical" style={{ height: 40 }} />
                      <Statistic
                        title="价格区间"
                        value={`${searchStats.priceMin} - ${searchStats.priceMax}`}
                        valueStyle={{ fontSize: 14 }}
                        suffix="元/吨"
                      />
                    </>
                  )}
                </Flex>
              </Card>

              <Row gutter={24} style={{ marginBottom: 24 }}>
                {/* 情感趋势图 */}
                <Col span={14}>
                  <Card title="市场情感趋势" bodyStyle={{ padding: '10px 24px' }}>
                    {sentimentTrendData.length > 0 ? (
                      <ChartContainer height={280}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sentimentTrendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis fontSize={11} tickLine={false} axisLine={false} />
                            <RechartsTooltip
                              contentStyle={{
                                borderRadius: 8,
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              }}
                              cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                            />
                            <Legend />
                            <Bar
                              dataKey="positive"
                              name="利好"
                              stackId="a"
                              fill={token.colorSuccess}
                              barSize={20}
                              radius={[0, 0, 4, 4]}
                            />
                            <Bar
                              dataKey="negative"
                              name="利空"
                              stackId="a"
                              fill={token.colorError}
                              barSize={20}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="neutral"
                              name="中性"
                              stackId="a"
                              fill={token.colorTextQuaternary}
                              barSize={20}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无情感数据" />
                    )}
                  </Card>
                </Col>
                {/* 热门关键词词云 */}
                <Col span={10}>
                  <Card
                    title="热门关联词"
                    bodyStyle={{ height: 300, padding: 0, overflow: 'hidden' }}
                  >
                    {wordCloudData.length > 0 ? (
                      <div
                        style={{
                          padding: 20,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          alignContent: 'center',
                          justifyContent: 'center',
                          height: '100%',
                        }}
                      >
                        {wordCloudData.map((item, index) => {
                          const size = Math.max(12, Math.min(24, 12 + item.value * 2));
                          const opacity = Math.max(0.4, Math.min(1, item.value / 3));
                          return (
                            <Tag
                              key={item.text}
                              color={
                                index % 3 === 0 ? 'blue' : index % 3 === 1 ? 'cyan' : 'geekblue'
                              }
                              style={{
                                fontSize: size,
                                padding: '4px 8px',
                                margin: 4,
                                opacity,
                                cursor: 'pointer',
                                border: 'none',
                                backgroundColor: `rgba(22, 119, 255, ${opacity * 0.1})`,
                              }}
                              onClick={() => setQuery(item.text)}
                            >
                              {item.text}
                            </Tag>
                          );
                        })}
                      </div>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无关联词" />
                    )}
                  </Card>
                </Col>
              </Row>

              {/* AI 智能综述 */}
              <Card
                style={{
                  marginBottom: 24,
                  background: `linear-gradient(135deg, ${token.colorInfoBg} 0%, ${token.colorBgContainer} 100%)`,
                  borderColor: token.colorPrimaryBorder,
                }}
              >
                <Flex justify="space-between" align="flex-start">
                  <div>
                    <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                      <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
                      <Text strong style={{ fontSize: 16, color: token.colorPrimary }}>
                        AI 智能综述 (Insight)
                      </Text>
                      <Button
                        type="text"
                        icon={<ThunderboltOutlined />}
                        onClick={handleAiRefresh}
                        loading={isSummarizing}
                        disabled={isSummarizing}
                      >
                        生成综述
                      </Button>
                      <Button
                        type="text"
                        icon={<DownloadOutlined />}
                        onClick={handleExport}
                        style={{ marginLeft: 8 }}
                      >
                        导出 Excel
                      </Button>
                    </Flex>

                    {isSummarizing ? (
                      <div style={{ padding: '20px 0' }}>
                        <Paragraph>正在分析全网数据，生成深度综述...</Paragraph>
                      </div>
                    ) : !aiSummaryResult ? (
                      <div style={{ padding: '10px 0', color: token.colorTextSecondary }}>
                        点击右侧“生成综述”按钮获取分析报告
                      </div>
                    ) : (
                      <div
                        style={{
                          backgroundColor: token.colorFillAlter,
                          padding: 16,
                          borderRadius: 8,
                          lineHeight: 1.6,
                        }}
                      >
                        <Markdown
                          components={{
                            p: ({ node, ...props }) => (
                              <p style={{ marginBottom: 10 }} {...props} />
                            ),
                            strong: ({ node, ...props }) => (
                              <span
                                style={{ color: token.colorPrimary, fontWeight: 600 }}
                                {...props}
                              />
                            ),
                            ul: ({ node, ...props }) => (
                              <ul style={{ paddingLeft: 20, marginBottom: 10 }} {...props} />
                            ),
                            li: ({ node, ...props }) => (
                              <li style={{ marginBottom: 4 }} {...props} />
                            ),
                            h1: ({ node, ...props }) => (
                              <Title
                                level={4}
                                style={{ marginTop: 16, marginBottom: 12 }}
                                {...props}
                              />
                            ),
                            h2: ({ node, ...props }) => (
                              <Title
                                level={5}
                                style={{ marginTop: 14, marginBottom: 10 }}
                                {...props}
                              />
                            ),
                          }}
                        >
                          {aiSummaryResult.summary}
                        </Markdown>
                      </div>
                    )}
                  </div>
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    onClick={handleAiRefresh}
                    loading={isSummarizing}
                  >
                    刷新分析 <RightOutlined />
                  </Button>
                </Flex>
              </Card>

              {/* 相关实体推荐 */}
              {relatedTags.length > 0 && (
                <Flex align="center" gap={12} style={{ marginBottom: 24, overflowX: 'auto' }}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, textTransform: 'uppercase', flexShrink: 0 }}
                  >
                    <TagOutlined style={{ marginRight: 4 }} />
                    相关实体推荐:
                  </Text>
                  {relatedTags.map(([tag, count]) => (
                    <Tag
                      key={tag}
                      style={{ cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => setQuery(tag.replace('#', ''))}
                    >
                      {tag} <span style={{ opacity: 0.5, marginLeft: 4 }}>{count}</span>
                    </Tag>
                  ))}
                </Flex>
              )}

              {/* 三栏分类展示 */}
              <Row gutter={24}>
                {/* 数据趋势 */}
                {(expandedSection === null || expandedSection === 'price') && (
                  <Col xs={24} lg={expandedSection === 'price' ? 24 : 8}>
                    <Card
                      title={
                        <Flex align="center" gap={8}>
                          <LineChartOutlined style={{ color: token.colorPrimary }} />
                          <Text strong>数据趋势 (Data)</Text>
                          <Tag color="blue">{prices.length}</Tag>
                        </Flex>
                      }
                      extra={
                        <Button
                          type="text"
                          icon={
                            expandedSection === 'price' ? (
                              <FullscreenExitOutlined />
                            ) : (
                              <FullscreenOutlined />
                            )
                          }
                          onClick={() => toggleExpand('price')}
                        />
                      }
                      style={{ height: '100%' }}
                    >
                      {prices.length > 0 ? (
                        <>
                          <Text
                            type="secondary"
                            style={{
                              fontSize: 11,
                              textTransform: 'uppercase',
                              display: 'block',
                              marginBottom: 8,
                            }}
                          >
                            价格走势概览
                          </Text>
                          <div
                            style={{
                              height: expandedSection === 'price' ? 500 : 280,
                              marginBottom: 16,
                              transition: 'height 0.3s',
                            }}
                          >
                            <ChartContainer height={expandedSection === 'price' ? 500 : 280}>
                              <ResponsiveContainer
                                width="100%"
                                height="100%"
                                minWidth={100}
                                minHeight={100}
                              >
                                <LineChart
                                  data={uniqueLocations.length > 1 ? groupedChartData : chartData}
                                >
                                  <CartesianGrid
                                    strokeDasharray="3 3"
                                    vertical={false}
                                    stroke="#f0f0f0"
                                  />
                                  <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis domain={['auto', 'auto']} hide />
                                  <RechartsTooltip />
                                  {uniqueLocations.length > 1 ? (
                                    <>
                                      <Legend wrapperStyle={{ fontSize: 11 }} />
                                      {uniqueLocations.map((loc, idx) => (
                                        <Line
                                          key={loc}
                                          type="monotone"
                                          dataKey={loc}
                                          name={loc}
                                          stroke={
                                            [
                                              token.colorPrimary,
                                              token.colorSuccess,
                                              token.colorWarning,
                                              token.colorError,
                                              '#722ed1',
                                            ][idx % 5]
                                          }
                                          strokeWidth={2}
                                          dot={{ r: 2 }}
                                          connectNulls
                                        />
                                      ))}
                                    </>
                                  ) : (
                                    <Line
                                      type="monotone"
                                      dataKey="price"
                                      stroke={token.colorPrimary}
                                      strokeWidth={2}
                                      dot={{ r: 3, fill: token.colorPrimary }}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </ChartContainer>
                          </div>
                          <div style={{ maxHeight: 400, overflow: 'auto' }}>
                            {prices.map((p) => (
                              <Flex
                                key={p.id}
                                justify="space-between"
                                align="center"
                                style={{
                                  padding: 12,
                                  background: token.colorBgTextHover,
                                  borderRadius: token.borderRadius,
                                  marginBottom: 8,
                                  cursor: 'pointer',
                                }}
                              >
                                <div>
                                  <Text strong>{p.location}</Text>
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                    {new Date(p.effectiveDate).toLocaleDateString()}
                                  </Text>
                                </div>
                                <Text strong>
                                  {p.price.toLocaleString()}
                                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                                    元 ({p.commodity})
                                  </Text>
                                </Text>
                              </Flex>
                            ))}
                          </div>
                        </>
                      ) : (
                        <Empty description="未找到相关结构化数据" />
                      )}
                    </Card>
                  </Col>
                )}

                {/* 相关文档 */}
                {(expandedSection === null || expandedSection === 'doc') && (
                  <Col xs={24} lg={expandedSection === 'doc' ? 24 : 8}>
                    <Card
                      title={
                        <Flex align="center" gap={8}>
                          <FileTextOutlined style={{ color: token.colorWarning }} />
                          <Text strong>相关文档 (Docs)</Text>
                          <Tag color="orange">{docs.length}</Tag>
                        </Flex>
                      }
                      extra={
                        <Button
                          type="text"
                          icon={
                            expandedSection === 'doc' ? (
                              <FullscreenExitOutlined />
                            ) : (
                              <FullscreenOutlined />
                            )
                          }
                          onClick={() => toggleExpand('doc')}
                        />
                      }
                      style={{ height: '100%' }}
                    >
                      {sortedDocs.length > 0 ? (
                        <div
                          style={{
                            maxHeight: expandedSection === 'doc' ? 800 : 400,
                            overflow: 'auto',
                            transition: 'max-height 0.3s',
                          }}
                        >
                          {sortedDocs.map((c) => (
                            <Card
                              key={c.id}
                              size="small"
                              hoverable
                              style={{ marginBottom: 12, cursor: 'pointer' }}
                              onClick={() => setSelectedItem(c as unknown as SearchResultItem)}
                            >
                              <Flex gap={8} align="flex-start">
                                <FileTextOutlined
                                  style={{ color: token.colorWarning, marginTop: 4 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <Text strong ellipsis style={{ display: 'block' }}>
                                    {highlightKeywords(
                                      stripHtml(c.rawContent || '').substring(0, 50),
                                      debouncedQuery,
                                    )}
                                    ...
                                  </Text>
                                  {c.aiAnalysis?.summary && (
                                    <Card
                                      size="small"
                                      style={{
                                        background: `${token.colorWarning}08`,
                                        marginTop: 8,
                                        marginBottom: 8,
                                      }}
                                      bodyStyle={{ padding: 8 }}
                                    >
                                      <Flex gap={4}>
                                        <BulbOutlined
                                          style={{ color: token.colorWarning, fontSize: 12 }}
                                        />
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          {highlightKeywords(
                                            stripHtml(c.aiAnalysis.summary).substring(0, 80),
                                            debouncedQuery,
                                          )}
                                          ...
                                        </Text>
                                      </Flex>
                                    </Card>
                                  )}
                                  <Flex justify="space-between" align="center">
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      <CalendarOutlined style={{ marginRight: 4 }} />
                                      {new Date(c.effectiveTime).toLocaleDateString()}
                                    </Text>
                                    <Tag style={{ fontSize: 10 }}>
                                      {sourceTypeLabels[c.sourceType] || c.sourceType}
                                    </Tag>
                                  </Flex>
                                </div>
                              </Flex>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <Empty description="未找到相关文档" />
                      )}
                    </Card>
                  </Col>
                )}

                {/* 市场情报 */}
                {(expandedSection === null || expandedSection === 'intel') && (
                  <Col xs={24} lg={expandedSection === 'intel' ? 24 : 8}>
                    <Card
                      title={
                        <Flex align="center" gap={8}>
                          <AlertOutlined style={{ color: '#722ed1' }} />
                          <Text strong>市场情报 (Intel)</Text>
                          <Tag color="purple">{intels.length}</Tag>
                        </Flex>
                      }
                      extra={
                        <Button
                          type="text"
                          icon={
                            expandedSection === 'intel' ? (
                              <FullscreenExitOutlined />
                            ) : (
                              <FullscreenOutlined />
                            )
                          }
                          onClick={() => toggleExpand('intel')}
                        />
                      }
                      style={{ height: '100%' }}
                    >
                      {intels.length > 0 ? (
                        <div
                          style={{
                            maxHeight: 800,
                            overflow: 'auto',
                            borderLeft: `2px solid ${token.colorBorderSecondary}`,
                            paddingLeft: 16,
                            marginLeft: 8,
                          }}
                        >
                          {sortedIntels.map((c) => (
                            <div key={c.id} style={{ position: 'relative', marginBottom: 16 }}>
                              <div
                                style={{
                                  position: 'absolute',
                                  left: -22,
                                  top: 8,
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  background: token.colorBgContainer,
                                  border: `2px solid ${c.aiAnalysis?.sentiment === 'positive' ? token.colorSuccess : c.aiAnalysis?.sentiment === 'negative' ? token.colorError : '#722ed1'}`,
                                }}
                              />
                              <Card
                                size="small"
                                hoverable
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedItem(c as unknown as SearchResultItem)}
                              >
                                <Flex
                                  justify="space-between"
                                  align="center"
                                  style={{ marginBottom: 4 }}
                                >
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {new Date(c.effectiveTime).toLocaleDateString()}
                                  </Text>
                                  {c.isFlagged && (
                                    <AlertOutlined
                                      style={{ color: token.colorError, fontSize: 12 }}
                                    />
                                  )}
                                </Flex>
                                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                  {highlightKeywords(
                                    (c.aiAnalysis?.summary || c.rawContent).substring(0, 80),
                                    debouncedQuery,
                                  )}
                                  ...
                                </Text>
                                <Flex gap={4} wrap="wrap">
                                  {(c.aiAnalysis?.tags || []).slice(0, 3).map((t) => (
                                    <Tag key={t} style={{ fontSize: 10 }}>
                                      {t}
                                    </Tag>
                                  ))}
                                </Flex>
                              </Card>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty description="未找到相关情报" />
                      )}
                    </Card>
                  </Col>
                )}
              </Row>
            </>
          ) : (
            <Card style={{ textAlign: 'center', padding: 48 }}>
              <SearchOutlined
                style={{ fontSize: 64, color: token.colorTextQuaternary, marginBottom: 16 }}
              />
              <Title level={4} type="secondary">
                输入关键词，开始全维度检索...
              </Title>
            </Card>
          )}
        </div>
      </div>

      {/* 详情抽屉 */}
      <SearchResultDetail
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        highlightKeywords={highlightKeywords}
        keywords={debouncedQuery}
      />
    </>
  );
};

export default UniversalSearch;

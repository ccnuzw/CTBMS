import { useState, useMemo, useEffect, useCallback } from 'react';
import { useDictionaries } from '@/hooks/useDictionaries';
import { useDebounce } from '@/hooks/useDebounce';
import { useUniversalSearch, useGenerateInsight, useSearchSuggestions } from '../../api/hooks';
import { INTEL_SOURCE_TYPE_LABELS } from '../../types';
import { TimeRange, SentimentFilter, SortOption, EXPANDED_KEY, SEARCH_HISTORY_KEY, SAVED_SEARCHES_KEY, SavedSearch } from './types';
import { stripHtml } from './utils';
import * as XLSX from 'xlsx';
import { SearchResultItem } from '../SearchResultDetail';

export const useUniversalSearchViewModel = () => {
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
    const [sortBy, setSortBy] = useState<SortOption>('time_desc');
    const [showHelp, setShowHelp] = useState(false);
    const [selectedItem, setSelectedItem] = useState<SearchResultItem | null>(null);

    const [expandedSection, setExpandedSection] = useState<'price' | 'doc' | 'intel' | null>(() => {
        try {
            return (localStorage.getItem(EXPANDED_KEY) as 'price' | 'doc' | 'intel' | null) || null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        try {
            if (expandedSection) localStorage.setItem(EXPANDED_KEY, expandedSection);
            else localStorage.removeItem(EXPANDED_KEY);
        } catch {
            // ignore localStorage failures
        }
    }, [expandedSection]);

    const debouncedQuery = useDebounce(query, 300);

    const [searchHistory, setSearchHistory] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const { data: suggestionsData } = useSearchSuggestions(query, { enabled: query.length >= 1 });
    const suggestions = suggestionsData?.suggestions || [];

    const addToHistory = useCallback((term: string) => {
        setSearchHistory((prev) => {
            if (!term || term.length < 2) return prev;
            if (prev.length > 0 && prev[0] === term.trim()) return prev;
            const updated = [term.trim(), ...prev.filter((h) => h !== term.trim())].slice(0, 10);
            try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated)); } catch {
                // ignore localStorage failures
            }
            return updated;
        });
    }, []);

    useEffect(() => {
        if (debouncedQuery && debouncedQuery.length >= 2) {
            addToHistory(debouncedQuery);
        }
    }, [debouncedQuery, addToHistory]);

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
        const updated = [newSearch, ...savedSearches.filter((s) => s.keyword !== debouncedQuery)].slice(0, 10);
        setSavedSearches(updated);
        try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated)); } catch {
            // ignore localStorage failures
        }
    }, [debouncedQuery, dateRange, sentimentFilter, savedSearches]);

    const deleteSavedSearch = useCallback((id: string) => {
        const updated = savedSearches.filter((s) => s.id !== id);
        setSavedSearches(updated);
        try { localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated)); } catch {
            // ignore localStorage failures
        }
    }, [savedSearches]);

    const loadSavedSearch = useCallback((search: SavedSearch) => {
        setQuery(search.keyword);
        setDateRange(search.dateRange);
        setSentimentFilter(search.sentiment);
    }, []);

    const startDate = useMemo(() => {
        if (dateRange === 'ALL') return undefined;
        const now = new Date();
        switch (dateRange) {
            case '24H': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            case '7D': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case '30D': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            default: return undefined;
        }
    }, [dateRange]);

    const toggleExpand = (section: 'price' | 'doc' | 'intel') => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    const { data: searchResult, isLoading: isSearching } = useUniversalSearch(
        { keyword: debouncedQuery, startDate, sentiment: sentimentFilter === 'ALL' ? undefined : sentimentFilter },
        { enabled: !!debouncedQuery && debouncedQuery.length >= 2 }
    );

    const prices = searchResult?.prices?.data || [];
    const intels = searchResult?.intels?.data || [];
    const docs = searchResult?.docs?.data || [];

    const combinedResults = useMemo(() => [...intels, ...docs], [intels, docs]);
    const hasResults = prices.length > 0 || intels.length > 0 || docs.length > 0;

    const chartData = useMemo(() => prices
        .sort((a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime())
        .map((p) => ({
            date: new Date(p.effectiveDate).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
            price: p.price,
            location: p.location,
        })), [prices]);

    const { groupedChartData, uniqueLocations } = useMemo(() => {
        const locations = [...new Set(prices.map((p) => p.location))].slice(0, 5);
        const dateMap = new Map<string, Record<string, number>>();
        prices.forEach((p) => {
            const dateKey = new Date(p.effectiveDate).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
            if (!dateMap.has(dateKey)) dateMap.set(dateKey, { date: dateKey } as unknown as Record<string, number>);
            const entry = dateMap.get(dateKey)!;
            entry[p.location] = p.price;
        });
        return {
            groupedChartData: Array.from(dateMap.values()).sort((a, b) => (a as unknown as { date: string }).date.localeCompare((b as unknown as { date: string }).date)),
            uniqueLocations: locations,
        };
    }, [prices]);

    const priceRange = useMemo(() => chartData.length > 0 ? `${Math.min(...chartData.map((d) => d.price))} - ${Math.max(...chartData.map((d) => d.price))}` : '--', [chartData]);

    const sentimentTrendData = useMemo(() => {
        const dateMap = new Map<string, { date: string; positive: number; negative: number; neutral: number }>();
        [...intels, ...docs].forEach((item) => {
            const dateKey = new Date(item.effectiveTime).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
            if (!dateMap.has(dateKey)) dateMap.set(dateKey, { date: dateKey, positive: 0, negative: 0, neutral: 0 });
            const entry = dateMap.get(dateKey)!;
            const sentiment = item.aiAnalysis?.sentiment || 'neutral';
            if (sentiment === 'positive') entry.positive++;
            else if (sentiment === 'negative') entry.negative++;
            else entry.neutral++;
        });
        return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [intels, docs]);

    const wordCloudData = useMemo(() => {
        const tagCount = new Map<string, number>();
        [...intels, ...docs].forEach((item) => {
            item.aiAnalysis?.tags?.forEach((tag) => {
                if (tag && !tag.toLowerCase().includes(query.toLowerCase())) {
                    tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
                }
            });
        });
        return Array.from(tagCount.entries()).map(([text, value]) => ({ text, value })).sort((a, b) => b.value - a.value).slice(0, 20);
    }, [intels, docs, query]);

    const searchStats = useMemo(() => {
        const positiveCount = [...intels, ...docs].filter((i) => i.aiAnalysis?.sentiment === 'positive').length;
        const negativeCount = [...intels, ...docs].filter((i) => i.aiAnalysis?.sentiment === 'negative').length;
        const priceMin = prices.length > 0 ? Math.min(...prices.map((p) => p.price)) : 0;
        const priceMax = prices.length > 0 ? Math.max(...prices.map((p) => p.price)) : 0;
        const uniqueCommodities = [...new Set(prices.map((p) => p.commodity))];
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
    }, [prices, intels, docs, uniqueLocations]);

    const sortedIntels = useMemo(() => {
        const sorted = [...intels];
        if (sortBy === 'time_desc') sorted.sort((a, b) => new Date(b.effectiveTime).getTime() - new Date(a.effectiveTime).getTime());
        else if (sortBy === 'time_asc') sorted.sort((a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime());
        return sorted;
    }, [intels, sortBy]);

    const sortedDocs = useMemo(() => {
        const sorted = [...docs];
        if (sortBy === 'time_desc') sorted.sort((a, b) => new Date(b.effectiveTime).getTime() - new Date(a.effectiveTime).getTime());
        else if (sortBy === 'time_asc') sorted.sort((a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime());
        return sorted;
    }, [docs, sortBy]);

    const relatedTags = useMemo(() => {
        const tags = new Map<string, number>();
        combinedResults.forEach((c) => {
            if (c.aiAnalysis) {
                c.aiAnalysis.tags.forEach((t) => { if (!t.toLowerCase().includes(query.toLowerCase())) tags.set(t, (tags.get(t) || 0) + 1); });
                c.aiAnalysis.entities?.forEach((e) => { if (!e.toLowerCase().includes(query.toLowerCase())) tags.set(e, (tags.get(e) || 0) + 1); });
            }
        });
        return Array.from(tags.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [combinedResults, query]);

    const insightMutation = useGenerateInsight();
    const handleAiRefresh = useCallback(() => {
        if (!combinedResults.length) return;
        const statsSummary = [
            `搜索关键词：${debouncedQuery}`,
            `结果总数：${searchStats.totalResults}`,
            `价格区间：${searchStats.priceMin} - ${searchStats.priceMax}`,
            `情感分布：利好 ${searchStats.positiveCount} / 利空 ${searchStats.negativeCount}`,
            `涉及品种：${searchStats.commodities.slice(0, 5).join(', ')}`,
            `主要产区：${searchStats.locations.slice(0, 5).join(', ')}`,
        ].join('\n');
        const topIntels = sortedIntels.slice(0, 8).map((r) => `[${new Date(r.effectiveTime).toLocaleDateString()}] ${r.rawContent.substring(0, 100)}... (情感:${r.aiAnalysis?.sentiment || '中性'})`).join('\n');
        const topDocs = sortedDocs.slice(0, 3).map((r) => {
            const docTitle = stripHtml(r.rawContent || '').split('\n')[0]?.slice(0, 24) || '文档';
            const summary = r.aiAnalysis?.summary || stripHtml(r.rawContent).substring(0, 50);
            return `[${new Date(r.effectiveTime).toLocaleDateString()}] 《${docTitle}》：${summary}...`;
        }).join('\n');
        insightMutation.mutate({ content: `关键词：${debouncedQuery}\n时间范围：${dateRange}\n\n【统计数据】\n${statsSummary}\n\n【精选情报】\n${topIntels}\n\n【相关研报】\n${topDocs}`.trim() });
    }, [combinedResults, debouncedQuery, dateRange, searchStats, sortedIntels, sortedDocs, insightMutation]);

    const aiSummaryResult = insightMutation.data ? { summary: insightMutation.data.summary } : undefined;
    const isSummarizing = insightMutation.isPending;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && query) { setQuery(''); e.preventDefault(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [query]);

    const handleExport = useCallback(() => {
        if (!hasResults) return;
        const wb = XLSX.utils.book_new();
        if (prices.length > 0) {
            const priceSheet = XLSX.utils.json_to_sheet(prices.map((p) => ({ 日期: new Date(p.effectiveDate).toLocaleDateString('zh-CN'), 采集点: p.location, 品种: p.commodity, 价格: p.price, 单位: '元/吨' })));
            XLSX.utils.book_append_sheet(wb, priceSheet, '价格数据');
        }
        if (intels.length > 0) {
            const intelSheet = XLSX.utils.json_to_sheet(intels.map((i) => ({ 日期: new Date(i.effectiveTime).toLocaleDateString('zh-CN'), 摘要: i.aiAnalysis?.summary || stripHtml(i.rawContent).substring(0, 100), 情感: i.aiAnalysis?.sentiment === 'positive' ? '利好' : i.aiAnalysis?.sentiment === 'negative' ? '利空' : '中性', 来源: i.author?.name || '-' })));
            XLSX.utils.book_append_sheet(wb, intelSheet, '市场情报');
        }
        if (docs.length > 0) {
            const docSheet = XLSX.utils.json_to_sheet(docs.map((d) => ({ 日期: new Date(d.effectiveTime).toLocaleDateString('zh-CN'), 标题: stripHtml(d.rawContent).substring(0, 50), 摘要: d.aiAnalysis?.summary || '-', 来源: d.author?.name || '-' })));
            XLSX.utils.book_append_sheet(wb, docSheet, '研究文档');
        }
        if (aiSummaryResult?.summary) {
            const summarySheet = XLSX.utils.json_to_sheet([{ 类型: 'AI 综述', 内容: aiSummaryResult.summary }]);
            XLSX.utils.book_append_sheet(wb, summarySheet, 'AI综述');
        }
        XLSX.writeFile(wb, `全景检索_${debouncedQuery}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }, [prices, intels, docs, aiSummaryResult, debouncedQuery, hasResults]);

    return {
        state: {
            query, showFilters, dateRange, sentimentFilter, sortBy, showHelp, selectedItem, expandedSection,
            debouncedQuery, searchHistory, suggestions, savedSearches, prices, intels, docs, hasResults,
            chartData, groupedChartData, uniqueLocations, priceRange, sentimentTrendData, wordCloudData,
            searchStats, sortedIntels, sortedDocs, relatedTags, aiSummaryResult, isSummarizing,
            sourceTypeLabels
        },
        actions: {
            setQuery, setShowFilters, setDateRange, setSentimentFilter, setSortBy, setShowHelp, setSelectedItem,
            toggleExpand, saveCurrentSearch, deleteSavedSearch, loadSavedSearch, handleAiRefresh, handleExport,
            setSearchHistory
        }
    };
};

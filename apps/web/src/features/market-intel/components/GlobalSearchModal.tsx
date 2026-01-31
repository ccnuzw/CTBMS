import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Input, List, Typography, Tag, Flex, Empty, Spin, theme, Space } from 'antd';
import {
    SearchOutlined,
    FileTextOutlined,
    FileSearchOutlined,
    ClockCircleOutlined,
    EnterOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMarketIntels, useResearchReports } from '../api/hooks';
import { IntelCategory, ReviewStatus } from '@packages/types';
import { stripHtml } from '@packages/utils';

const { Text, Paragraph } = Typography;

interface SearchResult {
    id: string;
    title: string;
    summary: string;
    type: 'document' | 'report';
    date: string;
    tags: string[];
    url: string;
}

interface GlobalSearchModalProps {
    open: boolean;
    onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ open, onClose }) => {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Fetch data
    const { data: intelsResult, isLoading: docsLoading } = useMarketIntels({
        category: IntelCategory.C_DOCUMENT,
        pageSize: 100,
    });

    const { data: reportsResult, isLoading: reportsLoading } = useResearchReports({
        pageSize: 100,
        reviewStatus: ReviewStatus.APPROVED,
    });

    const isLoading = docsLoading || reportsLoading;

    // Transform to search results
    const allResults: SearchResult[] = useMemo(() => {
        const docs: SearchResult[] = (intelsResult?.data || []).map((intel) => ({
            id: intel.id,
            title: stripHtml(intel.rawContent || '').split('\n')[0]?.substring(0, 50) || '未命名文档',
            summary: stripHtml(intel.summary || intel.aiAnalysis?.summary || '').substring(0, 100),
            type: 'document' as const,
            date: intel.effectiveTime as unknown as string,
            tags: intel.aiAnalysis?.tags || [],
            url: `/intel/knowledge?tab=library&content=documents`,
        }));

        const reports: SearchResult[] = (reportsResult?.data || []).map((report) => ({
            id: report.id,
            title: report.title,
            summary: stripHtml(report.summary || '').substring(0, 100),
            type: 'report' as const,
            date: String(report.publishDate || report.createdAt),
            tags: report.commodities || [],
            url: `/intel/knowledge/reports/${report.id}`,
        }));

        return [...docs, ...reports].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    }, [intelsResult, reportsResult]);

    // Filter results based on search term
    const filteredResults = useMemo(() => {
        if (!searchTerm.trim()) {
            return allResults.slice(0, 10); // Show recent items when no search
        }

        const term = searchTerm.toLowerCase();
        return allResults
            .filter((result) =>
                result.title.toLowerCase().includes(term) ||
                result.summary.toLowerCase().includes(term) ||
                result.tags.some(tag => tag.toLowerCase().includes(term))
            )
            .slice(0, 20);
    }, [allResults, searchTerm]);

    // Reset selection when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [filteredResults]);

    // Reset search when modal closes
    useEffect(() => {
        if (!open) {
            setSearchTerm('');
            setSelectedIndex(0);
        }
    }, [open]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, filteredResults.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredResults[selectedIndex]) {
                    handleSelect(filteredResults[selectedIndex]);
                }
                break;
            case 'Escape':
                onClose();
                break;
        }
    }, [filteredResults, selectedIndex, onClose]);

    const handleSelect = (result: SearchResult) => {
        navigate(result.url);
        onClose();
    };

    const highlightMatch = (text: string, term: string) => {
        if (!term.trim()) return text;
        const regex = new RegExp(`(${term})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
            regex.test(part) ? (
                <span key={i} style={{ backgroundColor: token.colorWarningBg, fontWeight: 500 }}>
                    {part}
                </span>
            ) : (
                part
            )
        );
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            closable={false}
            width={640}
            styles={{
                body: { padding: 0 },
                content: { borderRadius: 12, overflow: 'hidden' }
            }}
            style={{ top: 100 }}
        >
            <div onKeyDown={handleKeyDown}>
                {/* Search Input */}
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                    <Input
                        ref={(input) => input?.focus()}
                        prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
                        placeholder="搜索文档、研报..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        bordered={false}
                        size="large"
                        style={{ fontSize: 16 }}
                        autoFocus
                    />
                </div>

                {/* Results */}
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                    {isLoading ? (
                        <Flex justify="center" align="center" style={{ padding: 40 }}>
                            <Spin />
                        </Flex>
                    ) : filteredResults.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={searchTerm ? '未找到相关内容' : '暂无内容'}
                            style={{ padding: 40 }}
                        />
                    ) : (
                        <List
                            dataSource={filteredResults}
                            renderItem={(item, index) => (
                                <List.Item
                                    onClick={() => handleSelect(item)}
                                    style={{
                                        padding: '12px 20px',
                                        cursor: 'pointer',
                                        backgroundColor: index === selectedIndex ? token.colorBgTextHover : undefined,
                                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                >
                                    <Flex gap={12} align="flex-start" style={{ width: '100%' }}>
                                        <div style={{
                                            padding: 8,
                                            borderRadius: 6,
                                            backgroundColor: item.type === 'report' ? token.colorPrimaryBg : token.colorSuccessBg,
                                        }}>
                                            {item.type === 'report' ? (
                                                <FileSearchOutlined style={{ color: token.colorPrimary }} />
                                            ) : (
                                                <FileTextOutlined style={{ color: token.colorSuccess }} />
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <Text strong style={{ display: 'block' }}>
                                                {highlightMatch(item.title, searchTerm)}
                                            </Text>
                                            <Paragraph
                                                type="secondary"
                                                ellipsis={{ rows: 1 }}
                                                style={{ margin: '4px 0', fontSize: 12 }}
                                            >
                                                {highlightMatch(item.summary, searchTerm) || '暂无摘要'}
                                            </Paragraph>
                                            <Flex gap={8} align="center">
                                                <Tag color={item.type === 'report' ? 'purple' : 'blue'} style={{ fontSize: 10 }}>
                                                    {item.type === 'report' ? '研报' : '文档'}
                                                </Tag>
                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                                                    {new Date(item.date).toLocaleDateString()}
                                                </Text>
                                            </Flex>
                                        </div>
                                        {index === selectedIndex && (
                                            <EnterOutlined style={{ color: token.colorTextSecondary }} />
                                        )}
                                    </Flex>
                                </List.Item>
                            )}
                        />
                    )}
                </div>

                {/* Footer hints */}
                <div style={{
                    padding: '8px 20px',
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    backgroundColor: token.colorBgLayout,
                }}>
                    <Flex justify="space-between" align="center">
                        <Space size={16}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <kbd style={{
                                    padding: '2px 6px',
                                    background: token.colorBgContainer,
                                    border: `1px solid ${token.colorBorder}`,
                                    borderRadius: 4,
                                    fontSize: 11,
                                }}>↑↓</kbd>
                                {' '}导航
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <kbd style={{
                                    padding: '2px 6px',
                                    background: token.colorBgContainer,
                                    border: `1px solid ${token.colorBorder}`,
                                    borderRadius: 4,
                                    fontSize: 11,
                                }}>Enter</kbd>
                                {' '}打开
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                <kbd style={{
                                    padding: '2px 6px',
                                    background: token.colorBgContainer,
                                    border: `1px solid ${token.colorBorder}`,
                                    borderRadius: 4,
                                    fontSize: 11,
                                }}>Esc</kbd>
                                {' '}关闭
                            </Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {filteredResults.length} 个结果
                        </Text>
                    </Flex>
                </div>
            </div>
        </Modal>
    );
};

// Hook to use global search with keyboard shortcut
export const useGlobalSearch = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + K
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return {
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
    };
};

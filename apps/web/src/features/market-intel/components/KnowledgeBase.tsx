import React, { useState, useMemo } from 'react';
import {
    Card,
    Typography,
    Input,
    Button,
    Tag,
    Flex,
    Empty,
    Drawer,
    Space,
    Badge,
    Descriptions,
    theme,
    Row,
    Col,
    Checkbox,
    Spin,
    Alert,
} from 'antd';
import {
    SearchOutlined,
    FilterOutlined,
    DownloadOutlined,
    FileTextOutlined,
    ClockCircleOutlined,
    BankOutlined,
    SafetyOutlined,
    FileExcelOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import { useMarketIntels, useSearchAttachments } from '../api/hooks';
import { IntelCategory, IntelSourceType } from '@packages/types';

const { Title, Text, Paragraph } = Typography;

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | 'ALL';

// 来源类型标签
const INTEL_SOURCE_TYPE_LABELS: Record<string, string> = {
    FIRST_LINE: '一线采集',
    COMPETITOR: '竞对情报',
    OFFICIAL: '官方发布',
};

// 文档响应类型
interface DocItem {
    id: string;
    category: string;
    sourceType: string;
    rawContent: string;
    summary: string | null;
    aiAnalysis: any;
    effectiveTime: string;
    author: { id: string; name: string } | null;
}

export const KnowledgeBase: React.FC = () => {
    const { token } = theme.useToken();

    // 状态
    const [searchTerm, setSearchTerm] = useState('');
    const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
    const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

    // 计算时间范围
    const dateRange = useMemo(() => {
        const now = new Date();
        const startDate = new Date();

        switch (timeRange) {
            case '1M':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case '3M':
                startDate.setMonth(now.getMonth() - 3);
                break;
            case '6M':
                startDate.setMonth(now.getMonth() - 6);
                break;
            case 'YTD':
                startDate.setMonth(0);
                startDate.setDate(1);
                break;
            case 'ALL':
                startDate.setFullYear(2000);
                break;
        }

        return { startDate, endDate: now };
    }, [timeRange]);

    // API 调用 - 获取 C 类文档
    const { data: intelsResult, isLoading } = useMarketIntels({
        category: IntelCategory.C_DOCUMENT,
        pageSize: 100,
    });

    // OCR 全文搜索
    const { data: ocrSearchResults } = useSearchAttachments(searchTerm, 50);

    const allDocs: DocItem[] = useMemo(() => {
        return (intelsResult?.data || []).map((intel) => ({
            id: intel.id,
            category: intel.category,
            sourceType: intel.sourceType,
            rawContent: intel.rawContent,
            summary: intel.summary || null,
            aiAnalysis: intel.aiAnalysis || {},
            effectiveTime: intel.effectiveTime as unknown as string,
            author: intel.author || null,
        }));
    }, [intelsResult]);

    // 标签云
    const tagCloud = useMemo(() => {
        const counts: Record<string, number> = {};
        allDocs.forEach((doc) => {
            const tags = doc.aiAnalysis?.tags || [];
            tags.forEach((tag: string) => {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [allDocs]);

    // 筛选
    const filteredDocs = useMemo(() => {
        return allDocs.filter((doc) => {
            // 搜索
            const matchesSearch =
                searchTerm === '' ||
                doc.rawContent.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (doc.summary?.toLowerCase() || '').includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            // 时间筛选
            const docDate = new Date(doc.effectiveTime);
            if (docDate < dateRange.startDate) return false;

            // 来源筛选
            if (selectedSources.size > 0 && !selectedSources.has(doc.sourceType)) {
                return false;
            }

            // 标签筛选
            if (selectedTags.size > 0) {
                const hasTag = (doc.aiAnalysis?.tags || []).some((t: string) => selectedTags.has(t));
                if (!hasTag) return false;
            }

            return true;
        });
    }, [allDocs, searchTerm, dateRange, selectedSources, selectedTags]);

    const toggleSource = (source: string) => {
        const next = new Set(selectedSources);
        if (next.has(source)) next.delete(source);
        else next.add(source);
        setSelectedSources(next);
    };

    const toggleTag = (tag: string) => {
        const next = new Set(selectedTags);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        setSelectedTags(next);
    };

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
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 左侧边栏 */}
            <Card
                style={{ width: 280, height: '100%', overflow: 'auto', borderRadius: 0 }}
                bodyStyle={{ padding: 16 }}
            >
                <Title level={5}>
                    <FilterOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                    知识库索引 (Index)
                </Title>
                <Text type="secondary" style={{ fontSize: 11 }}>
                    已归档 {allDocs.length} 份文件
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
                        {[IntelSourceType.OFFICIAL, IntelSourceType.COMPETITOR, IntelSourceType.FIRST_LINE].map(
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
                                        <Text style={{ fontSize: 12 }}>{INTEL_SOURCE_TYPE_LABELS[source]}</Text>
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

            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* 搜索栏 */}
                <Card style={{ borderRadius: 0 }} bodyStyle={{ padding: '16px 24px' }}>
                    <Flex justify="space-between" align="center">
                        <div>
                            <Title level={4} style={{ margin: 0 }}>
                                商情知识库 (Repository)
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                当前展示 {filteredDocs.length} 份文档 • 支持 OCR 全文检索
                            </Text>
                        </div>
                        <Input
                            prefix={<SearchOutlined />}
                            placeholder="搜索标题、摘要或OCR原文..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: 300 }}
                            allowClear
                        />
                    </Flex>
                </Card>

                {/* 文档列表 */}
                <div style={{ flex: 1, overflow: 'auto', padding: 24, background: token.colorBgLayout }}>
                    {isLoading ? (
                        <Flex vertical justify="center" align="center" gap={16} style={{ height: 200 }}>
                            <Spin size="large" />
                            <Text type="secondary">加载中...</Text>
                        </Flex>
                    ) : filteredDocs.length > 0 ? (
                        <Row gutter={[16, 16]}>
                            {filteredDocs.map((doc) => (
                                <Col key={doc.id} xs={24} xl={12}>
                                    <Card
                                        hoverable
                                        onClick={() => setPreviewDoc(doc)}
                                        style={{
                                            borderColor: previewDoc?.id === doc.id ? token.colorPrimary : undefined,
                                        }}
                                    >
                                        <Flex gap={16}>
                                            <div
                                                style={{
                                                    padding: 12,
                                                    borderRadius: token.borderRadius,
                                                    background:
                                                        doc.sourceType === IntelSourceType.OFFICIAL
                                                            ? token.colorErrorBg
                                                            : doc.sourceType === IntelSourceType.COMPETITOR
                                                                ? token.colorWarningBg
                                                                : token.colorPrimaryBg,
                                                }}
                                            >
                                                {getSourceIcon(doc.sourceType)}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Text strong style={{ display: 'block' }}>
                                                    {doc.rawContent.split('\n')[0]?.replace(/[\[\]]/g, '') || '未命名文档'}
                                                </Text>
                                                <Paragraph
                                                    type="secondary"
                                                    ellipsis={{ rows: 2 }}
                                                    style={{ margin: '8px 0', fontSize: 12 }}
                                                >
                                                    <Text strong>摘要:</Text> {doc.summary || doc.aiAnalysis?.summary || '暂无摘要'}
                                                </Paragraph>
                                                <Flex gap={12}>
                                                    <Tag style={{ fontSize: 10 }}>
                                                        {new Date(doc.effectiveTime).toLocaleDateString()}
                                                    </Tag>
                                                    <Tag style={{ fontSize: 10 }}>{INTEL_SOURCE_TYPE_LABELS[doc.sourceType]}</Tag>
                                                </Flex>
                                            </div>
                                            <EyeOutlined style={{ color: token.colorTextSecondary }} />
                                        </Flex>
                                    </Card>
                                </Col>
                            ))}
                        </Row>
                    ) : (
                        <Empty
                            description={
                                <Space direction="vertical">
                                    <Text>未找到符合条件的文档</Text>
                                    <Button
                                        type="link"
                                        onClick={() => {
                                            setSearchTerm('');
                                            setTimeRange('ALL');
                                            setSelectedSources(new Set());
                                            setSelectedTags(new Set());
                                        }}
                                    >
                                        清除所有筛选
                                    </Button>
                                </Space>
                            }
                        />
                    )}
                </div>
            </Flex>

            {/* 文档预览抽屉 */}
            <Drawer
                title={
                    <Flex align="center" gap={8}>
                        <Tag color={previewDoc?.sourceType === IntelSourceType.OFFICIAL ? 'error' : 'blue'}>
                            {previewDoc ? INTEL_SOURCE_TYPE_LABELS[previewDoc.sourceType] : ''}
                        </Tag>
                        <Text strong style={{ maxWidth: 300 }}>
                            {previewDoc?.rawContent?.split('\n')[0] || '文档详情'}
                        </Text>
                    </Flex>
                }
                open={!!previewDoc}
                onClose={() => setPreviewDoc(null)}
                width={500}
                extra={
                    <Button icon={<DownloadOutlined />} type="primary">
                        下载原件
                    </Button>
                }
            >
                {previewDoc && (
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        {/* AI 核心摘要 */}
                        <Card
                            size="small"
                            style={{ background: `${token.colorPrimary}08`, borderColor: token.colorPrimaryBorder }}
                        >
                            <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                                <FileTextOutlined style={{ marginRight: 4 }} />
                                AI 核心摘要
                            </Text>
                            <Paragraph strong style={{ marginTop: 8, marginBottom: 0 }}>
                                {previewDoc.summary || previewDoc.aiAnalysis?.summary || '暂无摘要'}
                            </Paragraph>
                            <Flex wrap="wrap" gap={8} style={{ marginTop: 12 }}>
                                {(previewDoc.aiAnalysis?.tags || []).map((tag: string) => (
                                    <Tag key={tag} color="blue">
                                        {tag}
                                    </Tag>
                                ))}
                            </Flex>
                        </Card>

                        {/* 文档原文 */}
                        <div>
                            <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase' }}>
                                文档原文 / OCR 识别结果
                            </Text>
                            <Card
                                size="small"
                                style={{
                                    marginTop: 8,
                                    background: token.colorBgTextHover,
                                    maxHeight: 400,
                                    overflow: 'auto',
                                }}
                            >
                                <pre
                                    style={{
                                        fontSize: 12,
                                        margin: 0,
                                        whiteSpace: 'pre-wrap',
                                        fontFamily: 'monospace',
                                    }}
                                >
                                    {previewDoc.rawContent}
                                </pre>
                            </Card>
                        </div>

                        <Text type="secondary" style={{ fontSize: 11 }}>
                            ID: {previewDoc.id.substring(0, 8)}
                        </Text>
                    </Space>
                )}
            </Drawer>
        </Flex>
    );
};

export default KnowledgeBase;

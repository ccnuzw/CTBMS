import React, { useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Flex, Select, Space, Spin, Tag, Typography } from 'antd';
import { ApartmentOutlined, DatabaseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../api/client';
import type { ConversationEvidenceItem } from '../api/conversations';
import { useConversationResult } from '../api/conversations';
import { parseResultData } from './copilotChatConstants';

const { Text } = Typography;

/** 血缘 API 返回结构（与后端 MarketDataService.getLineage 对齐） */
interface LineageResponse {
    dataset: string;
    recordId: string;
    source: Record<string, unknown>;
    mapping: {
        mappingVersion: string;
        schemaVersion: string;
        lineageVersion: string;
        ruleSetId: string;
        metricVersions: Record<string, string>;
    };
    derivedMetrics: string[];
    timestamps: {
        dataTime: string;
        updatedAt: string;
    };
}

const datasetLabel: Record<string, string> = {
    SPOT_PRICE: '现货价格',
    FUTURES_QUOTE: '期货行情',
    MARKET_EVENT: '市场事件',
};

const useMarketDataLineage = (dataset?: string, recordId?: string) =>
    useQuery<LineageResponse>({
        queryKey: ['market-data', 'lineage', dataset, recordId],
        queryFn: async () => {
            const res = await apiClient.get<LineageResponse>('/market-data/lineage', {
                params: { dataset, recordId },
            });
            return res.data;
        },
        enabled: Boolean(dataset && recordId),
    });

interface DataLineagePanelProps {
    sessionId: string | null;
}

/**
 * 数据血缘可视化面板（PRD FR-DATA-009）
 *
 * 从结果中的证据条目提取 sourceNodeId，
 * 查询血缘 API 展示"来源 → 映射 → 标准层 → 衍生指标"链路。
 */
export const DataLineagePanel: React.FC<DataLineagePanelProps> = ({ sessionId }) => {
    const resultQuery = useConversationResult(sessionId ?? undefined);
    const resultData = parseResultData(resultQuery.data?.result as Record<string, unknown> | null);

    const evidenceItems: ConversationEvidenceItem[] = resultData?.evidenceItems ?? [];

    // 从证据中提取可追溯的 sourceNodeId
    const traceableItems = evidenceItems.filter((e) => e.sourceNodeId);

    const [selectedIndex, setSelectedIndex] = useState(0);
    const selected = traceableItems[selectedIndex];

    // 简单映射：从 source 推断 dataset
    const inferDataset = (source: string): string => {
        const lower = source.toLowerCase();
        if (lower.includes('price') || lower.includes('spot') || lower.includes('现货')) return 'SPOT_PRICE';
        if (lower.includes('futures') || lower.includes('期货')) return 'FUTURES_QUOTE';
        return 'MARKET_EVENT';
    };

    const dataset = selected ? inferDataset(selected.source) : undefined;
    const recordId = selected?.sourceNodeId ?? undefined;

    const lineageQuery = useMarketDataLineage(dataset, recordId ?? undefined);

    if (!sessionId) {
        return <Alert type="info" showIcon message="请先选择会话后再查看数据血缘" />;
    }

    if (resultQuery.isLoading) {
        return (
            <Flex justify="center" style={{ padding: 24 }}>
                <Spin size="small" />
            </Flex>
        );
    }

    if (traceableItems.length === 0) {
        return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前结果中无可追溯的数据来源" />;
    }

    const lineage = lineageQuery.data;

    return (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card
                size="small"
                title={
                    <Space size={6}>
                        <ApartmentOutlined />
                        <span>数据血缘追踪</span>
                    </Space>
                }
                extra={
                    <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => void lineageQuery.refetch()}
                    >
                        刷新
                    </Button>
                }
            >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8}>
                        <Text type="secondary">选择证据来源：</Text>
                        <Select
                            size="small"
                            value={selectedIndex}
                            style={{ width: 240 }}
                            options={traceableItems.map((item, idx) => ({
                                label: `${item.title} (${item.source})`,
                                value: idx,
                            }))}
                            onChange={setSelectedIndex}
                        />
                    </Space>

                    {selected ? (
                        <Space size={[6, 6]} wrap>
                            <Tag color="blue">{selected.source}</Tag>
                            <Tag>{datasetLabel[inferDataset(selected.source)] ?? '未知数据集'}</Tag>
                            <Tag color="geekblue">节点 ID: {selected.sourceNodeId}</Tag>
                        </Space>
                    ) : null}
                </Space>
            </Card>

            {lineageQuery.isLoading ? (
                <Flex justify="center" style={{ padding: 16 }}>
                    <Spin size="small" tip="加载血缘..." />
                </Flex>
            ) : lineageQuery.isError ? (
                <Alert type="warning" showIcon message="血缘查询失败，该记录可能不支持血缘追溯。" />
            ) : lineage ? (
                <>
                    {/* 来源信息 */}
                    <Card
                        size="small"
                        title={
                            <Space>
                                <DatabaseOutlined style={{ color: '#1677ff' }} />
                                <span>来源追溯</span>
                            </Space>
                        }
                    >
                        <Descriptions size="small" column={2} bordered>
                            <Descriptions.Item label="数据集">
                                <Tag color="blue">{datasetLabel[lineage.dataset] ?? lineage.dataset}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="记录 ID">
                                <Text copyable style={{ fontSize: 12 }}>{lineage.recordId}</Text>
                            </Descriptions.Item>
                            {Object.entries(lineage.source).map(([key, value]) => (
                                <Descriptions.Item key={key} label={key}>
                                    {String(value ?? '-')}
                                </Descriptions.Item>
                            ))}
                        </Descriptions>
                    </Card>

                    {/* 映射规则 */}
                    <Card
                        size="small"
                        title={
                            <Space>
                                <ApartmentOutlined style={{ color: '#52c41a' }} />
                                <span>映射规则</span>
                            </Space>
                        }
                    >
                        <Descriptions size="small" column={2} bordered>
                            <Descriptions.Item label="规则集">
                                <Tag>{lineage.mapping.ruleSetId}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="版本">
                                <Space size={4}>
                                    <Tag>映射 {lineage.mapping.mappingVersion}</Tag>
                                    <Tag>Schema {lineage.mapping.schemaVersion}</Tag>
                                    <Tag>血缘 {lineage.mapping.lineageVersion}</Tag>
                                </Space>
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>

                    {/* 衍生指标 */}
                    <Card size="small" title="衍生指标 & 版本">
                        <Space size={[8, 6]} wrap>
                            {lineage.derivedMetrics.map((metric) => (
                                <Tag key={metric} color="purple">
                                    {metric}
                                    <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
                                        {lineage.mapping.metricVersions[metric] ?? '?'}
                                    </Text>
                                </Tag>
                            ))}
                        </Space>
                    </Card>

                    {/* 时间戳 */}
                    <Card size="small" title="数据时间">
                        <Space size={16}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                数据时间：{new Date(lineage.timestamps.dataTime).toLocaleString('zh-CN')}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                更新时间：{new Date(lineage.timestamps.updatedAt).toLocaleString('zh-CN')}
                            </Text>
                        </Space>
                    </Card>
                </>
            ) : null}
        </Space>
    );
};

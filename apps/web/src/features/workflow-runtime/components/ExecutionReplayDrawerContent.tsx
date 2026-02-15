import React, { useEffect, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Col,
    Empty,
    Flex,
    Input,
    Row,
    Space,
    Tabs,
    Typography,
    theme,
    Spin,
} from 'antd';
import {
    PlayCircleOutlined,
    BarChartOutlined,
    NodeIndexOutlined,
} from '@ant-design/icons';
import { DebateReplayViewer } from '../../replay-evaluation/components/DebateReplayViewer';
import { ReplayTimeline } from '../../replay-evaluation/components/ReplayTimeline';
import { MetricsDashboard } from '../../replay-evaluation/components/MetricsDashboard';
import {
    useExecutionReplay,
    useExecutionComparison,
    useDebateTimeline,
} from '../../replay-evaluation/api/replayApi';
import { apiClient } from '@/api/client';

const { Text } = Typography;
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExecutionSearchPage = {
    data?: Array<{ id: string }>;
    total?: number;
};

interface ExecutionReplayDrawerContentProps {
    executionId: string;
}

export const ExecutionReplayDrawerContent: React.FC<ExecutionReplayDrawerContentProps> = ({
    executionId: initialExecutionId,
}) => {
    const { message } = App.useApp();
    const { token } = theme.useToken();

    const [activeTab, setActiveTab] = useState('replay');

    // For Comparison
    const [compareInputId, setCompareInputId] = useState('');
    const [compareId, setCompareId] = useState('');
    const [resolvingCompareId, setResolvingCompareId] = useState(false);

    const {
        data: replayBundle,
        isLoading: isReplayLoading,
        error: replayError,
    } = useExecutionReplay(initialExecutionId, !!initialExecutionId);

    const { data: debateTimeline, isLoading: isDebateLoading } = useDebateTimeline(
        initialExecutionId,
        !!initialExecutionId,
    );

    const {
        data: comparison,
        isLoading: isComparing,
        error: comparisonError,
    } = useExecutionComparison(initialExecutionId, compareId, !!initialExecutionId && !!compareId);

    const resolveExecutionId = async (rawId: string): Promise<string | null> => {
        const normalized = rawId.trim();
        if (!normalized) {
            return null;
        }
        if (UUID_PATTERN.test(normalized)) {
            return normalized;
        }

        const response = await apiClient.get<ExecutionSearchPage>('/workflow-executions', {
            params: {
                keyword: normalized,
                page: 1,
                pageSize: 50,
            },
        });
        const candidates = Array.isArray(response.data?.data) ? response.data.data : [];
        const prefixMatches = candidates.filter((item) => item.id.startsWith(normalized));

        if (prefixMatches.length === 1) {
            return prefixMatches[0].id;
        }
        if (prefixMatches.length > 1) {
            message.warning(`命中多个执行实例，请输入更长 ID（当前匹配 ${prefixMatches.length} 条）`);
            return null;
        }
        if (candidates.length === 1) {
            return candidates[0].id;
        }
        return null;
    };

    const handleCompareSearch = async () => {
        if (!initialExecutionId) {
            message.warning('主执行实例 ID 缺失');
            return;
        }

        const normalized = compareInputId.trim();
        if (!normalized) {
            setCompareId('');
            return;
        }

        setResolvingCompareId(true);
        try {
            const resolved = await resolveExecutionId(normalized);
            if (!resolved) {
                message.error('未找到可访问的对比实例，请确认 ID 是否完整');
                return;
            }

            if (resolved === initialExecutionId) {
                message.warning('对比实例不能与主实例相同');
                return;
            }

            if (resolved !== normalized) {
                message.info(`对比实例已解析为完整 ID: ${resolved}`);
            }
            setCompareId(resolved);
            setCompareInputId(resolved);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '加载对比执行实例失败';
            message.error(errorMessage);
        } finally {
            setResolvingCompareId(false);
        }
    };

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: 'replay',
                        label: (
                            <Space size={4}>
                                <NodeIndexOutlined />
                                <span>执行回放</span>
                            </Space>
                        ),
                        children: (
                            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                                {replayError ? (
                                    <Alert
                                        type="error"
                                        showIcon
                                        message="加载回放失败"
                                        description={
                                            replayError instanceof Error ? replayError.message : '请检查执行实例 ID'
                                        }
                                    />
                                ) : null}
                                {replayBundle && (
                                    <ReplayTimeline
                                        timeline={replayBundle.timeline}
                                        totalDurationMs={replayBundle.stats.totalDurationMs}
                                        isLoading={isReplayLoading}
                                    />
                                )}
                                {!isReplayLoading && !replayError && !replayBundle ? (
                                    <Card>
                                        <Empty description="未找到回放数据，请确认执行实例 ID 是否完整且有访问权限" />
                                    </Card>
                                ) : null}
                                {isReplayLoading && !replayBundle && <Card loading />}
                            </Space>
                        ),
                    },
                    {
                        key: 'metrics',
                        label: (
                            <Space size={4}>
                                <BarChartOutlined />
                                <span>指标看板</span>
                            </Space>
                        ),
                        children: replayBundle ? (
                            <MetricsDashboard
                                stats={replayBundle.stats}
                                evidenceBundle={replayBundle.evidenceBundle as Record<string, unknown>}
                                decisionOutput={replayBundle.decisionOutput as Record<string, unknown> | null}
                                isLoading={isReplayLoading}
                            />
                        ) : isReplayLoading ? (
                            <Card loading />
                        ) : null,
                    },
                    {
                        key: 'debate',
                        label: (
                            <Space size={4}>
                                <PlayCircleOutlined />
                                <span>辩论回放</span>
                            </Space>
                        ),
                        children: debateTimeline ? (
                            <DebateReplayViewer timeline={debateTimeline} isLoading={isDebateLoading} />
                        ) : isDebateLoading ? (
                            <Card loading />
                        ) : (
                            <Card>
                                <Empty description="当前执行无辩论数据" />
                            </Card>
                        ),
                    },
                    {
                        key: 'compare',
                        label: (
                            <Space size={4}>
                                <BarChartOutlined />
                                <span>执行对比</span>
                            </Space>
                        ),
                        children: (
                            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                                <Card size="small">
                                    <Flex align="center" gap={12}>
                                        <Text>对比执行 ID:</Text>
                                        <Input
                                            placeholder="输入另一个执行实例 ID"
                                            style={{ width: 280 }}
                                            value={compareInputId}
                                            onChange={(e) => setCompareInputId(e.target.value)}
                                            onPressEnter={handleCompareSearch}
                                            disabled={resolvingCompareId}
                                        />
                                        <Button
                                            type="primary"
                                            onClick={handleCompareSearch}
                                            loading={resolvingCompareId}
                                        >
                                            对比
                                        </Button>
                                        {compareId ? (
                                            <Button
                                                onClick={() => {
                                                    setCompareInputId('');
                                                    setCompareId('');
                                                }}
                                            >
                                                清空
                                            </Button>
                                        ) : null}
                                    </Flex>
                                </Card>
                                {comparisonError ? (
                                    <Alert
                                        type="error"
                                        showIcon
                                        message="加载执行对比失败"
                                        description={
                                            comparisonError instanceof Error
                                                ? comparisonError.message
                                                : '请检查两个执行实例 ID 是否完整'
                                        }
                                    />
                                ) : null}
                                {!compareId ? (
                                    <Card>
                                        <Empty description="请输入对比执行 ID 并点击“对比”" />
                                    </Card>
                                ) : null}
                                {!isComparing && !comparisonError && compareId && !comparison ? (
                                    <Card>
                                        <Empty description="未获取到对比结果，请检查实例是否可访问" />
                                    </Card>
                                ) : null}
                                {comparison && (
                                    <Row gutter={[16, 16]}>
                                        <Col xs={24} md={12}>
                                            <Card
                                                title={`执行 A: ${comparison.execA.execution.id.slice(0, 12)}...`}
                                                size="small"
                                            >
                                                <MetricsDashboard
                                                    stats={comparison.execA.stats}
                                                    isLoading={isComparing}
                                                />
                                            </Card>
                                        </Col>
                                        <Col xs={24} md={12}>
                                            <Card
                                                title={`执行 B: ${comparison.execB.execution.id.slice(0, 12)}...`}
                                                size="small"
                                            >
                                                <MetricsDashboard
                                                    stats={comparison.execB.stats}
                                                    isLoading={isComparing}
                                                />
                                            </Card>
                                        </Col>
                                    </Row>
                                )}
                                {isComparing && !comparison && compareId && <Card loading />}
                            </Space>
                        ),
                    },
                ]}
            />
        </Space>
    );
};

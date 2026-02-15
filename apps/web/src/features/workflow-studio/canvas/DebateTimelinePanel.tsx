import React, { useMemo, useState } from 'react';
import {
    Badge,
    Button,
    Card,
    Collapse,
    Empty,
    List,
    Space,
    Spin,
    Tag,
    Tooltip,
    Typography,
    theme,
} from 'antd';
import {
    BookOutlined,
    ClockCircleOutlined,
    CloseOutlined,
    CommentOutlined,
    DownOutlined,
    FileTextOutlined,
    SafetyCertificateOutlined,
    ThunderboltOutlined,
    UpOutlined,
    UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Line } from '@ant-design/plots';
import { useDebateTimeline } from '../api/debateTraceApi';
import { getAgentRoleLabel } from '../../workflow-agent-center/constants';
import type {
    DebateTimelineDto,
    DebateTimelineEntryDto,
    DebateRoundTraceDto,
} from '@packages/types';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface DebateTimelinePanelProps {
    executionId?: string;
    height?: number;
    onHeightChange?: (height: number) => void;
    onClose?: () => void;
}

// ── Confidence Trend Chart ──

const ConfidenceTrendChart: React.FC<{ rounds: DebateTimelineEntryDto[] }> = ({ rounds }) => {
    const { token } = theme.useToken();

    const chartData = useMemo(() => {
        return rounds
            .filter((r) => r.roundSummary.avgConfidence !== null)
            .map((r) => ({
                round: `R${r.roundNumber}`,
                avgConfidence: Number(((r.roundSummary.avgConfidence ?? 0) * 100).toFixed(1)),
                delta: r.roundSummary.confidenceDelta
                    ? Number((r.roundSummary.confidenceDelta * 100).toFixed(1))
                    : 0,
            }));
    }, [rounds]);

    if (chartData.length < 2) {
        return null;
    }

    return (
        <Card
            size="small"
            title={
                <Space>
                    <ThunderboltOutlined />
                    <Text strong style={{ fontSize: 13 }}>
                        置信度趋势
                    </Text>
                </Space>
            }
            style={{ marginBottom: 12 }}
            bodyStyle={{ padding: '8px 12px' }}
        >
            <Line
                data={chartData}
                xField="round"
                yField="avgConfidence"
                height={120}
                smooth
                point={{ size: 4 }}
                yAxis={{
                    min: 0,
                    max: 100,
                    label: { formatter: (v: string) => `${v}%` },
                }}
                tooltip={{
                    formatter: (datum: Record<string, unknown>) => ({
                        name: '平均置信度',
                        value: `${datum.avgConfidence}%`,
                    }),
                }}
                color={token.colorPrimary}
                annotations={[
                    {
                        type: 'line',
                        start: ['min', 70],
                        end: ['max', 70],
                        style: { stroke: token.colorSuccess, lineDash: [4, 4], lineWidth: 1 },
                    },
                ]}
            />
        </Card>
    );
};

// ── Evidence Refs Renderer ──

const EvidenceRefsBlock: React.FC<{ evidenceRefs?: Record<string, unknown> | null }> = ({
    evidenceRefs,
}) => {
    const { token } = theme.useToken();

    if (!evidenceRefs || Object.keys(evidenceRefs).length === 0) {
        return null;
    }

    const entries = Object.entries(evidenceRefs);

    return (
        <div
            style={{
                marginTop: 8,
                padding: 8,
                background: token.colorInfoBg,
                borderRadius: token.borderRadiusSM,
                borderLeft: `3px solid ${token.colorInfo}`,
            }}
        >
            <Space style={{ marginBottom: 4 }}>
                <BookOutlined style={{ color: token.colorInfo }} />
                <Text strong style={{ fontSize: 12, color: token.colorInfo }}>
                    证据引用
                </Text>
            </Space>
            <List
                size="small"
                split={false}
                dataSource={entries}
                renderItem={([key, value]) => (
                    <List.Item style={{ padding: '2px 0', border: 'none' }}>
                        <Space>
                            <Tag color="blue" style={{ fontSize: 11 }}>
                                {key}
                            </Tag>
                            <Text style={{ fontSize: 12 }}>
                                {typeof value === 'string' ? value : JSON.stringify(value)}
                            </Text>
                        </Space>
                    </List.Item>
                )}
            />
        </div>
    );
};

// ── Key Points Renderer ──

const KeyPointsBlock: React.FC<{ keyPoints?: string[] | null }> = ({ keyPoints }) => {
    const { token } = theme.useToken();

    if (!keyPoints || keyPoints.length === 0) {
        return null;
    }

    return (
        <div
            style={{
                marginTop: 6,
                padding: '4px 8px',
                background: token.colorFillAlter,
                borderRadius: token.borderRadiusSM,
            }}
        >
            <Text type="secondary" style={{ fontSize: 11 }}>
                <FileTextOutlined /> 要点:
            </Text>
            {keyPoints.map((point, idx) => (
                <Tag key={idx} style={{ marginTop: 4, fontSize: 11 }}>
                    {point}
                </Tag>
            ))}
        </div>
    );
};

// ── Main Component ──

export const DebateTimelinePanel: React.FC<DebateTimelinePanelProps> = ({
    executionId,
    height = 400,
    onHeightChange,
    onClose,
}) => {
    const { token } = theme.useToken();
    const { data: timelineData, isLoading } = useDebateTimeline(executionId || '');
    const [activeRound, setActiveRound] = useState<string | string[]>([]);

    if (!executionId) {
        return null;
    }

    const renderTraceEntry = (trace: DebateRoundTraceDto) => {
        const isJudge = trace.isJudgement;
        return (
            <Card
                size="small"
                key={trace.id}
                style={{
                    marginBottom: 8,
                    borderLeft: `4px solid ${isJudge ? token.colorWarning : token.colorPrimary}`,
                    opacity: 0.9,
                }}
                bodyStyle={{ padding: '8px 12px' }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space>
                        <Tag color={isJudge ? 'gold' : 'blue'}>
                            {isJudge ? <SafetyCertificateOutlined /> : <UserOutlined />}{' '}
                            {getAgentRoleLabel(trace.participantRole)}
                        </Tag>
                        <Text strong style={{ fontSize: 12 }}>
                            {trace.participantCode}
                        </Text>
                        {trace.confidence !== null && trace.confidence !== undefined && (
                            <Tooltip
                                title={
                                    trace.previousConfidence !== null && trace.previousConfidence !== undefined
                                        ? `上轮: ${(trace.previousConfidence * 100).toFixed(0)}% → 本轮: ${(trace.confidence * 100).toFixed(0)}%`
                                        : undefined
                                }
                            >
                                <Tag
                                    color={
                                        trace.confidence > 0.7
                                            ? 'green'
                                            : trace.confidence > 0.4
                                                ? 'orange'
                                                : 'red'
                                    }
                                >
                                    {(trace.confidence * 100).toFixed(0)}% 置信度
                                    {trace.previousConfidence !== null &&
                                        trace.previousConfidence !== undefined && (
                                            <span style={{ marginLeft: 4, fontSize: 10 }}>
                                                {trace.confidence > trace.previousConfidence ? '↑' : trace.confidence < trace.previousConfidence ? '↓' : '→'}
                                            </span>
                                        )}
                                </Tag>
                            </Tooltip>
                        )}
                    </Space>
                    <Space>
                        {trace.durationMs !== null && trace.durationMs !== undefined && (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                <ClockCircleOutlined /> {trace.durationMs}ms
                            </Text>
                        )}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {dayjs(trace.createdAt).format('HH:mm:ss')}
                        </Text>
                    </Space>
                </div>

                {trace.stance && (
                    <div style={{ marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            立场:{' '}
                        </Text>
                        <Text strong style={{ fontSize: 12 }}>
                            {trace.stance}
                        </Text>
                    </div>
                )}

                {trace.challengeTargetCode && (
                    <div style={{ marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            质疑对象:{' '}
                        </Text>
                        <Tag color="volcano" style={{ fontSize: 11 }}>
                            {trace.challengeTargetCode}
                        </Tag>
                    </div>
                )}

                {trace.challengeText && (
                    <div
                        style={{
                            marginBottom: 4,
                            padding: '4px 8px',
                            background: token.colorErrorBg,
                            borderRadius: 4,
                        }}
                    >
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            质疑:
                        </Text>
                        <Paragraph
                            ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
                            style={{ marginBottom: 0, fontSize: 12 }}
                        >
                            {trace.challengeText}
                        </Paragraph>
                    </div>
                )}

                <Paragraph
                    ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
                    style={{ marginBottom: 0, fontSize: 13, color: token.colorText }}
                >
                    {trace.statementText}
                </Paragraph>

                {trace.responseText && (
                    <div
                        style={{
                            marginTop: 4,
                            padding: '4px 8px',
                            background: token.colorSuccessBg,
                            borderRadius: 4,
                        }}
                    >
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            回应:
                        </Text>
                        <Paragraph
                            ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
                            style={{ marginBottom: 0, fontSize: 12 }}
                        >
                            {trace.responseText}
                        </Paragraph>
                    </div>
                )}

                <KeyPointsBlock keyPoints={trace.keyPoints} />
                <EvidenceRefsBlock evidenceRefs={trace.evidenceRefs} />

                {isJudge && trace.judgementVerdict && (
                    <div
                        style={{
                            marginTop: 8,
                            padding: 8,
                            background: token.colorWarningBg,
                            borderRadius: 4,
                        }}
                    >
                        <Text strong style={{ color: token.colorWarningText }}>
                            裁决: {trace.judgementVerdict}
                        </Text>
                        {trace.judgementReasoning && (
                            <Paragraph
                                style={{
                                    marginTop: 4,
                                    marginBottom: 0,
                                    fontSize: 12,
                                    color: token.colorTextSecondary,
                                }}
                            >
                                {trace.judgementReasoning}
                            </Paragraph>
                        )}
                    </div>
                )}
            </Card>
        );
    };

    const renderRound = (round: DebateTimelineEntryDto) => (
        <Panel
            header={
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '100%',
                    }}
                >
                    <Space>
                        <Badge
                            count={round.roundNumber}
                            style={{ backgroundColor: token.colorPrimary }}
                        />
                        <Text strong>第 {round.roundNumber} 轮辩论</Text>
                        {round.roundSummary.hasJudgement && <Tag color="gold">已裁决</Tag>}
                    </Space>
                    <Space size="large">
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <UserOutlined /> {round.roundSummary.participantCount} 人发言
                        </Text>
                        {round.roundSummary.avgConfidence !== null && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                平均: {(round.roundSummary.avgConfidence * 100).toFixed(0)}%
                                {round.roundSummary.confidenceDelta !== null && (
                                    <span
                                        style={{
                                            marginLeft: 4,
                                            color:
                                                round.roundSummary.confidenceDelta > 0
                                                    ? token.colorSuccess
                                                    : round.roundSummary.confidenceDelta < 0
                                                        ? token.colorError
                                                        : undefined,
                                        }}
                                    >
                                        ({round.roundSummary.confidenceDelta > 0 ? '+' : ''}
                                        {(round.roundSummary.confidenceDelta * 100).toFixed(0)}%)
                                    </span>
                                )}
                            </Text>
                        )}
                    </Space>
                </div>
            }
            key={round.roundNumber.toString()}
        >
            <div
                style={{
                    background: token.colorBgLayout,
                    padding: 8,
                    borderRadius: 4,
                }}
            >
                {round.entries.map(renderTraceEntry)}
            </div>
        </Panel>
    );

    return (
        <div
            style={{
                height,
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
                display: 'flex',
                flexDirection: 'column',
                transition: 'height 0.2s',
            }}
        >
            {/* Header */}
            <div
                style={{
                    height: 40,
                    padding: '0 16px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: token.colorBgLayout,
                }}
            >
                <Space>
                    <CommentOutlined />
                    <Text strong>辩论时间线</Text>
                    <Tag color="purple">辩论模式</Tag>
                    {timelineData && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            共 {timelineData.totalRounds} 轮
                        </Text>
                    )}
                </Space>
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={height > 40 ? <DownOutlined /> : <UpOutlined />}
                        onClick={() => onHeightChange?.(height > 40 ? 40 : 400)}
                    />
                    <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={onClose}
                    />
                </Space>
            </div>

            {/* Content */}
            {height > 40 && (
                <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: 20 }}>
                            <Spin />
                        </div>
                    ) : !timelineData?.rounds.length ? (
                        <Empty description="暂无辩论记录" />
                    ) : (
                        <>
                            <ConfidenceTrendChart rounds={timelineData.rounds} />
                            <Collapse
                                defaultActiveKey={timelineData.rounds.map((r) =>
                                    r.roundNumber.toString(),
                                )}
                                onChange={(keys) => setActiveRound(keys)}
                                ghost
                            >
                                {timelineData.rounds.map((r) => renderRound(r))}
                            </Collapse>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

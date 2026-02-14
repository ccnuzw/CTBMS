import React, { useState } from 'react';
import { Badge, Button, Card, Collapse, Empty, Space, Steps, Tag, theme, Timeline, Typography, Spin } from 'antd';
import {
    ClockCircleOutlined,
    CloseOutlined,
    CommentOutlined,
    DownOutlined,
    UpOutlined,
    UserOutlined,
    TrophyOutlined,
    SafetyCertificateOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDebateTimeline } from '../api/debateTraceApi';
import type { DebateTimelineDto, DebateTimelineEntryDto, DebateRoundTraceDto } from '@packages/types';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface DebateTimelinePanelProps {
    executionId?: string;
    height?: number;
    onHeightChange?: (height: number) => void;
    onClose?: () => void;
}

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
                    opacity: 0.9
                }}
                bodyStyle={{ padding: '8px 12px' }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Space>
                        <Tag color={isJudge ? 'gold' : 'blue'}>
                            {isJudge ? <SafetyCertificateOutlined /> : <UserOutlined />} {trace.participantRole}
                        </Tag>
                        <Text strong style={{ fontSize: 12 }}>{trace.participantCode}</Text>
                        {trace.confidence !== null && trace.confidence !== undefined && (
                            <Tag color={trace.confidence > 0.7 ? 'green' : trace.confidence > 0.4 ? 'orange' : 'red'}>
                                {(trace.confidence * 100).toFixed(0)}% 置信度
                            </Tag>
                        )}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {dayjs(trace.createdAt).format('HH:mm:ss')}
                    </Text>
                </div>

                {trace.stance && (
                    <div style={{ marginBottom: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>立场: </Text>
                        <Text strong style={{ fontSize: 12 }}>{trace.stance}</Text>
                    </div>
                )}

                <Paragraph
                    ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
                    style={{ marginBottom: 0, fontSize: 13, color: token.colorText }}
                >
                    {trace.statementText}
                </Paragraph>

                {isJudge && trace.judgementVerdict && (
                    <div style={{ marginTop: 8, padding: 8, background: token.colorWarningBg, borderRadius: 4 }}>
                        <Text strong style={{ color: token.colorWarningText }}>裁决: {trace.judgementVerdict}</Text>
                        {trace.judgementReasoning && (
                            <Paragraph style={{ marginTop: 4, marginBottom: 0, fontSize: 12, color: token.colorTextSecondary }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                        <Badge count={round.roundNumber} style={{ backgroundColor: token.colorPrimary }} />
                        <Text strong>第 {round.roundNumber} 轮辩论</Text>
                        {round.roundSummary.hasJudgement && <Tag color="gold">已裁决</Tag>}
                    </Space>
                    <Space size="large">
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <UserOutlined /> {round.roundSummary.participantCount} 人发言
                        </Text>
                        {round.roundSummary.avgConfidence !== null && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Avg Conf: {(round.roundSummary.avgConfidence * 100).toFixed(0)}%
                            </Text>
                        )}
                    </Space>
                </div>
            }
            key={round.roundNumber.toString()}
        >
            <div style={{ background: token.colorBgLayout, padding: 8, borderRadius: 4 }}>
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
                    <Tag color="purple">Debate Mode</Tag>
                </Space>
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={height > 40 ? <DownOutlined /> : <UpOutlined />}
                        onClick={() => onHeightChange?.(height > 40 ? 40 : 400)}
                    />
                    <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
                </Space>
            </div>

            {/* Content */}
            {height > 40 && (
                <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                    ) : !timelineData?.rounds.length ? (
                        <Empty description="暂无辩论记录" />
                    ) : (
                        <Collapse
                            defaultActiveKey={timelineData.rounds.map(r => r.roundNumber.toString())}
                            onChange={(keys) => setActiveRound(keys)}
                            ghost
                        >
                            {timelineData.rounds.map((r) => renderRound(r))}
                        </Collapse>
                    )}
                </div>
            )}
        </div>
    );
};

import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Flex,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Tag,
  Timeline,
  Typography,
  theme,
} from 'antd';
import {
  CaretRightOutlined,
  PauseOutlined,
  StepForwardOutlined,
  StepBackwardOutlined,
  ReloadOutlined,
  UserOutlined,
  TrophyOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { DebateTimelineDto, DebateTimelineEntryDto, DebateRoundTraceDto } from '@packages/types';

const { Text, Title, Paragraph } = Typography;

// ── Types ──

interface DebateReplayViewerProps {
  timeline: DebateTimelineDto;
  isLoading?: boolean;
}

// ── Helpers ──

const roleColorMap: Record<string, string> = {
  ANALYST: 'blue',
  RISK_OFFICER: 'red',
  JUDGE: 'purple',
  COST_SPREAD: 'orange',
  FUTURES_EXPERT: 'cyan',
  SPOT_EXPERT: 'green',
  LOGISTICS_EXPERT: 'magenta',
  EXECUTION_ADVISOR: 'geekblue',
};

const stanceColorMap: Record<string, string> = {
  BULLISH: 'green',
  BEARISH: 'red',
  NEUTRAL: 'default',
  BUY: 'green',
  SELL: 'red',
  HOLD: 'blue',
};

const formatConfidence = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '-';
  return `${(v * 100).toFixed(1)}%`;
};

const confidenceChangeColor = (delta: number | null | undefined): string => {
  if (delta === null || delta === undefined || delta === 0) return '';
  return delta > 0 ? '#52c41a' : '#ff4d4f';
};

// ── Component ──

export const DebateReplayViewer: React.FC<DebateReplayViewerProps> = ({
  timeline,
  isLoading = false,
}) => {
  const { token } = theme.useToken();

  const [currentRound, setCurrentRound] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playInterval, setPlayInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<string | undefined>(undefined);

  const rounds = timeline.rounds;
  const totalRounds = timeline.totalRounds;

  const allParticipants = useMemo(() => {
    const codes = new Set<string>();
    for (const round of rounds) {
      for (const entry of round.entries) {
        codes.add(entry.participantCode);
      }
    }
    return Array.from(codes);
  }, [rounds]);

  const currentRoundData: DebateTimelineEntryDto | undefined = rounds[currentRound];

  const filteredEntries = useMemo(() => {
    if (!currentRoundData) return [];
    if (!selectedParticipant) return currentRoundData.entries;
    return currentRoundData.entries.filter((e) => e.participantCode === selectedParticipant);
  }, [currentRoundData, selectedParticipant]);

  // ── Confidence trend data ──
  const confidenceTrend = useMemo(() => {
    const trendMap = new Map<string, { round: number; confidence: number }[]>();
    for (const round of rounds) {
      for (const entry of round.entries) {
        if (entry.confidence === null || entry.confidence === undefined) continue;
        if (!trendMap.has(entry.participantCode)) {
          trendMap.set(entry.participantCode, []);
        }
        trendMap.get(entry.participantCode)!.push({
          round: round.roundNumber,
          confidence: entry.confidence,
        });
      }
    }
    return trendMap;
  }, [rounds]);

  // ── Challenge/response pairing ──
  const challengePairs = useMemo(() => {
    if (!currentRoundData) return [];
    const pairs: {
      challenger: DebateRoundTraceDto;
      target?: DebateRoundTraceDto;
    }[] = [];
    for (const entry of currentRoundData.entries) {
      if (entry.challengeTargetCode && entry.challengeText) {
        const target = currentRoundData.entries.find(
          (e) => e.participantCode === entry.challengeTargetCode,
        );
        pairs.push({ challenger: entry, target });
      }
    }
    return pairs;
  }, [currentRoundData]);

  // ── Playback controls ──
  const stopPlayback = useCallback(() => {
    if (playInterval) {
      clearInterval(playInterval);
      setPlayInterval(null);
    }
    setIsPlaying(false);
  }, [playInterval]);

  const startPlayback = useCallback(() => {
    stopPlayback();
    setIsPlaying(true);
    const interval = setInterval(() => {
      setCurrentRound((prev) => {
        if (prev >= totalRounds - 1) {
          clearInterval(interval);
          setIsPlaying(false);
          setPlayInterval(null);
          return prev;
        }
        return prev + 1;
      });
    }, 3000);
    setPlayInterval(interval);
  }, [stopPlayback, totalRounds]);

  const stepForward = () => {
    stopPlayback();
    setCurrentRound((prev) => Math.min(prev + 1, totalRounds - 1));
  };

  const stepBackward = () => {
    stopPlayback();
    setCurrentRound((prev) => Math.max(prev - 1, 0));
  };

  const resetPlayback = () => {
    stopPlayback();
    setCurrentRound(0);
  };

  // cleanup
  React.useEffect(() => {
    return () => {
      if (playInterval) clearInterval(playInterval);
    };
  }, [playInterval]);

  // ── Judgement entries ──
  const judgementEntries = useMemo(() => {
    if (!currentRoundData) return [];
    return currentRoundData.entries.filter((e) => e.isJudgement);
  }, [currentRoundData]);

  return (
    <Card loading={isLoading}>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Title level={4} style={{ margin: 0 }}>
          辩论回放
        </Title>

        {/* ── Playback Controls ── */}
        <Card size="small">
          <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
            <Space>
              <Button
                icon={<StepBackwardOutlined />}
                onClick={stepBackward}
                disabled={currentRound <= 0}
              />
              {isPlaying ? (
                <Button icon={<PauseOutlined />} onClick={stopPlayback} type="primary" />
              ) : (
                <Button
                  icon={<CaretRightOutlined />}
                  onClick={startPlayback}
                  type="primary"
                  disabled={currentRound >= totalRounds - 1}
                />
              )}
              <Button
                icon={<StepForwardOutlined />}
                onClick={stepForward}
                disabled={currentRound >= totalRounds - 1}
              />
              <Button icon={<ReloadOutlined />} onClick={resetPlayback} />
              <Text type="secondary">
                轮次 {currentRound + 1} / {totalRounds}
              </Text>
            </Space>
            <Select
              allowClear
              style={{ width: 180 }}
              placeholder="筛选参与者"
              value={selectedParticipant}
              onChange={setSelectedParticipant}
              options={allParticipants.map((code) => ({ label: code, value: code }))}
            />
          </Flex>
        </Card>

        {/* ── Round Steps ── */}
        <Steps
          current={currentRound}
          size="small"
          onChange={(step) => {
            stopPlayback();
            setCurrentRound(step);
          }}
          items={rounds.map((round) => ({
            title: `R${round.roundNumber}`,
            description: round.roundSummary.hasJudgement ? '含裁决' : undefined,
            status: round.roundSummary.hasJudgement
              ? 'finish'
              : currentRound === round.roundNumber - 1
                ? 'process'
                : 'wait',
          }))}
        />

        <Row gutter={[16, 16]}>
          {/* ── Round Summary ── */}
          <Col xs={24} lg={8}>
            <Card title={`第 ${(currentRoundData?.roundNumber ?? 0)} 轮摘要`} size="small">
              {currentRoundData ? (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  <Statistic
                    title="参与者数"
                    value={currentRoundData.roundSummary.participantCount}
                  />
                  <Statistic
                    title="平均置信度"
                    value={formatConfidence(currentRoundData.roundSummary.avgConfidence)}
                  />
                  {currentRoundData.roundSummary.confidenceDelta !== null && (
                    <Statistic
                      title="置信度变化"
                      value={formatConfidence(currentRoundData.roundSummary.confidenceDelta)}
                      valueStyle={{
                        color: confidenceChangeColor(currentRoundData.roundSummary.confidenceDelta),
                      }}
                    />
                  )}
                  <Tag color={currentRoundData.roundSummary.hasJudgement ? 'purple' : 'default'}>
                    {currentRoundData.roundSummary.hasJudgement ? '已裁决' : '未裁决'}
                  </Tag>
                </Space>
              ) : (
                <Text type="secondary">无数据</Text>
              )}
            </Card>

            {/* ── Confidence Trend ── */}
            <Card title="置信度变化趋势" size="small" style={{ marginTop: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                {allParticipants.map((code) => {
                  const points = confidenceTrend.get(code) ?? [];
                  const currentPoint = points.find(
                    (p) => p.round === (currentRoundData?.roundNumber ?? 0),
                  );
                  const prevPoint = points.find(
                    (p) => p.round === (currentRoundData?.roundNumber ?? 0) - 1,
                  );
                  const delta =
                    currentPoint && prevPoint
                      ? currentPoint.confidence - prevPoint.confidence
                      : null;

                  return (
                    <Flex key={code} justify="space-between" align="center">
                      <Space size={4}>
                        <UserOutlined />
                        <Text style={{ fontSize: 12 }}>{code}</Text>
                      </Space>
                      <Space size={4}>
                        <Progress
                          percent={currentPoint ? Math.round(currentPoint.confidence * 100) : 0}
                          size="small"
                          style={{ width: 80 }}
                          showInfo={false}
                        />
                        <Text style={{ fontSize: 12, width: 48, textAlign: 'right' }}>
                          {currentPoint ? formatConfidence(currentPoint.confidence) : '-'}
                        </Text>
                        {delta !== null && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: confidenceChangeColor(delta),
                              width: 48,
                              textAlign: 'right',
                            }}
                          >
                            {delta > 0 ? '+' : ''}
                            {(delta * 100).toFixed(1)}%
                          </Text>
                        )}
                      </Space>
                    </Flex>
                  );
                })}
              </Space>
            </Card>
          </Col>

          {/* ── Round Entries Timeline ── */}
          <Col xs={24} lg={16}>
            <Card title="逐轮发言" size="small">
              <Timeline
                items={filteredEntries.map((entry) => ({
                  key: entry.id,
                  color: entry.isJudgement
                    ? 'purple'
                    : roleColorMap[entry.participantRole] || 'blue',
                  children: (
                    <Card
                      size="small"
                      style={{
                        marginBottom: 8,
                        borderLeft: `3px solid ${
                          entry.isJudgement
                            ? token.colorPurple || '#722ed1'
                            : token.colorPrimary
                        }`,
                      }}
                    >
                      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                        <Space>
                          {entry.isJudgement ? (
                            <TrophyOutlined style={{ color: '#722ed1' }} />
                          ) : (
                            <UserOutlined />
                          )}
                          <Text strong>{entry.participantCode}</Text>
                          <Tag color={roleColorMap[entry.participantRole] || 'default'}>
                            {entry.participantRole}
                          </Tag>
                          {entry.stance && (
                            <Tag color={stanceColorMap[entry.stance] || 'default'}>
                              {entry.stance}
                            </Tag>
                          )}
                        </Space>
                        <Space size={4}>
                          {entry.confidence !== null && entry.confidence !== undefined && (
                            <Tag>
                              置信度: {formatConfidence(entry.confidence)}
                              {entry.previousConfidence !== null &&
                                entry.previousConfidence !== undefined && (
                                  <span
                                    style={{
                                      marginLeft: 4,
                                      color: confidenceChangeColor(
                                        entry.confidence - entry.previousConfidence,
                                      ),
                                    }}
                                  >
                                    ({entry.confidence >= entry.previousConfidence ? '+' : ''}
                                    {((entry.confidence - entry.previousConfidence) * 100).toFixed(
                                      1,
                                    )}
                                    %)
                                  </span>
                                )}
                            </Tag>
                          )}
                          {entry.durationMs && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {entry.durationMs}ms
                            </Text>
                          )}
                        </Space>
                      </Flex>

                      <Paragraph
                        style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}
                        ellipsis={{ rows: 4, expandable: true }}
                      >
                        {entry.statementText}
                      </Paragraph>

                      {entry.keyPoints && entry.keyPoints.length > 0 && (
                        <Space wrap style={{ marginTop: 8 }}>
                          {(entry.keyPoints as string[]).map((point, idx) => (
                            <Tag key={idx} color="processing">
                              {point}
                            </Tag>
                          ))}
                        </Space>
                      )}

                      {/* Judgement highlight */}
                      {entry.isJudgement && entry.judgementVerdict && (
                        <Card
                          size="small"
                          style={{
                            marginTop: 8,
                            background: '#f9f0ff',
                            borderColor: '#d3adf7',
                          }}
                        >
                          <Descriptions column={1} size="small">
                            <Descriptions.Item label="裁决">
                              <Tag color="purple">{entry.judgementVerdict}</Tag>
                            </Descriptions.Item>
                            {entry.judgementReasoning && (
                              <Descriptions.Item label="裁决依据">
                                <Paragraph
                                  style={{
                                    margin: 0,
                                    fontSize: 12,
                                    whiteSpace: 'pre-wrap',
                                  }}
                                  ellipsis={{ rows: 3, expandable: true }}
                                >
                                  {entry.judgementReasoning}
                                </Paragraph>
                              </Descriptions.Item>
                            )}
                          </Descriptions>
                        </Card>
                      )}
                    </Card>
                  ),
                }))}
              />
            </Card>

            {/* ── Challenge/Response Pairs ── */}
            {challengePairs.length > 0 && (
              <Card title="质询配对" size="small" style={{ marginTop: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  {challengePairs.map((pair, idx) => (
                    <Card key={idx} size="small" style={{ background: '#fafafa' }}>
                      <Flex gap={12} align="stretch">
                        <Card
                          size="small"
                          style={{ flex: 1, borderColor: '#ff7a45' }}
                          title={
                            <Space size={4}>
                              <UserOutlined />
                              <Text style={{ fontSize: 12 }}>{pair.challenger.participantCode}</Text>
                              <Tag color="volcano" style={{ fontSize: 11 }}>
                                质询方
                              </Tag>
                            </Space>
                          }
                        >
                          <Paragraph
                            style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}
                            ellipsis={{ rows: 3, expandable: true }}
                          >
                            {pair.challenger.challengeText}
                          </Paragraph>
                        </Card>

                        <Flex align="center">
                          <SwapOutlined style={{ fontSize: 20, color: token.colorTextSecondary }} />
                        </Flex>

                        <Card
                          size="small"
                          style={{ flex: 1, borderColor: '#36cfc9' }}
                          title={
                            <Space size={4}>
                              <UserOutlined />
                              <Text style={{ fontSize: 12 }}>
                                {pair.challenger.challengeTargetCode}
                              </Text>
                              <Tag color="cyan" style={{ fontSize: 11 }}>
                                应答方
                              </Tag>
                            </Space>
                          }
                        >
                          <Paragraph
                            style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}
                            ellipsis={{ rows: 3, expandable: true }}
                          >
                            {pair.target?.responseText || pair.target?.statementText || '未响应'}
                          </Paragraph>
                        </Card>
                      </Flex>
                    </Card>
                  ))}
                </Space>
              </Card>
            )}
          </Col>
        </Row>
      </Space>
    </Card>
  );
};

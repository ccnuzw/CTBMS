/**
 * ReportCardView — 结果卡片化可视化
 *
 * 功能：
 *   - SUMMARY 摘要卡片（渐变顶栏 + 核心数据）
 *   - FINDING 发现卡片（关键发现列表）
 *   - RISK 风险卡片（红色边框 + 风险等级）
 *   - ACTION 建议卡片（可折叠 + 操作按钮）
 */
import React, { useState } from 'react';
import { Card, Col, Collapse, Flex, Row, Space, Tag, Typography, theme } from 'antd';
import {
    BulbOutlined,
    ExclamationCircleOutlined,
    FileTextOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import type { ReportCard } from '../api/orchestration';

const { Text, Paragraph, Title } = Typography;

// ── Card Renderers ────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{ card: ReportCard }> = ({ card }) => {
    const { token } = theme.useToken();
    const sourceCount = card.metadata?.sourceAgentCount;
    return (
        <Card
            style={{
                borderRadius: token.borderRadiusLG,
                background: `linear-gradient(135deg, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 100%)`,
                border: `1px solid ${token.colorPrimaryBorder}`,
            }}
        >
            <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
                <FileTextOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
                <Title level={5} style={{ margin: 0 }}>{card.title}</Title>
                {sourceCount != null && (
                    <Tag color="blue" style={{ fontSize: 11 }}>综合 {String(sourceCount)} 个 Agent</Tag>
                )}
            </Flex>
            <Paragraph style={{ margin: 0, whiteSpace: 'pre-line' }}>{card.content}</Paragraph>
        </Card>
    );
};

const FindingCard: React.FC<{ card: ReportCard }> = ({ card }) => {
    const { token } = theme.useToken();
    const confidence = card.metadata?.confidence;
    return (
        <Card size="small" style={{ borderRadius: token.borderRadiusLG }}>
            <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                <BulbOutlined style={{ color: token.colorWarning }} />
                <Text strong style={{ fontSize: 13 }}>{card.title}</Text>
                {confidence != null && (
                    <Tag color={Number(confidence) > 0.7 ? 'green' : 'orange'} style={{ fontSize: 10 }}>
                        置信度 {Math.round(Number(confidence) * 100)}%
                    </Tag>
                )}
            </Flex>
            <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>{card.content}</Paragraph>
        </Card>
    );
};

const RiskCard: React.FC<{ card: ReportCard }> = ({ card }) => {
    const { token } = theme.useToken();
    return (
        <Card
            size="small"
            style={{
                borderRadius: token.borderRadiusLG,
                borderLeft: `3px solid ${token.colorError}`,
                background: token.colorErrorBg,
            }}
        >
            <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                <ExclamationCircleOutlined style={{ color: token.colorError }} />
                <Text strong style={{ color: token.colorError, fontSize: 13 }}>{card.title}</Text>
            </Flex>
            <Paragraph style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-line' }}>{card.content}</Paragraph>
        </Card>
    );
};

const ActionCard: React.FC<{ card: ReportCard }> = ({ card }) => {
    const { token } = theme.useToken();
    const [isExpanded, setIsExpanded] = useState(false);
    const lines = card.content.split('\n').filter((l) => l.trim());
    const isLong = lines.length > 3;
    const displayLines = isExpanded || !isLong ? lines : lines.slice(0, 3);

    return (
        <Card size="small" style={{ borderRadius: token.borderRadiusLG, borderLeft: `3px solid ${token.colorSuccess}` }}>
            <Flex align="center" gap={6} style={{ marginBottom: 6 }}>
                <ThunderboltOutlined style={{ color: token.colorSuccess }} />
                <Text strong style={{ fontSize: 13 }}>{card.title}</Text>
            </Flex>
            <Flex vertical gap={4}>
                {displayLines.map((line, i) => (
                    <Text key={i} style={{ fontSize: 13 }}>• {line}</Text>
                ))}
            </Flex>
            {isLong && (
                <Text
                    type="secondary"
                    style={{ fontSize: 12, cursor: 'pointer', marginTop: 4, display: 'block' }}
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? '收起' : `展开更多 (${lines.length - 3} 项)`}
                </Text>
            )}
        </Card>
    );
};

// ── Main Component ────────────────────────────────────────────────────────────

interface ReportCardViewProps {
    cards: ReportCard[];
}

export const ReportCardView: React.FC<ReportCardViewProps> = ({ cards }) => {
    if (!cards.length) return null;

    const sorted = [...cards].sort((a, b) => a.order - b.order);
    const summaryCards = sorted.filter((c) => c.type === 'SUMMARY');
    const otherCards = sorted.filter((c) => c.type !== 'SUMMARY');

    return (
        <Flex vertical gap={12}>
            {/* Summary 全宽 */}
            {summaryCards.map((card) => (
                <SummaryCard key={card.id} card={card} />
            ))}

            {/* Other Cards 双栏栅格 */}
            <Row gutter={[12, 12]}>
                {otherCards.map((card) => (
                    <Col xs={24} md={12} key={card.id}>
                        {card.type === 'FINDING' && <FindingCard card={card} />}
                        {card.type === 'RISK' && <RiskCard card={card} />}
                        {card.type === 'ACTION' && <ActionCard card={card} />}
                    </Col>
                ))}
            </Row>
        </Flex>
    );
};

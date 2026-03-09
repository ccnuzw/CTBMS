import React from 'react';
import { Alert, Button, Card, Progress, Space, Tag, Tooltip, Typography, theme } from 'antd';
import {
    BulbOutlined,
    CheckCircleOutlined,
    FileSearchOutlined,
    SafetyOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import type { ParsedResultData } from './copilotChatConstants';
import { confidenceConfig, qualityConfig } from './copilotChatConstants';
import { EvidenceTag } from './EvidenceTag';

const { Text, Paragraph } = Typography;

interface StructuredResultViewProps {
    resultData: ParsedResultData;
    onOpenEvidencePanel?: () => void;
}

export const StructuredResultView: React.FC<StructuredResultViewProps> = ({
    resultData,
    onOpenEvidencePanel,
}) => {
    const { token } = theme.useToken();
    const { confidence, qualityScore, conclusion, actions, evidenceItems, confidenceGate } =
        resultData;
    const confPct = confidence ?? 0;
    const confCfg = confidenceConfig(confPct);
    const qualPct = qualityScore ?? 0;
    const qualCfg = qualityConfig(qualPct);

    const riskActions = actions.filter(
        (action) =>
            action.includes('风险') ||
            action.includes('止损') ||
            action.includes('对冲') ||
            action.includes('预警') ||
            action.includes('注意'),
    );
    const nextActions = actions.filter((action) => !riskActions.includes(action));

    return (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card
                size="small"
                bodyStyle={{
                    padding: 16,
                }}
                style={{ borderInlineStart: `3px solid ${confCfg.color}` }}
            >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} wrap>
                        <CheckCircleOutlined style={{ color: confCfg.color, fontSize: 16 }} />
                        <Text strong style={{ fontSize: token.fontSizeLG }}>
                            结论
                        </Text>
                        <Tooltip title={`基于 ${evidenceItems.length} 条证据综合分析`}>
                            <Tag color={confCfg.color}>{confCfg.label} {confPct}%</Tag>
                        </Tooltip>
                        {qualPct > 0 ? <Tag color={qualCfg.color}>{qualCfg.label}</Tag> : null}
                    </Space>

                    {confidenceGate && !confidenceGate.allowStrongConclusion ? (
                        <Alert
                            type="warning"
                            showIcon
                            message={confidenceGate.message}
                            style={{ fontSize: token.fontSizeSM }}
                        />
                    ) : null}

                    <Paragraph style={{ margin: 0, lineHeight: 1.8, fontSize: token.fontSize }}>
                        {conclusion || '暂无结论'}
                    </Paragraph>
                </Space>
            </Card>

            {evidenceItems.length > 0 ? (
                <Card
                    size="small"
                    bodyStyle={{
                        padding: 16,
                    }}
                    style={{ borderInlineStart: `3px solid ${token.colorInfo}` }}
                >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Space size={8} wrap>
                            <FileSearchOutlined style={{ color: token.colorInfo, fontSize: 16 }} />
                            <Text strong style={{ fontSize: token.fontSizeLG }}>
                                依据
                            </Text>
                            <Tag color="blue">{evidenceItems.length} 条</Tag>
                        </Space>

                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                            {evidenceItems.slice(0, 3).map((evidence, index) => (
                                <Space
                                    key={evidence.id}
                                    align="start"
                                    size={8}
                                    style={{
                                        width: '100%',
                                        paddingBottom:
                                            index < Math.min(evidenceItems.length, 3) - 1
                                                ? token.paddingXS
                                                : 0,
                                        borderBottom:
                                            index < Math.min(evidenceItems.length, 3) - 1
                                                ? `1px solid ${token.colorBorderSecondary}`
                                                : 'none',
                                    }}
                                >
                                    <EvidenceTag index={index + 1} evidence={evidence} />
                                    <Space direction="vertical" size={2} style={{ flex: 1 }}>
                                        <Text>{evidence.title}</Text>
                                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                            {evidence.summary.length > 90
                                                ? `${evidence.summary.slice(0, 90)}…`
                                                : evidence.summary}
                                        </Text>
                                    </Space>
                                </Space>
                            ))}
                        </Space>

                        {evidenceItems.length > 3 || onOpenEvidencePanel ? (
                            <Button
                                type="link"
                                size="small"
                                style={{ paddingInline: 0, alignSelf: 'flex-start' }}
                                onClick={onOpenEvidencePanel}
                            >
                                查看全部 {evidenceItems.length} 条依据
                            </Button>
                        ) : null}
                    </Space>
                </Card>
            ) : null}

            <Card
                size="small"
                bodyStyle={{
                    padding: 16,
                }}
                style={{ borderInlineStart: `3px solid ${token.colorSuccess}` }}
            >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} wrap>
                        <BulbOutlined style={{ color: token.colorSuccess, fontSize: 16 }} />
                        <Text strong style={{ fontSize: token.fontSizeLG }}>
                            下一步动作
                        </Text>
                    </Space>

                    {riskActions.length > 0 ? (
                        <Alert
                            type="warning"
                            showIcon
                            icon={<SafetyOutlined />}
                            message="执行前建议先关注这些风险"
                            description={
                                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                    {riskActions.map((action, index) => (
                                        <Space key={`${action}-${index}`} size={6} align="start">
                                            <WarningOutlined
                                                style={{
                                                    color: token.colorWarning,
                                                    marginTop: 3,
                                                }}
                                            />
                                            <Text style={{ fontSize: token.fontSize }}>
                                                {action}
                                            </Text>
                                        </Space>
                                    ))}
                                </Space>
                            }
                        />
                    ) : null}

                    {nextActions.length > 0 ? (
                        <Space size={[8, 6]} wrap>
                            {nextActions.map((action, index) => (
                                <Tag key={`${action}-${index}`} color="green" style={{ padding: '2px 8px' }}>
                                    {action}
                                </Tag>
                            ))}
                        </Space>
                    ) : (
                        <Text type="secondary">可以继续追问、发送结果，或设为定时更新。</Text>
                    )}
                </Space>
            </Card>

            {qualPct > 0 && confidence !== null ? (
                <Space size={16} wrap>
                    <Space size={4}>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            可靠性
                        </Text>
                        <Progress
                            percent={confPct}
                            size="small"
                            strokeColor={confCfg.color}
                            style={{ width: 80, margin: 0 }}
                            showInfo={false}
                        />
                        <Text style={{ fontSize: token.fontSizeSM }}>{confPct}%</Text>
                    </Space>
                    <Space size={4}>
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                            数据质量
                        </Text>
                        <Progress
                            percent={qualPct}
                            size="small"
                            strokeColor={qualCfg.color}
                            style={{ width: 80, margin: 0 }}
                            showInfo={false}
                        />
                        <Text style={{ fontSize: token.fontSizeSM }}>{qualPct}%</Text>
                    </Space>
                </Space>
            ) : null}
        </Space>
    );
};

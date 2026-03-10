import React from 'react';
import {
    Drawer,
    Descriptions,
    Divider,
    Empty,
    Flex,
    Space,
    Tag,
    Timeline,
    Typography,
    theme,
    Alert,
} from 'antd';
import {
    CheckCircleOutlined,
    ExperimentOutlined,
    FileSearchOutlined,
    WarningOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import type { ExportReportDataDto } from '@packages/types';

const { Text, Title, Paragraph } = Typography;

const sectionLabels: Record<string, string> = {
    CONCLUSION: '结论',
    EVIDENCE: '证据',
    DEBATE_PROCESS: '讨论过程',
    RISK_ASSESSMENT: '风险评估',
};

interface ReportPreviewDrawerProps {
    visible: boolean;
    onClose: () => void;
    reportData: ExportReportDataDto | null;
    title?: string;
}

/**
 * 报告预览抽屉
 *
 * 在侧边栏中预览报告内容（结论、证据、讨论过程、风险评估），
 * 无需导出就能快速查看。
 */
export const ReportPreviewDrawer: React.FC<ReportPreviewDrawerProps> = ({
    visible,
    onClose,
    reportData,
    title,
}) => {
    const { token } = theme.useToken();

    if (!reportData) {
        return (
            <Drawer title="报告预览" open={visible} onClose={onClose} width={640}>
                <Empty description="暂无报告数据" />
            </Drawer>
        );
    }

    return (
        <Drawer
            title={title ?? reportData.title ?? '报告预览'}
            open={visible}
            onClose={onClose}
            width={640}
        >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {/* 报告元信息 */}
                <Descriptions size="small" column={2} bordered>
                    <Descriptions.Item label="生成时间">{reportData.generatedAt}</Descriptions.Item>
                    <Descriptions.Item label="工作流">
                        {reportData.workflowName ?? '-'}
                    </Descriptions.Item>
                    {reportData.versionCode && (
                        <Descriptions.Item label="版本">{reportData.versionCode}</Descriptions.Item>
                    )}
                </Descriptions>

                {/* 结论 */}
                {reportData.conclusion && (
                    <>
                        <Divider orientation="left">
                            <Space>
                                <CheckCircleOutlined style={{ color: token.colorSuccess }} />
                                <Text strong>结论</Text>
                            </Space>
                        </Divider>

                        <div
                            style={{
                                padding: 16,
                                borderRadius: token.borderRadiusLG,
                                background: `${token.colorSuccess}08`,
                                border: `1px solid ${token.colorSuccess}30`,
                            }}
                        >
                            <Flex gap={16} wrap="wrap">
                                {reportData.conclusion.action && (
                                    <Descriptions.Item label="操作建议">
                                        <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                                            {reportData.conclusion.action}
                                        </Tag>
                                    </Descriptions.Item>
                                )}
                                {reportData.conclusion.confidence != null && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>置信度</Text>
                                        <br />
                                        <Text strong style={{ fontSize: 16 }}>
                                            {(reportData.conclusion.confidence * 100).toFixed(0)}%
                                        </Text>
                                    </div>
                                )}
                                {reportData.conclusion.riskLevel && (
                                    <div>
                                        <Text type="secondary" style={{ fontSize: 12 }}>风险等级</Text>
                                        <br />
                                        <Tag
                                            color={
                                                reportData.conclusion.riskLevel === 'HIGH'
                                                    ? 'red'
                                                    : reportData.conclusion.riskLevel === 'MEDIUM'
                                                        ? 'orange'
                                                        : 'green'
                                            }
                                        >
                                            {reportData.conclusion.riskLevel}
                                        </Tag>
                                    </div>
                                )}
                            </Flex>

                            {reportData.conclusion.reasoningSummary && (
                                <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
                                    {reportData.conclusion.reasoningSummary}
                                </Paragraph>
                            )}

                            {reportData.conclusion.judgementVerdict && (
                                <Alert
                                    type="info"
                                    showIcon
                                    icon={<TeamOutlined />}
                                    message="裁判结论"
                                    description={reportData.conclusion.judgementVerdict}
                                    style={{ marginTop: 12 }}
                                />
                            )}
                        </div>
                    </>
                )}

                {/* 证据 */}
                {reportData.evidenceItems && reportData.evidenceItems.length > 0 && (
                    <>
                        <Divider orientation="left">
                            <Space>
                                <FileSearchOutlined style={{ color: token.colorPrimary }} />
                                <Text strong>证据数据</Text>
                                <Tag>{reportData.evidenceItems.length} 条</Tag>
                            </Space>
                        </Divider>

                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            {reportData.evidenceItems.map((item, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: token.borderRadius,
                                        background: token.colorFillQuaternary,
                                        border: `1px solid ${token.colorBorderSecondary}`,
                                    }}
                                >
                                    <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            来源: {item.source}
                                        </Text>
                                        {item.category && (
                                            <Tag style={{ fontSize: 10, margin: 0 }}>{item.category}</Tag>
                                        )}
                                    </Flex>
                                    <Text style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                                        {item.content}
                                    </Text>
                                </div>
                            ))}
                        </Space>
                    </>
                )}

                {/* 讨论过程 */}
                {reportData.debateRounds && reportData.debateRounds.length > 0 && (
                    <>
                        <Divider orientation="left">
                            <Space>
                                <ExperimentOutlined style={{ color: '#722ed1' }} />
                                <Text strong>讨论过程</Text>
                                <Tag>{reportData.debateRounds.length} 轮</Tag>
                            </Space>
                        </Divider>

                        <Timeline
                            items={reportData.debateRounds.map((round) => ({
                                color: round.isJudgement ? 'red' : 'blue',
                                children: (
                                    <div>
                                        <Flex gap={8} align="center" style={{ marginBottom: 4 }}>
                                            <Tag
                                                color={round.isJudgement ? 'red' : 'blue'}
                                                style={{ margin: 0, fontSize: 11 }}
                                            >
                                                {round.isJudgement ? '裁判' : `第${round.roundNumber}轮`}
                                            </Tag>
                                            <Text strong style={{ fontSize: 13 }}>
                                                {round.participantRole}
                                            </Text>
                                            {round.stance && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    立场: {round.stance}
                                                </Text>
                                            )}
                                            {round.confidence != null && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    信心: {(round.confidence * 100).toFixed(0)}%
                                                </Text>
                                            )}
                                        </Flex>
                                        <Paragraph
                                            style={{ fontSize: 13, marginBottom: 0 }}
                                            ellipsis={{ rows: 3, expandable: true, symbol: '展开' }}
                                        >
                                            {round.statementSummary}
                                        </Paragraph>
                                    </div>
                                ),
                            }))}
                        />
                    </>
                )}

                {/* 风险评估 */}
                {reportData.riskItems && reportData.riskItems.length > 0 && (
                    <>
                        <Divider orientation="left">
                            <Space>
                                <WarningOutlined style={{ color: token.colorWarning }} />
                                <Text strong>风险评估</Text>
                                <Tag>{reportData.riskItems.length} 项</Tag>
                            </Space>
                        </Divider>

                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            {reportData.riskItems.map((risk, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: token.borderRadius,
                                        background:
                                            risk.level === 'HIGH'
                                                ? '#fff2f0'
                                                : risk.level === 'MEDIUM'
                                                    ? '#fffbe6'
                                                    : '#f6ffed',
                                        border: `1px solid ${risk.level === 'HIGH'
                                                ? '#ffccc7'
                                                : risk.level === 'MEDIUM'
                                                    ? '#ffe58f'
                                                    : '#b7eb8f'
                                            }`,
                                    }}
                                >
                                    <Flex gap={8} align="center" style={{ marginBottom: 4 }}>
                                        <Tag
                                            color={
                                                risk.level === 'HIGH'
                                                    ? 'red'
                                                    : risk.level === 'MEDIUM'
                                                        ? 'orange'
                                                        : 'green'
                                            }
                                        >
                                            {risk.level}
                                        </Tag>
                                        <Text strong style={{ fontSize: 13 }}>{risk.riskType}</Text>
                                    </Flex>
                                    <Text style={{ fontSize: 13 }}>{risk.description}</Text>
                                    {risk.mitigationAction && (
                                        <div style={{ marginTop: 4 }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                应对措施: {risk.mitigationAction}
                                            </Text>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </Space>
                    </>
                )}
            </Space>
        </Drawer>
    );
};

import React from 'react';
import { Alert, Button, Card, Divider, Modal, Space, Steps, Typography, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { WorkflowVersionDto } from '@packages/types';
import { WorkflowDependencyCheckResult, WorkflowDependencyGroup, PublishDryRunPreview } from './types';
import { countDependencyIssues, hasDependencyIssues } from './utils';

const { Text } = Typography;

/**
 * 校验问题错误码 → 中文类别标签
 */
const ISSUE_CODE_LABEL_MAP: Record<string, string> = {
    // 基础结构
    WF001: '流程结构',
    WF002: '节点配置',
    WF003: '连线配置',
    WF004: '节点引用',
    WF005: '循环检测',
    // 语义校验
    WF101: '触发节点',
    WF102: '终止节点',
    WF103: '分支结构',
    WF104: '节点连接',
    WF105: '参数绑定',
    WF106: '表达式',
    WF107: '节点配置',
    // 依赖校验
    WF201: '规则包引用',
    WF202: '智能体引用',
    WF203: '参数集引用',
    WF204: '连接器引用',
    WF205: '提示词引用',
    // 发布校验
    WF301: '版本状态',
    WF302: '发布权限',
    WF303: '运行策略',
    WF304: '发布条件',
};

/**
 * 根据错误码前缀判断严重级别
 * WF0xx / WF1xx = ERROR (结构/语义) 
 * WF2xx = WARNING (依赖)
 * WF3xx = ERROR (发布条件)
 * 其余 = INFO
 */
const getIssueSeverity = (code: string): 'error' | 'warning' | 'info' => {
    if (!code) return 'info';
    const num = parseInt(code.replace('WF', ''), 10);
    if (Number.isNaN(num)) return 'info';
    if (num < 100) return 'error';    // 基础结构
    if (num < 200) return 'error';    // 语义
    if (num < 300) return 'warning';  // 依赖
    return 'error';                   // 发布条件
};

const SEVERITY_LABEL: Record<string, string> = {
    error: '🔴 阻塞',
    warning: '🟡 警告',
    info: '🔵 提示',
};

const SEVERITY_TAG_COLOR: Record<string, string> = {
    error: 'error',
    warning: 'warning',
    info: 'processing',
};

const getIssueLabel = (code: string): string => ISSUE_CODE_LABEL_MAP[code] || code;

export interface WorkflowDefinitionPublishWizardModalProps {
    publishWizardVersion: WorkflowVersionDto | null;
    publishWizardDependencyResult: WorkflowDependencyCheckResult | null;
    publishWizardHasDependencyBlock: boolean;
    publishWizardUnpublishedCount: number;
    publishWizardUnavailableCount: number;
    publishWizardValidationLoading: boolean;

    publishWizardValidationResult: any;
    publishWizardHasValidationBlock: boolean;
    publishWizardCurrentStep: number;
    publishWizardDryRunPreview: PublishDryRunPreview | null;
    publishWizardDependencyRefreshing: boolean;
    publishWizardDryRunLoading: boolean;
    isPublishWizardPublishing: boolean;
    publishWizardPreviewIssueCount: number;
    onClose: () => void;
    onRefreshDependencies: () => void;
    onRevalidate: () => void;
    onDryRun: () => void;
    onPublish: () => void;
    onGoToStudio: () => void;
}

export const WorkflowDefinitionPublishWizardModal: React.FC<WorkflowDefinitionPublishWizardModalProps> = ({
    publishWizardVersion,
    publishWizardDependencyResult,
    publishWizardHasDependencyBlock,
    publishWizardUnpublishedCount,
    publishWizardUnavailableCount,
    publishWizardValidationLoading,
    publishWizardValidationResult,
    publishWizardHasValidationBlock,
    publishWizardCurrentStep,
    publishWizardDryRunPreview,
    publishWizardDependencyRefreshing,
    publishWizardDryRunLoading,
    isPublishWizardPublishing,
    publishWizardPreviewIssueCount,
    onClose,
    onRefreshDependencies,
    onRevalidate,
    onDryRun,
    onPublish,
    onGoToStudio,
}) => {
    const renderDependencySection = (title: string, group: WorkflowDependencyGroup) => {
        if (!hasDependencyIssues(group)) return null;
        const buildKeywordLink = (path: string, code: string): string =>
            `${path}?keyword=${encodeURIComponent(code)}&page=1&pageSize=20`;

        const renderCodeTags = (codes: string[], path: string, label: string) => {
            if (codes.length === 0) return null;
            return (
                <Space size={[4, 4]} wrap>
                    <Text type="secondary">{label}:</Text>
                    {codes.map((code) => (
                        <Tag key={`${path}-${code}`} color="processing">
                            <a href={buildKeywordLink(path, code)} target="_blank" rel="noreferrer">
                                {code}
                            </a>
                        </Tag>
                    ))}
                </Space>
            );
        };

        return (
            <Space direction="vertical" size={6}>
                <Text strong>{title}</Text>
                {renderCodeTags(group.rulePacks, '/workflow/rules', '规则包')}
                {renderCodeTags(group.parameterSets, '/workflow/parameters', '参数包')}
                {renderCodeTags(group.agentProfiles, '/workflow/agents', '智能体')}
            </Space>
        );
    };

    const renderDependencyQuickActions = (result: WorkflowDependencyCheckResult) => {
        const needRuleCenter = result.unpublished.rulePacks.length > 0 || result.unavailable.rulePacks.length > 0;
        const needParameterCenter = result.unpublished.parameterSets.length > 0 || result.unavailable.parameterSets.length > 0;
        const needAgentCenter = result.unpublished.agentProfiles.length > 0 || result.unavailable.agentProfiles.length > 0;
        if (!needRuleCenter && !needParameterCenter && !needAgentCenter) return null;
        return (
            <Space wrap size={8}>
                {needRuleCenter && <Button size="small" href="/workflow/rules" target="_blank">前往规则中心</Button>}
                {needParameterCenter && <Button size="small" href="/workflow/parameters" target="_blank">前往参数中心</Button>}
                {needAgentCenter && <Button size="small" href="/workflow/agents" target="_blank">前往智能体中心</Button>}
            </Space>
        );
    };

    const hasBlockingDependencyIssuesLocal = (result?: WorkflowDependencyCheckResult | null) =>
        Boolean(result && (hasDependencyIssues(result.unpublished) || hasDependencyIssues(result.unavailable)));

    return (
        <Modal
            open={Boolean(publishWizardVersion)}
            width={820}
            title={publishWizardVersion ? `发布修复向导 - ${publishWizardVersion.versionCode}` : '发布修复向导'}
            onCancel={onClose}
            footer={[
                <Button key="cancel" onClick={onClose}>
                    关闭
                </Button>,
                <Button key="dry-run" loading={publishWizardDryRunLoading} onClick={onDryRun}>
                    发布预演
                </Button>,
                <Button
                    key="publish"
                    type="primary"
                    loading={isPublishWizardPublishing}
                    disabled={!publishWizardVersion || publishWizardHasDependencyBlock || publishWizardHasValidationBlock || publishWizardValidationLoading}
                    onClick={onPublish}
                >
                    确认发布
                </Button>,
            ]}
        >
            {publishWizardVersion ? (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Steps
                        size="small"
                        current={publishWizardCurrentStep}
                        items={[
                            {
                                title: '依赖检查',
                                description: publishWizardHasDependencyBlock && publishWizardDependencyResult
                                    ? `待发布 ${publishWizardUnpublishedCount}，不可用 ${publishWizardUnavailableCount}`
                                    : '依赖就绪',
                            },
                            {
                                title: '发布校验',
                                description: publishWizardValidationLoading
                                    ? '校验中'
                                    : publishWizardValidationResult?.valid
                                        ? '校验通过'
                                        : '需修复校验问题',
                            },
                            { title: '执行发布', description: '满足条件后发布版本' },
                        ]}
                    />

                    <Alert
                        showIcon
                        type={publishWizardHasDependencyBlock || publishWizardHasValidationBlock ? 'warning' : 'success'}
                        message={publishWizardHasDependencyBlock || publishWizardHasValidationBlock ? '发布前仍有阻塞项' : '已满足发布条件，可直接发布'}
                        description={
                            publishWizardHasDependencyBlock
                                ? `依赖阻塞：待发布 ${publishWizardUnpublishedCount} 项，不可用 ${publishWizardUnavailableCount} 项。`
                                : publishWizardHasValidationBlock
                                    ? '依赖已就绪，但发布校验仍未通过。'
                                    : '依赖与发布校验均通过。'
                        }
                    />

                    <Card
                        size="small"
                        title="步骤 1：依赖修复"
                        extra={
                            <Button size="small" loading={publishWizardDependencyRefreshing} onClick={onRefreshDependencies}>
                                刷新依赖目录
                            </Button>
                        }
                    >
                        {publishWizardDependencyResult ? (
                            <Space direction="vertical" size={8}>
                                {renderDependencySection('未发布依赖（需要 version >= 2）', publishWizardDependencyResult.unpublished)}
                                {renderDependencySection('不可用依赖（不存在、未启用或无权限）', publishWizardDependencyResult.unavailable)}
                                {renderDependencyQuickActions(publishWizardDependencyResult)}
                                {!hasBlockingDependencyIssuesLocal(publishWizardDependencyResult) && <Text type="success">依赖已就绪。</Text>}
                            </Space>
                        ) : (
                            <Text type="secondary">暂无依赖检查结果。</Text>
                        )}
                    </Card>

                    <Card
                        size="small"
                        title="步骤 2：发布校验"
                        extra={
                            <Space>
                                {!publishWizardValidationResult?.valid && (
                                    <Button size="small" type="link" onClick={onGoToStudio}>
                                        去画布修复
                                    </Button>
                                )}
                                <Button size="small" loading={publishWizardValidationLoading} onClick={onRevalidate}>
                                    重新校验
                                </Button>
                            </Space>
                        }
                    >
                        {publishWizardValidationLoading ? (
                            <Text type="secondary">正在校验流程结构和发布规则，请稍候...</Text>
                        ) : publishWizardValidationResult ? (
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Alert
                                    showIcon
                                    type={publishWizardValidationResult.valid ? 'success' : 'warning'}
                                    message={publishWizardValidationResult.valid ? '发布校验通过' : `发布校验未通过（${publishWizardValidationResult.issues.length} 项）`}
                                />
                                {!publishWizardValidationResult.valid && (
                                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                        {publishWizardValidationResult.issues.slice(0, 10).map((issue: any, idx: number) => {
                                            const severity = getIssueSeverity(issue.code);
                                            return (
                                                <Tooltip
                                                    key={`${issue.code}-${idx}`}
                                                    title={`建议：请检查流程画布中相关${getIssueLabel(issue.code)}配置`}
                                                >
                                                    <Space size={8} align="start" style={{ width: '100%' }}>
                                                        <Tag color={SEVERITY_TAG_COLOR[severity]} style={{ minWidth: 60, textAlign: 'center' }}>
                                                            {SEVERITY_LABEL[severity]}
                                                        </Tag>
                                                        <Tag color="default" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                                            {issue.code}
                                                        </Tag>
                                                        <Text
                                                            type={severity === 'error' ? 'danger' : 'secondary'}
                                                            style={{ flex: 1 }}
                                                        >
                                                            <Text strong style={{ marginRight: 4, color: 'inherit' }}>
                                                                [{getIssueLabel(issue.code)}]
                                                            </Text>
                                                            {issue.message}
                                                        </Text>
                                                    </Space>
                                                </Tooltip>
                                            );
                                        })}
                                        {publishWizardValidationResult.issues.length > 10 && (
                                            <Text type="secondary" style={{ paddingLeft: 4 }}>
                                                ...还有 {publishWizardValidationResult.issues.length - 10} 项问题未展示
                                            </Text>
                                        )}
                                    </Space>
                                )}
                            </Space>
                        ) : (
                            <Text type="secondary">尚未进行发布校验。</Text>
                        )}
                    </Card>

                    {publishWizardDryRunPreview && (
                        <Card
                            size="small"
                            title="预演结果（不发布）"
                            extra={!publishWizardDryRunPreview.readyToPublish && (
                                <Button size="small" type="link" onClick={onGoToStudio}>
                                    去画布修复
                                </Button>
                            )}
                        >
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Alert
                                    showIcon
                                    type={publishWizardDryRunPreview.readyToPublish ? 'success' : 'warning'}
                                    message={publishWizardDryRunPreview.readyToPublish ? '预演通过：当前版本可发布' : '预演未通过：存在阻塞项'}
                                    description={`生成时间：${dayjs(publishWizardDryRunPreview.generatedAt).format('YYYY-MM-DD HH:mm:ss')}`}
                                />
                                {publishWizardDryRunPreview.blockers.length > 0 ? (
                                    <Space direction="vertical" size={4}>
                                        {publishWizardDryRunPreview.blockers.map((item, index) => (
                                            <Text key={`${item}-${index}`} type="secondary">
                                                {index + 1}. {item}
                                            </Text>
                                        ))}
                                    </Space>
                                ) : (
                                    <Text type="success">无阻塞项，可执行发布。</Text>
                                )}
                                <Text type="secondary">
                                    预演摘要：待发布依赖 {countDependencyIssues(publishWizardDryRunPreview.dependencyResult.unpublished)} 项，
                                    不可用依赖 {countDependencyIssues(publishWizardDryRunPreview.dependencyResult.unavailable)} 项，
                                    校验问题 {publishWizardPreviewIssueCount} 项。
                                </Text>
                            </Space>
                        </Card>
                    )}

                    <Divider style={{ margin: 0 }} />
                    <Text type="secondary">
                        完成以上两步后，点击“确认发布”执行版本发布。若已在其他页面处理依赖，请先刷新依赖目录再发布。
                    </Text>
                </Space>
            ) : null}
        </Modal>
    );
};

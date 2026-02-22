import React from 'react';
import { Alert, Button, Card, Divider, Modal, Space, Steps, Typography, Tag } from 'antd';
import dayjs from 'dayjs';
import { WorkflowVersionDto } from '@packages/types';
import { WorkflowDependencyCheckResult, WorkflowDependencyGroup, PublishDryRunPreview } from './types';
import { countDependencyIssues, hasDependencyIssues } from './utils';

const { Text } = Typography;

export interface WorkflowDefinitionPublishWizardModalProps {
    publishWizardVersion: WorkflowVersionDto | null;
    publishWizardDependencyResult: WorkflowDependencyCheckResult | null;
    publishWizardHasDependencyBlock: boolean;
    publishWizardUnpublishedCount: number;
    publishWizardUnavailableCount: number;
    publishWizardValidationLoading: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validation result structure
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
                            <Button size="small" loading={publishWizardValidationLoading} onClick={onRevalidate}>
                                重新校验
                            </Button>
                        }
                    >
                        {publishWizardValidationLoading ? (
                            <Text type="secondary">正在校验流程结构和发布规则，请稍候...</Text>
                        ) : publishWizardValidationResult ? (
                            <Space direction="vertical" size={8}>
                                <Alert
                                    showIcon
                                    type={publishWizardValidationResult.valid ? 'success' : 'warning'}
                                    message={publishWizardValidationResult.valid ? '发布校验通过' : `发布校验未通过（${publishWizardValidationResult.issues.length} 项）`}
                                />
                                {!publishWizardValidationResult.valid && (
                                    <Space direction="vertical" size={4}>
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped API response iteration
                                        {publishWizardValidationResult.issues.slice(0, 8).map((issue: any) => (
                                            <Text key={`${issue.code}-${issue.message}`} type="secondary">
                                                {issue.code}: {issue.message}
                                            </Text>
                                        ))}
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

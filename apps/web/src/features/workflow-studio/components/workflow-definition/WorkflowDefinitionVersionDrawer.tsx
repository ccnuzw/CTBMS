import React from 'react';
import { Alert, Button, Drawer, Select, Space, Table, Tag, Typography, Input, DatePicker } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { WorkflowDefinitionDto, WorkflowPublishAuditDto, WorkflowValidationResult, WorkflowVersionDto } from '@packages/types';
import { WorkflowDependencyCheckResult, WorkflowDependencyGroup } from './types';
import { getWorkflowVersionStatusLabel, getWorkflowPublishOperationLabel, countDependencyIssues, hasDependencyIssues, checkPublishDependenciesByLookups } from './utils';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Re-use color maps
const versionStatusColorMap: Record<string, string> = {
    DRAFT: 'default',
    PUBLISHED: 'green',
    ARCHIVED: 'orange',
};

export interface WorkflowDefinitionVersionDrawerProps {
    open: boolean;
    onClose: () => void;
    definition: WorkflowDefinitionDto | null;
    versions: WorkflowVersionDto[];
    isVersionLoading: boolean;
     
    publishAuditPage: any;
    isPublishAuditLoading: boolean;
    validationResult: WorkflowValidationResult | null;
    latestDraftVersion: WorkflowVersionDto | undefined;
    latestDraftDependencyResult: WorkflowDependencyCheckResult | null;
    latestDraftUnpublishedCount: number;
    latestDraftUnavailableCount: number;
    latestDraftHasBlockingIssues: boolean;
    dependencyCatalogLoading: boolean;
    auditWorkflowVersionId?: string;
    setAuditWorkflowVersionId: (v?: string) => void;
    auditPublisherInput: string;
    setAuditPublisherInput: (v: string) => void;
    setAuditPublisher: (v?: string) => void;
    auditPublishedAtRange: [Dayjs, Dayjs] | null;
    setAuditPublishedAtRange: (v: [Dayjs, Dayjs] | null) => void;
    auditPage: number;
    auditPageSize: number;
    setAuditPage: (v: number) => void;
    setAuditPageSize: (v: number) => void;
    auditVersionOptions: { label: string; value: string }[];
    versionColumns: ColumnsType<WorkflowVersionDto>;
    publishAuditColumns: ColumnsType<WorkflowPublishAuditDto>;
    handleValidateLatestForPublish: () => void;
    handleCreateDraftVersion: () => void;
    isValidatingPublish: boolean;
    isCreatingDraft: boolean;
}

export const WorkflowDefinitionVersionDrawer: React.FC<WorkflowDefinitionVersionDrawerProps> = ({
    open,
    onClose,
    definition,
    versions,
    isVersionLoading,
    publishAuditPage,
    isPublishAuditLoading,
    validationResult,
    latestDraftVersion,
    latestDraftDependencyResult,
    latestDraftUnpublishedCount,
    latestDraftUnavailableCount,
    latestDraftHasBlockingIssues,
    dependencyCatalogLoading,
    auditWorkflowVersionId,
    setAuditWorkflowVersionId,
    auditPublisherInput,
    setAuditPublisherInput,
    setAuditPublisher,
    auditPublishedAtRange,
    setAuditPublishedAtRange,
    auditPage,
    auditPageSize,
    setAuditPage,
    setAuditPageSize,
    auditVersionOptions,
    versionColumns,
    publishAuditColumns,
    handleValidateLatestForPublish,
    handleCreateDraftVersion,
    isValidatingPublish,
    isCreatingDraft,
}) => {
    const renderDependencySection = (title: string, group: WorkflowDependencyGroup) => {
        if (!hasDependencyIssues(group)) {
            return null;
        }
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

    return (
        <Drawer
            title={`版本列表 - ${definition?.name || ''}`}
            open={open}
            width={1400}
            extra={
                <Space>
                    <Button
                        onClick={handleValidateLatestForPublish}
                        loading={isValidatingPublish}
                        disabled={!versions?.length}
                    >
                        校验最新版本
                    </Button>
                    <Button
                        type="primary"
                        onClick={handleCreateDraftVersion}
                        loading={isCreatingDraft}
                        disabled={!versions?.length}
                    >
                        新建草稿版本
                    </Button>
                </Space>
            }
            onClose={onClose}
        >
            {validationResult ? (
                <Alert
                    style={{ marginBottom: 12 }}
                    showIcon
                    type={validationResult.valid ? 'success' : 'warning'}
                    message={
                        validationResult.valid
                            ? '发布校验通过'
                            : `发布校验未通过（${validationResult.issues.length} 项）`
                    }
                    description={
                        validationResult.valid
                            ? undefined
                            : validationResult.issues
                                .slice(0, 5)
                                .map((issue) => `${issue.code}: ${issue.message}`)
                                .join('；')
                    }
                />
            ) : null}
            {latestDraftVersion ? (
                <Alert
                    style={{ marginBottom: 12 }}
                    showIcon
                    type={
                        dependencyCatalogLoading
                            ? 'info'
                            : latestDraftHasBlockingIssues
                                ? 'warning'
                                : 'success'
                    }
                    message={
                        dependencyCatalogLoading
                            ? `草稿版本 ${latestDraftVersion.versionCode} 依赖检查中`
                            : latestDraftHasBlockingIssues
                                ? `草稿版本 ${latestDraftVersion.versionCode} 存在依赖阻塞`
                                : `草稿版本 ${latestDraftVersion.versionCode} 依赖已就绪`
                    }
                    description={
                        dependencyCatalogLoading ? (
                            '正在加载规则包、参数包与智能体目录。'
                        ) : latestDraftHasBlockingIssues ? (
                            <Space direction="vertical" size={8}>
                                <Text type="secondary">
                                    待发布依赖 {latestDraftUnpublishedCount} 项，不可用依赖 {latestDraftUnavailableCount}{' '}
                                    项。
                                </Text>
                                {latestDraftDependencyResult && renderDependencySection('未发布依赖（需要 version >= 2）', latestDraftDependencyResult.unpublished)}
                                {latestDraftDependencyResult && renderDependencySection('不可用依赖（不存在、未启用或无权限）', latestDraftDependencyResult.unavailable)}
                                {latestDraftDependencyResult && renderDependencyQuickActions(latestDraftDependencyResult)}
                            </Space>
                        ) : (
                            '该草稿版本可直接发起发布。'
                        )
                    }
                />
            ) : null}
            <Table
                rowKey="id"
                loading={isVersionLoading}
                columns={versionColumns}
                dataSource={versions || []}
                pagination={false}
            />
            <Title level={5} style={{ marginTop: 20 }}>
                发布审计
            </Title>
            <Space wrap style={{ marginBottom: 12 }}>
                <Select
                    allowClear
                    style={{ width: 220 }}
                    placeholder="按发布版本筛选"
                    options={auditVersionOptions}
                    value={auditWorkflowVersionId}
                    onChange={(value) => {
                        setAuditWorkflowVersionId(value);
                        setAuditPage(1);
                    }}
                />
                <Input.Search
                    allowClear
                    style={{ width: 220 }}
                    placeholder="按发布人筛选"
                    value={auditPublisherInput}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setAuditPublisherInput(nextValue);
                        if (!nextValue.trim()) {
                            setAuditPublisher(undefined);
                            setAuditPage(1);
                        }
                    }}
                    onSearch={(value) => {
                        const normalized = value.trim();
                        setAuditPublisher(normalized ? normalized : undefined);
                        setAuditPage(1);
                    }}
                />
                <RangePicker
                    value={auditPublishedAtRange}
                    onChange={(value) => {
                        setAuditPublishedAtRange(value as [Dayjs, Dayjs] | null);
                        setAuditPage(1);
                    }}
                />
                <Button
                    onClick={() => {
                        setAuditWorkflowVersionId(undefined);
                        setAuditPublisherInput('');
                        setAuditPublisher(undefined);
                        setAuditPublishedAtRange(null);
                        setAuditPage(1);
                        setAuditPageSize(10);
                    }}
                >
                    重置审计筛选
                </Button>
            </Space>
            <Table
                rowKey="id"
                loading={isPublishAuditLoading}
                columns={publishAuditColumns}
                dataSource={publishAuditPage?.data || []}
                pagination={{
                    current: publishAuditPage?.page || auditPage,
                    pageSize: publishAuditPage?.pageSize || auditPageSize,
                    total: publishAuditPage?.total || 0,
                    showSizeChanger: true,
                    onChange: (nextPage, nextPageSize) => {
                        setAuditPage(nextPage);
                        setAuditPageSize(nextPageSize);
                    },
                }}
                scroll={{ x: 900 }}
            />
        </Drawer>
    );
};

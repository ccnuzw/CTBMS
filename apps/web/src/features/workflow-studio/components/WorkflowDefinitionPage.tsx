import React, { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { Button, Card, Input, Select, Space, Switch, Table, Tag, Typography, Popconfirm, Drawer, Alert } from 'antd';
import { WorkflowDefinitionDto, WorkflowDefinitionStatus, WorkflowMode, WorkflowUsageMethod, WorkflowVersionDto, WorkflowPublishAuditDto } from '@packages/types';

import { useWorkflowDefinitionViewModel } from './workflow-definition/useWorkflowDefinitionViewModel';
import { WorkflowDefinitionCreateDrawer } from './workflow-definition/WorkflowDefinitionCreateDrawer';
import { WorkflowDefinitionVersionDrawer } from './workflow-definition/WorkflowDefinitionVersionDrawer';
import { WorkflowDefinitionPublishWizardModal } from './workflow-definition/WorkflowDefinitionPublishWizardModal';
import {
  modeOptions,
  usageMethodOptions,
  definitionStatusOptions,
  definitionStatusColorMap,
  workflowDefinitionStatusLabelMap,
  workflowModeLabelMap,
  workflowUsageMethodLabelMap,
  versionStatusColorMap,
} from './workflow-definition/constants';
import { getWorkflowVersionStatusLabel, getWorkflowPublishOperationLabel, countDependencyIssues } from './workflow-definition/utils';

import { WorkflowCanvas } from '../canvas/WorkflowCanvas';
import { VersionDiffViewer } from './VersionDiffViewer';

const { Title, Text } = Typography;

export const WorkflowDefinitionPage: React.FC = () => {
  const viewModel = useWorkflowDefinitionViewModel();
  const { state, queries, options, actions, mutations } = viewModel;

  const strictModeSourceLabel =
    queries.strictModeSetting?.source === 'DB' ? '系统配置' : queries.strictModeSetting?.source === 'ENV' ? '环境变量' : '默认值';

  const definitionColumns = useMemo<ColumnsType<WorkflowDefinitionDto>>(
    () => [
      { title: '流程名称', dataIndex: 'name', width: 240 },
      { title: '流程编码', dataIndex: 'workflowId', width: 220 },
      {
        title: '模式', dataIndex: 'mode', width: 120,
        render: (value: WorkflowMode) => <Tag color="blue">{workflowModeLabelMap[value] || value}</Tag>
      },
      {
        title: '使用方式', dataIndex: 'usageMethod', width: 160,
        render: (value: WorkflowUsageMethod) => <Tag>{workflowUsageMethodLabelMap[value] || value}</Tag>
      },
      {
        title: '状态', dataIndex: 'status', width: 120,
        render: (value: string) => (
          <Tag color={definitionStatusColorMap[value] ?? 'default'}>
            {workflowDefinitionStatusLabelMap[value as WorkflowDefinitionStatus] || value}
          </Tag>
        )
      },
      { title: '最新版本', dataIndex: 'latestVersionCode', width: 120, render: (value?: string | null) => value || '-' },
      {
        title: '更新时间', dataIndex: 'updatedAt', width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-')
      },
      {
        title: '操作', key: 'actions', fixed: 'right', width: 140,
        render: (_: unknown, record: WorkflowDefinitionDto) => (
          <Button type="link" onClick={() => { state.setSelectedDefinition(record); state.setVersionVisible(true); }}>
            查看版本
          </Button>
        )
      },
    ],
    [state]
  );

  const versionColumns = useMemo<ColumnsType<WorkflowVersionDto>>(
    () => [
      { title: '版本号', dataIndex: 'versionCode', width: 120 },
      {
        title: '状态', dataIndex: 'status', width: 120,
        render: (value: string) => <Tag color={versionStatusColorMap[value] ?? 'default'}>{getWorkflowVersionStatusLabel(value)}</Tag>
      },
      { title: '变更说明', dataIndex: 'changelog', render: (value?: string | null) => value || '-' },
      { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-') },
      { title: '发布时间', dataIndex: 'publishedAt', width: 180, render: (value?: Date | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-') },
      {
        title: '依赖状态', key: 'dependencyStatus', width: 180,
        render: (_: unknown, record: WorkflowVersionDto) => {
          if (record.status !== 'DRAFT') return <Tag>已冻结</Tag>;
          if (queries.dependencyCatalogLoading) return <Tag color="processing">检查中</Tag>;
          const dependencyResult = actions.checkPublishDependencies(record.dslSnapshot);
          const unpublishedCount = countDependencyIssues(dependencyResult.unpublished);
          const unavailableCount = countDependencyIssues(dependencyResult.unavailable);
          if (unpublishedCount === 0 && unavailableCount === 0) return <Tag color="green">可发布</Tag>;
          return (
            <Space size={4} wrap>
              {unpublishedCount > 0 && <Tag color="orange">待发布 {unpublishedCount}</Tag>}
              {unavailableCount > 0 && <Tag color="red">不可用 {unavailableCount}</Tag>}
            </Space>
          );
        }
      },
      {
        title: '操作', key: 'actions', width: 280,
        render: (_: unknown, record: WorkflowVersionDto) => {
          const isPublishing = mutations.publishMutation.isPending && state.publishingVersionId === record.id;
          const isRunning = mutations.triggerExecutionMutation.isPending && state.runningVersionId === record.id;
          const canOpenPublishWizard = record.status === 'DRAFT' && Boolean(state.selectedDefinition?.id);
          const canRun = record.status === 'PUBLISHED' && Boolean(state.selectedDefinition?.id);
          return (
            <Space size={4}>
              <Button type="link" onClick={() => { state.setStudioVersion(record); state.setStudioVisible(true); }}>画布编辑</Button>
              <Button type="link" disabled={(queries.versions?.length ?? 0) < 2} onClick={() => state.setDiffVisible(true)}>版本对比</Button>
              <Button type="link" disabled={!canOpenPublishWizard || queries.dependencyCatalogLoading} loading={isPublishing} onClick={() => actions.handleOpenPublishWizard(record)}>发布版本</Button>
              <Popconfirm title="确认触发运行该版本？" onConfirm={() => actions.handleTriggerExecution(record)} disabled={!canRun}>
                <Button type="link" disabled={!canRun} loading={isRunning}>触发运行</Button>
              </Popconfirm>
            </Space>
          );
        }
      }
    ],
    [queries, actions, mutations, state]
  );

  const versionCodeMap = useMemo(() => new Map((queries.versions || []).map((item: any) => [item.id, item.versionCode])), [queries.versions]);

  const auditVersionOptions = useMemo(
    () => (queries.versions || []).map((item: any) => ({ label: item.versionCode, value: item.id })),
    [queries.versions]
  );

  const publishAuditColumns = useMemo<ColumnsType<WorkflowPublishAuditDto>>(
    () => [
      { title: '发布时间', dataIndex: 'publishedAt', width: 180, render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-') },
      { title: '发布版本', dataIndex: 'workflowVersionId', width: 120, render: (value: string) => versionCodeMap.get(value) || value.slice(0, 8) },
      { title: '操作', dataIndex: 'operation', width: 120, render: (value: string) => <Tag color="blue">{getWorkflowPublishOperationLabel(value)}</Tag> },
      { title: '发布人', dataIndex: 'publishedByUserId', width: 150, render: (_: unknown, r: WorkflowPublishAuditDto) => r.publishedByUserName || r.publishedByUserId },
      { title: '备注', dataIndex: 'comment', render: (value?: string | null) => value || '-' },
      { title: '记录时间', dataIndex: 'createdAt', width: 180, render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-') },
    ],
    [versionCodeMap]
  );

  const latestDraftVersion = useMemo(() => (queries.versions || []).find((item: any) => item.status === 'DRAFT'), [queries.versions]);
  const latestDraftDependencyResult = latestDraftVersion && !queries.dependencyCatalogLoading ? actions.checkPublishDependencies(latestDraftVersion.dslSnapshot) : null;
  const latestDraftUnpublishedCount = latestDraftDependencyResult ? countDependencyIssues(latestDraftDependencyResult.unpublished) : 0;
  const latestDraftUnavailableCount = latestDraftDependencyResult ? countDependencyIssues(latestDraftDependencyResult.unavailable) : 0;
  const latestDraftHasBlockingIssues = latestDraftUnpublishedCount > 0 || latestDraftUnavailableCount > 0;

  const publishWizardHasDependencyBlock = Boolean(
    state.publishWizardDependencyResult &&
    (countDependencyIssues(state.publishWizardDependencyResult.unpublished) > 0 || countDependencyIssues(state.publishWizardDependencyResult.unavailable) > 0)
  );
  const publishWizardHasValidationBlock = state.publishWizardValidationResult ? !state.publishWizardValidationResult.valid : true;
  const publishWizardCurrentStep = publishWizardHasDependencyBlock ? 0 : (state.publishWizardValidationLoading || publishWizardHasValidationBlock ? 1 : 2);
  const publishWizardPreviewIssueCount = state.publishWizardDryRunPreview?.validationResult?.issues.length ?? 0;
  const isPublishWizardPublishing = mutations.publishMutation.isPending && state.publishingVersionId === state.publishWizardVersion?.id;

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={4} style={{ marginBottom: 0 }}>工作流定义管理</Title>
            <Text type="secondary">第一阶段能力：流程定义、版本快照、版本发布。</Text>
          </div>
          <Space wrap size={12}>
            <Space size={6}>
              <Text type="secondary">Agent 严格模式</Text>
              <Switch checked={queries.strictModeSetting?.enabled ?? false} loading={queries.strictModeLoading || mutations.updateStrictModeMutation.isPending} checkedChildren="严格" unCheckedChildren="宽松" onChange={actions.handleStrictModeChange} />
              <Tag color="blue">{strictModeSourceLabel}</Tag>
            </Space>
            <Button type="primary" onClick={() => state.setCreateVisible(true)}>新建流程</Button>
          </Space>
        </Space>

        <Space wrap>
          <Input.Search allowClear style={{ width: 280 }} placeholder="关键词（流程名称/编码）" value={state.keywordInput} onChange={(e) => { const val = e.target.value; state.setKeywordInput(val); if (!val.trim()) { state.setKeyword(undefined); state.setDefinitionPageNumber(1); } }} onSearch={(val) => { const norm = val.trim(); state.setKeyword(norm ? norm : undefined); state.setDefinitionPageNumber(1); }} />
          <Select allowClear style={{ width: 180 }} placeholder="按模式筛选" options={modeOptions} value={state.selectedMode} onChange={(val) => { state.setSelectedMode(val); state.setDefinitionPageNumber(1); }} />
          <Select allowClear style={{ width: 200 }} placeholder="按使用方式筛选" options={usageMethodOptions} value={state.selectedUsageMethod} onChange={(val) => { state.setSelectedUsageMethod(val); state.setDefinitionPageNumber(1); }} />
          <Select allowClear style={{ width: 180 }} placeholder="按状态筛选" options={definitionStatusOptions} value={state.selectedStatus} onChange={(val) => { state.setSelectedStatus(val); state.setDefinitionPageNumber(1); }} />
          <Select style={{ width: 180 }} options={[{ label: '包含公共模板', value: true }, { label: '仅私有流程', value: false }]} value={state.includePublic} onChange={(val: boolean) => { state.setIncludePublic(val); state.setDefinitionPageNumber(1); }} />
          <Button onClick={() => { state.setKeywordInput(''); state.setKeyword(undefined); state.setSelectedMode(undefined); state.setSelectedUsageMethod(undefined); state.setSelectedStatus(undefined); state.setIncludePublic(true); state.setDefinitionPageNumber(1); state.setDefinitionPageSize(20); }}>重置筛选</Button>
        </Space>

        <Table rowKey="id" loading={queries.isDefinitionLoading} columns={definitionColumns} dataSource={queries.definitionPage?.data || []} pagination={{ current: queries.definitionPage?.page || state.definitionPageNumber, pageSize: queries.definitionPage?.pageSize || state.definitionPageSize, total: queries.definitionPage?.total || 0, showSizeChanger: true, onChange: (p, s) => { state.setDefinitionPageNumber(p); state.setDefinitionPageSize(s); } }} scroll={{ x: 1200 }} />
      </Space>

      <WorkflowDefinitionCreateDrawer
        open={state.createVisible}
        onClose={() => state.setCreateVisible(false)}
        rulePackOptions={options.rulePackOptions}
        agentBindingOptions={options.agentBindingOptions}
        parameterBindingOptions={options.parameterBindingOptions}
        dataConnectorBindingOptions={options.dataConnectorBindingOptions}
        isRulePackLoading={queries.isRulePackLoading}
        isAgentProfileLoading={queries.isAgentProfileLoading}
        isParameterSetLoading={queries.isParameterSetLoading}
        isDataConnectorLoading={queries.isDataConnectorLoading}
      />

      <WorkflowDefinitionVersionDrawer
        open={state.versionVisible}
        onClose={() => {
          state.setVersionVisible(false);
          state.setSelectedDefinition(null);
          state.setValidationResult(null);
          state.setStudioVisible(false);
          state.setDiffVisible(false);
          state.setStudioVersion(null);
        }}
        definition={state.selectedDefinition}
        versions={queries.versions || []}
        isVersionLoading={queries.isVersionLoading}
        publishAuditPage={queries.publishAuditPage}
        isPublishAuditLoading={queries.isPublishAuditLoading}
        validationResult={state.validationResult}
        latestDraftVersion={latestDraftVersion}
        latestDraftDependencyResult={latestDraftDependencyResult}
        latestDraftUnpublishedCount={latestDraftUnpublishedCount}
        latestDraftUnavailableCount={latestDraftUnavailableCount}
        latestDraftHasBlockingIssues={latestDraftHasBlockingIssues}
        dependencyCatalogLoading={queries.dependencyCatalogLoading}
        auditWorkflowVersionId={state.auditWorkflowVersionId}
        setAuditWorkflowVersionId={state.setAuditWorkflowVersionId}
        auditPublisherInput={state.auditPublisherInput}
        setAuditPublisherInput={state.setAuditPublisherInput}
        setAuditPublisher={state.setAuditPublisher}
        auditPublishedAtRange={state.auditPublishedAtRange}
        setAuditPublishedAtRange={state.setAuditPublishedAtRange}
        auditPage={state.auditPage}
        auditPageSize={state.auditPageSize}
        setAuditPage={state.setAuditPage}
        setAuditPageSize={state.setAuditPageSize}
        auditVersionOptions={auditVersionOptions}
        versionColumns={versionColumns}
        publishAuditColumns={publishAuditColumns}
        handleValidateLatestForPublish={actions.handleValidateLatestForPublish}
        handleCreateDraftVersion={actions.handleCreateDraftVersion}
        isValidatingPublish={mutations.validateDslMutation.isPending}
        isCreatingDraft={mutations.createVersionMutation.isPending}
      />

      <WorkflowDefinitionPublishWizardModal
        publishWizardVersion={state.publishWizardVersion}
        publishWizardDependencyResult={state.publishWizardDependencyResult}
        publishWizardHasDependencyBlock={publishWizardHasDependencyBlock}
        publishWizardUnpublishedCount={state.publishWizardDependencyResult ? countDependencyIssues(state.publishWizardDependencyResult.unpublished) : 0}
        publishWizardUnavailableCount={state.publishWizardDependencyResult ? countDependencyIssues(state.publishWizardDependencyResult.unavailable) : 0}
        publishWizardValidationLoading={state.publishWizardValidationLoading}
        publishWizardValidationResult={state.publishWizardValidationResult}
        publishWizardHasValidationBlock={publishWizardHasValidationBlock}
        publishWizardCurrentStep={publishWizardCurrentStep}
        publishWizardDryRunPreview={state.publishWizardDryRunPreview}
        publishWizardDependencyRefreshing={state.publishWizardDependencyRefreshing}
        publishWizardDryRunLoading={state.publishWizardDryRunLoading}
        isPublishWizardPublishing={isPublishWizardPublishing}
        publishWizardPreviewIssueCount={publishWizardPreviewIssueCount}
        onClose={() => { state.setPublishWizardVersion(null); state.setPublishWizardDependencyResult(null); state.setPublishWizardValidationResult(null); state.setPublishWizardValidationLoading(false); state.setPublishWizardDependencyRefreshing(false); state.setPublishWizardDryRunLoading(false); state.setPublishWizardDryRunPreview(null); }}
        onRefreshDependencies={actions.handleRefreshPublishWizardDependencies}
        onRevalidate={() => { if (state.publishWizardVersion) { actions.runPublishValidationCheck(state.publishWizardVersion); } }}
        onDryRun={actions.handleRunPublishDryRun}
        onPublish={actions.handleConfirmPublishFromWizard}
        onGoToStudio={actions.handleOpenStudioForPublishWizardVersion}
      />

      <Drawer title={`Workflow Studio - ${state.studioVersion?.versionCode || ''}`} open={state.studioVisible} width="100%" destroyOnClose onClose={() => { state.setStudioVisible(false); state.setStudioVersion(null); }}>
        {state.studioVersion && (
          <div style={{ height: '78vh' }}>
            <WorkflowCanvas initialDsl={state.studioVersion.dslSnapshot} onSave={actions.handleSaveStudioDsl} onRun={actions.handleStudioRun} onValidate={actions.handleStudioValidate} currentVersionId={state.studioVersion.id} currentDefinitionId={state.selectedDefinition?.id} />
          </div>
        )}
      </Drawer>

      <Drawer title="版本差异对比" open={state.diffVisible} width={1200} destroyOnClose onClose={() => state.setDiffVisible(false)}>
        {(queries.versions?.length ?? 0) >= 2 ? (
          <VersionDiffViewer versions={queries.versions || []} />
        ) : (
          <Alert type="info" showIcon message="至少需要两个版本才能进行差异对比" />
        )}
      </Drawer>
    </Card>
  );
};

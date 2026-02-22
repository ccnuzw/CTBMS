import React from 'react';
import { Card, Space, Table, Typography, Drawer } from 'antd';

import { ExecutionFilterBar } from './ExecutionFilterBar';
import { ExecutionSummaryCards } from './ExecutionSummaryCards';
import { ExecutionReplayDrawerContent } from './ExecutionReplayDrawerContent';

import { useWorkflowExecutionViewModel } from './workflow-execution/useWorkflowExecutionViewModel';
import { ExecutionDetailDrawer } from './workflow-execution/ExecutionDetailDrawer';

const { Title, Text } = Typography;

export const WorkflowExecutionPage: React.FC = () => {
  const viewModel = useWorkflowExecutionViewModel();

  const { state, queries, options, actions, columns, computed } = viewModel;

  const {
    selectedReplayExecutionId, setSelectedReplayExecutionId,
    versionCodeInput, setVersionCodeInput, setVersionCode,
    keywordInput, setKeywordInput, setKeyword,
    selectedWorkflowDefinitionId, setSelectedWorkflowDefinitionId,
    selectedStatus, setSelectedStatus,
    selectedFailureCategory, setSelectedFailureCategory,
    failureCodeInput, setFailureCodeInput, setFailureCode,
    selectedTriggerType, setSelectedTriggerType,
    selectedRiskLevel, setSelectedRiskLevel,
    selectedDegradeAction, setSelectedDegradeAction,
    selectedRiskGatePresence, setSelectedRiskGatePresence,
    selectedRiskSummaryPresence, setSelectedRiskSummaryPresence,
    startedAtRange, setStartedAtRange,
    onlySoftFailure, setOnlySoftFailure,
    onlyErrorRoute, setOnlyErrorRoute,
    onlyRiskBlocked, setOnlyRiskBlocked,
    riskProfileCodeInput, setRiskProfileCodeInput, setRiskProfileCode,
    riskReasonKeywordInput, setRiskReasonKeywordInput, setRiskReasonKeyword,
    page, setPage,
    pageSize, setPageSize
  } = state;

  const { executionPage, isLoading } = queries;
  const { workflowDefinitionOptions } = computed;
  const { executionColumns } = columns;

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>
            流程运行中心
          </Title>
          <Text type="secondary">查看流程运行实例、节点执行日志和失败原因。</Text>
        </div>

        <ExecutionSummaryCards total={executionPage?.total || 0} />

        <ExecutionFilterBar
          versionCodeInput={versionCodeInput}
          setVersionCodeInput={setVersionCodeInput}
          setVersionCode={setVersionCode}
          keywordInput={keywordInput}
          setKeywordInput={setKeywordInput}
          setKeyword={setKeyword}
          selectedWorkflowDefinitionId={selectedWorkflowDefinitionId}
          setSelectedWorkflowDefinitionId={setSelectedWorkflowDefinitionId}
          selectedStatus={selectedStatus}
          setSelectedStatus={setSelectedStatus}
          selectedFailureCategory={selectedFailureCategory}
          setSelectedFailureCategory={setSelectedFailureCategory}
          failureCodeInput={failureCodeInput}
          setFailureCodeInput={setFailureCodeInput}
          setFailureCode={setFailureCode}
          selectedTriggerType={selectedTriggerType}
          setSelectedTriggerType={setSelectedTriggerType}
          selectedRiskLevel={selectedRiskLevel}
          setSelectedRiskLevel={setSelectedRiskLevel}
          selectedDegradeAction={selectedDegradeAction}
          setSelectedDegradeAction={setSelectedDegradeAction}
          selectedRiskGatePresence={selectedRiskGatePresence}
          setSelectedRiskGatePresence={setSelectedRiskGatePresence}
          selectedRiskSummaryPresence={selectedRiskSummaryPresence}
          setSelectedRiskSummaryPresence={setSelectedRiskSummaryPresence}
          startedAtRange={startedAtRange}
          setStartedAtRange={setStartedAtRange}
          onlySoftFailure={onlySoftFailure}
          setOnlySoftFailure={setOnlySoftFailure}
          onlyErrorRoute={onlyErrorRoute}
          setOnlyErrorRoute={setOnlyErrorRoute}
          onlyRiskBlocked={onlyRiskBlocked}
          setOnlyRiskBlocked={setOnlyRiskBlocked}
          riskProfileCodeInput={riskProfileCodeInput}
          setRiskProfileCodeInput={setRiskProfileCodeInput}
          setRiskProfileCode={setRiskProfileCode}
          riskReasonKeywordInput={riskReasonKeywordInput}
          setRiskReasonKeywordInput={setRiskReasonKeywordInput}
          setRiskReasonKeyword={setRiskReasonKeyword}
          workflowDefinitionOptions={workflowDefinitionOptions}
          executionStatusOptions={options.executionStatusOptions}
          triggerTypeOptions={options.triggerTypeOptions}
          failureCategoryOptions={options.failureCategoryOptions}
          riskLevelOptions={options.riskLevelOptions}
          degradeActionOptions={options.degradeActionOptions}
          riskGatePresenceOptions={options.riskGatePresenceOptions}
          riskSummaryPresenceOptions={options.riskSummaryPresenceOptions}
          onReset={actions.handleResetFilters}
          onPageReset={() => setPage(1)}
        />

        <Table
          rowKey="id"
          loading={isLoading}
          columns={executionColumns}
          dataSource={executionPage?.data || []}
          pagination={{
            current: executionPage?.page || page,
            pageSize: executionPage?.pageSize || pageSize,
            total: executionPage?.total || 0,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          scroll={{ x: 1000 }}
        />
      </Space>

      <ExecutionDetailDrawer viewModel={viewModel} />

      <Drawer
        title="执行回放与评估"
        width={1400}
        open={Boolean(selectedReplayExecutionId)}
        onClose={() => setSelectedReplayExecutionId(null)}
        destroyOnClose
      >
        {selectedReplayExecutionId && (
          <ExecutionReplayDrawerContent executionId={selectedReplayExecutionId} />
        )}
      </Drawer>
    </Card>
  );
};

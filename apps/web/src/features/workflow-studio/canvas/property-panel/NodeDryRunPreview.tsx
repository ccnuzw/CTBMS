import React from 'react';
import type {
  WorkflowDsl,
  WorkflowNodePreviewField,
  WorkflowValidationIssue,
} from '@packages/types';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Input,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { getErrorMessage } from '../../../../api/client';
import { usePreviewWorkflowNode } from '../../api';
import {
  WORKFLOW_STUDIO_TELEMETRY_EVENT,
  buildWorkflowPreviewTelemetryTotals,
  clearWorkflowPreviewTelemetrySnapshot,
  listWorkflowPreviewTelemetrySnapshots,
  readWorkflowPreviewTelemetrySnapshot,
  trackWorkflowStudioEvent,
  type WorkflowPreviewTelemetrySnapshot,
  type WorkflowPreviewTelemetrySnapshotRow,
  writeWorkflowPreviewTelemetrySnapshot,
} from '../telemetry';

const { Text } = Typography;

interface InputFieldSchema {
  name: string;
  type: string;
  required?: boolean;
}

type PreviewStatus = 'resolved' | 'default' | 'expression' | 'missing' | 'skipped' | 'empty';

interface NodeDryRunPreviewProps {
  nodeId: string;
  currentDsl: WorkflowDsl;
  inputsSchema: InputFieldSchema[];
  inputBindings: Record<string, string>;
  defaultValues: Record<string, unknown>;
  nullPolicies: Record<string, string>;
  onLocateField?: (fieldName: string) => void;
  onFocusNode?: (nodeId: string) => void;
}

const stringifyValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const STATUS_TAG_MAP: Record<PreviewStatus, { color: string; label: string }> = {
  resolved: { color: 'success', label: '已解析' },
  default: { color: 'blue', label: '默认值' },
  expression: { color: 'purple', label: '表达式' },
  missing: { color: 'error', label: '缺失' },
  skipped: { color: 'gold', label: '跳过' },
  empty: { color: 'default', label: '空值' },
};

const formatRate = (numerator: number, denominator: number): string => {
  if (!denominator) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
};

type RangeFilter = 'all' | '24h' | '7d' | '30d';

const inRange = (updatedAt: string, range: RangeFilter): boolean => {
  if (range === 'all') {
    return true;
  }
  if (!updatedAt) {
    return false;
  }
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) {
    return false;
  }
  const now = Date.now();
  const delta = now - updated;
  if (range === '24h') {
    return delta <= 24 * 60 * 60 * 1000;
  }
  if (range === '7d') {
    return delta <= 7 * 24 * 60 * 60 * 1000;
  }
  return delta <= 30 * 24 * 60 * 60 * 1000;
};

const formatDateTime = (value: string): string => {
  if (!value) {
    return '-';
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
  });
};

const buildFailureReasonBuckets = (rows: WorkflowPreviewTelemetrySnapshotRow[]) => {
  const buckets = new Map<string, number>();
  rows.forEach((row) => {
    const reason = row.snapshot.lastFailureReason?.trim() || 'none';
    if (reason === 'none' || row.snapshot.failed <= 0) {
      return;
    }
    buckets.set(reason, (buckets.get(reason) ?? 0) + row.snapshot.failed);
  });
  return [...buckets.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
};

export const NodeDryRunPreview: React.FC<NodeDryRunPreviewProps> = ({
  nodeId,
  currentDsl,
  inputsSchema,
  inputBindings,
  defaultValues,
  nullPolicies,
  onLocateField,
  onFocusNode,
}) => {
  const { message } = App.useApp();
  const previewMutation = usePreviewWorkflowNode();

  const [sampleInputText, setSampleInputText] = React.useState('{\n  "upstream": {}\n}');
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [previewRows, setPreviewRows] = React.useState<WorkflowNodePreviewField[]>([]);
  const [resolvedPayload, setResolvedPayload] = React.useState<Record<string, unknown>>({});
  const [nodeIssues, setNodeIssues] = React.useState<WorkflowValidationIssue[]>([]);
  const [globalIssues, setGlobalIssues] = React.useState<WorkflowValidationIssue[]>([]);
  const [autoRun, setAutoRun] = React.useState(true);
  const [lastPreviewAt, setLastPreviewAt] = React.useState<string | null>(null);
  const [telemetrySnapshot, setTelemetrySnapshot] =
    React.useState<WorkflowPreviewTelemetrySnapshot>(() =>
      readWorkflowPreviewTelemetrySnapshot(nodeId),
    );
  const [summaryDrawerOpen, setSummaryDrawerOpen] = React.useState(false);
  const [summaryRows, setSummaryRows] = React.useState<WorkflowPreviewTelemetrySnapshotRow[]>([]);
  const [summaryRangeFilter, setSummaryRangeFilter] = React.useState<RangeFilter>('7d');
  const [summaryKeyword, setSummaryKeyword] = React.useState('');
  const [summaryFailureReasonFilter, setSummaryFailureReasonFilter] = React.useState<string>('all');
  const [summaryCurrentNodeOnly, setSummaryCurrentNodeOnly] = React.useState(false);
  const latestRunRef = React.useRef(0);

  React.useEffect(() => {
    setTelemetrySnapshot(readWorkflowPreviewTelemetrySnapshot(nodeId));
  }, [nodeId]);

  const updateTelemetrySnapshot = React.useCallback(
    (updater: (current: WorkflowPreviewTelemetrySnapshot) => WorkflowPreviewTelemetrySnapshot) => {
      setTelemetrySnapshot((current) => {
        const next = updater(current);
        writeWorkflowPreviewTelemetrySnapshot(nodeId, next);
        return next;
      });
    },
    [nodeId],
  );

  const runPreview = React.useCallback(
    async (options?: { silent?: boolean; trigger?: 'manual' | 'auto' | 'auto-toggle' }) => {
      if (previewMutation.isPending) {
        return;
      }
      const trigger = options?.trigger ?? (options?.silent ? 'auto' : 'manual');
      const currentRunId = latestRunRef.current + 1;
      latestRunRef.current = currentRunId;
      trackWorkflowStudioEvent('node_preview_triggered', {
        nodeId,
        trigger,
        inputFieldCount: inputsSchema.length,
        bindingCount: Object.keys(inputBindings).length,
      });
      updateTelemetrySnapshot((current) => ({
        ...current,
        triggered: current.triggered + 1,
        updatedAt: new Date().toISOString(),
      }));

      let sampleInput: Record<string, unknown> = {};
      try {
        sampleInput = JSON.parse(sampleInputText) as Record<string, unknown>;
        setParseError(null);
      } catch {
        setParseError('样例输入 JSON 格式错误，请修正后再试跑。');
        trackWorkflowStudioEvent('node_preview_failed', {
          nodeId,
          trigger,
          reason: 'json_parse_error',
        });
        updateTelemetrySnapshot((current) => ({
          ...current,
          failed: current.failed + 1,
          jsonParseError: current.jsonParseError + 1,
          lastFailureReason: 'json_parse_error',
          updatedAt: new Date().toISOString(),
        }));
        if (!options?.silent) {
          message.error('样例输入 JSON 格式错误');
        }
        return;
      }

      try {
        const result = await previewMutation.mutateAsync({
          dslSnapshot: currentDsl,
          nodeId,
          sampleInput,
          inputBindings,
          defaultValues,
          nullPolicies,
          inputsSchema,
          stage: 'SAVE',
        });

        if (latestRunRef.current !== currentRunId) {
          return;
        }

        setPreviewRows(result.rows);
        setResolvedPayload(result.resolvedPayload);
        setNodeIssues(result.nodeIssues);
        setGlobalIssues(result.validation.issues.filter((issue) => issue.nodeId !== nodeId));
        setLastPreviewAt(
          new Date().toLocaleTimeString('zh-CN', {
            hour12: false,
          }),
        );
        trackWorkflowStudioEvent('node_preview_completed', {
          nodeId,
          trigger,
          nodeIssueCount: result.nodeIssues.length,
          globalIssueCount: result.validation.issues.filter((issue) => issue.nodeId !== nodeId)
            .length,
          rowCount: result.rows.length,
          unresolvedRowCount: result.rows.filter((row) => row.status === 'missing').length,
        });
        updateTelemetrySnapshot((current) => ({
          ...current,
          completed: current.completed + 1,
          updatedAt: new Date().toISOString(),
        }));

        if (!options?.silent) {
          if (result.nodeIssues.length > 0) {
            message.warning(`后端校验发现 ${result.nodeIssues.length} 个节点级问题`);
          } else {
            message.success('后端校验通过，已生成节点试跑预览');
          }
        }
      } catch (error) {
        trackWorkflowStudioEvent('node_preview_failed', {
          nodeId,
          trigger,
          reason: 'request_error',
          message: getErrorMessage(error) || '节点试跑失败',
        });
        updateTelemetrySnapshot((current) => ({
          ...current,
          failed: current.failed + 1,
          requestError: current.requestError + 1,
          lastFailureReason: 'request_error',
          updatedAt: new Date().toISOString(),
        }));
        if (!options?.silent) {
          message.error(getErrorMessage(error) || '节点试跑失败');
        }
      }
    },
    [
      currentDsl,
      defaultValues,
      inputBindings,
      inputsSchema,
      message,
      nodeId,
      nullPolicies,
      previewMutation,
      sampleInputText,
      updateTelemetrySnapshot,
    ],
  );

  const runPreviewRef = React.useRef(runPreview);
  React.useEffect(() => {
    runPreviewRef.current = runPreview;
  }, [runPreview]);

  React.useEffect(() => {
    if (!autoRun) {
      return;
    }
    const timer = setTimeout(() => {
      void runPreviewRef.current({ silent: true, trigger: 'auto' });
    }, 700);
    return () => clearTimeout(timer);
  }, [
    autoRun,
    currentDsl,
    defaultValues,
    inputBindings,
    inputsSchema,
    nodeId,
    nullPolicies,
    sampleInputText,
  ]);

  const clearPreviewState = () => {
    latestRunRef.current += 1;
    setParseError(null);
    setPreviewRows([]);
    setResolvedPayload({});
    setNodeIssues([]);
    setGlobalIssues([]);
    setLastPreviewAt(null);
  };

  const hasAnyIssues = nodeIssues.length > 0 || globalIssues.length > 0;

  const refreshSummaryRows = React.useCallback(() => {
    setSummaryRows(listWorkflowPreviewTelemetrySnapshots());
  }, []);

  React.useEffect(() => {
    if (!summaryDrawerOpen || typeof window === 'undefined') {
      return;
    }
    const handleTelemetryChanged = () => {
      refreshSummaryRows();
    };
    window.addEventListener(WORKFLOW_STUDIO_TELEMETRY_EVENT, handleTelemetryChanged);
    return () => {
      window.removeEventListener(WORKFLOW_STUDIO_TELEMETRY_EVENT, handleTelemetryChanged);
    };
  }, [refreshSummaryRows, summaryDrawerOpen]);

  React.useEffect(() => {
    if (!summaryDrawerOpen) {
      return;
    }
    refreshSummaryRows();
  }, [refreshSummaryRows, summaryDrawerOpen]);

  const summaryKeywordRangeRows = React.useMemo(() => {
    const normalizedKeyword = summaryKeyword.trim().toLowerCase();
    return summaryRows.filter((row) => {
      if (!inRange(row.snapshot.updatedAt, summaryRangeFilter)) {
        return false;
      }
      if (summaryCurrentNodeOnly && row.nodeId !== nodeId) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      return row.nodeId.toLowerCase().includes(normalizedKeyword);
    });
  }, [nodeId, summaryCurrentNodeOnly, summaryKeyword, summaryRangeFilter, summaryRows]);

  const summaryFailureReasonBuckets = React.useMemo(
    () => buildFailureReasonBuckets(summaryKeywordRangeRows),
    [summaryKeywordRangeRows],
  );

  const summaryFilteredRows = React.useMemo(() => {
    if (summaryFailureReasonFilter === 'all') {
      return summaryKeywordRangeRows;
    }
    return summaryKeywordRangeRows.filter(
      (row) =>
        row.snapshot.failed > 0 && row.snapshot.lastFailureReason === summaryFailureReasonFilter,
    );
  }, [summaryFailureReasonFilter, summaryKeywordRangeRows]);

  const summaryTotals = React.useMemo(
    () => buildWorkflowPreviewTelemetryTotals(summaryFilteredRows),
    [summaryFilteredRows],
  );

  const hasSummaryActiveFilters =
    summaryRangeFilter !== '7d' ||
    summaryKeyword.trim().length > 0 ||
    summaryFailureReasonFilter !== 'all' ||
    summaryCurrentNodeOnly;

  const resetSummaryFilters = React.useCallback(() => {
    setSummaryRangeFilter('7d');
    setSummaryKeyword('');
    setSummaryFailureReasonFilter('all');
    setSummaryCurrentNodeOnly(false);
  }, []);

  const handleExportSummary = React.useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      currentNodeId: nodeId,
      filters: {
        rangeFilter: summaryRangeFilter,
        keyword: summaryKeyword.trim(),
        failureReasonFilter: summaryFailureReasonFilter,
        currentNodeOnly: summaryCurrentNodeOnly,
      },
      totals: summaryTotals,
      failureReasonBuckets: summaryFailureReasonBuckets,
      rows: summaryFilteredRows,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    if (typeof window === 'undefined') {
      return;
    }
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflow-preview-telemetry-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
    trackWorkflowStudioEvent('node_preview_summary_exported', {
      nodeId,
      rowCount: summaryFilteredRows.length,
      rangeFilter: summaryRangeFilter,
      failureReasonFilter: summaryFailureReasonFilter,
      currentNodeOnly: summaryCurrentNodeOnly,
    });
    message.success('统计汇总已导出为 JSON');
  }, [
    message,
    nodeId,
    summaryCurrentNodeOnly,
    summaryFailureReasonBuckets,
    summaryFailureReasonFilter,
    summaryFilteredRows,
    summaryKeyword,
    summaryRangeFilter,
    summaryTotals,
  ]);

  const handleFocusNode = React.useCallback(
    (targetNodeId: string, trigger: 'row' | 'button') => {
      if (!onFocusNode) {
        return;
      }
      trackWorkflowStudioEvent('node_preview_locate_clicked', {
        nodeId: targetNodeId,
        trigger,
        scope: 'node_preview_summary',
      });
      onFocusNode(targetNodeId);
    },
    [onFocusNode],
  );

  return (
    <Card size="small" title="样例输入试跑（后端校验）">
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          输入样例 JSON 后发起后端校验，返回字段解析、类型兼容结果和校验问题。
        </Text>

        <Input.TextArea
          value={sampleInputText}
          onChange={(event) => setSampleInputText(event.target.value)}
          autoSize={{ minRows: 6, maxRows: 10 }}
          style={{ fontFamily: 'monospace' }}
          placeholder='{"upstream":{"n1":{"price":123}}}'
        />

        <Space wrap>
          <Button type="primary" loading={previewMutation.isPending} onClick={() => runPreview()}>
            执行后端试跑
          </Button>
          <Button
            onClick={() => {
              setSampleInputText('{\n  "upstream": {}\n}');
              clearPreviewState();
            }}
          >
            重置
          </Button>
          <Space size={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              自动试跑
            </Text>
            <Switch
              size="small"
              checked={autoRun}
              onChange={(checked) => {
                setAutoRun(checked);
                trackWorkflowStudioEvent('node_preview_auto_toggle', {
                  nodeId,
                  enabled: checked,
                });
                updateTelemetrySnapshot((current) => ({
                  ...current,
                  autoToggle: current.autoToggle + 1,
                  updatedAt: new Date().toISOString(),
                }));
                if (checked) {
                  void runPreview({ silent: true, trigger: 'auto-toggle' });
                }
              }}
            />
          </Space>
          <Button
            size="small"
            onClick={() => {
              clearWorkflowPreviewTelemetrySnapshot(nodeId);
              setTelemetrySnapshot(readWorkflowPreviewTelemetrySnapshot(nodeId));
              refreshSummaryRows();
            }}
          >
            清空统计
          </Button>
          <Button
            size="small"
            onClick={() => {
              refreshSummaryRows();
              setSummaryDrawerOpen(true);
            }}
          >
            统计汇总
          </Button>
          {lastPreviewAt ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              最近试跑: {lastPreviewAt}
            </Text>
          ) : null}
        </Space>

        <Alert
          type="info"
          showIcon
          message="试跑埋点统计（当前浏览器）"
          description={[
            `触发 ${telemetrySnapshot.triggered}`,
            `成功 ${telemetrySnapshot.completed}`,
            `失败 ${telemetrySnapshot.failed}`,
            `成功率 ${formatRate(telemetrySnapshot.completed, telemetrySnapshot.triggered)}`,
            `定位点击 ${telemetrySnapshot.locateClicked}`,
            `自动开关 ${telemetrySnapshot.autoToggle}`,
            `JSON 错误 ${telemetrySnapshot.jsonParseError}`,
            `请求错误 ${telemetrySnapshot.requestError}`,
            `最近失败 ${telemetrySnapshot.lastFailureReason || '-'}`,
          ].join(' | ')}
        />

        {parseError ? <Alert type="error" showIcon message={parseError} /> : null}

        {hasAnyIssues ? (
          <Alert
            type="warning"
            showIcon
            message={`节点问题 ${nodeIssues.length} 项，全局问题 ${globalIssues.length} 项`}
          />
        ) : (
          <Alert type="success" showIcon message="后端校验无问题" />
        )}

        {nodeIssues.length > 0
          ? nodeIssues.map((issue, index) => (
              <Alert
                key={`${issue.code}-${index}`}
                type={issue.severity === 'WARN' ? 'warning' : 'error'}
                showIcon
                message={`节点问题 ${issue.code}: ${issue.message}`}
              />
            ))
          : null}

        {globalIssues.length > 0
          ? globalIssues.map((issue, index) => (
              <Alert
                key={`global-${issue.code}-${index}`}
                type={issue.severity === 'WARN' ? 'warning' : 'error'}
                showIcon
                message={`全局问题 ${issue.code}: ${issue.message}`}
              />
            ))
          : null}

        {previewRows.length > 0 ? (
          <>
            <Table<WorkflowNodePreviewField>
              size="small"
              pagination={false}
              rowKey="field"
              dataSource={previewRows}
              columns={[
                {
                  title: '字段',
                  dataIndex: 'field',
                  width: 140,
                  render: (value, record) => (
                    <Space size={6}>
                      <span>{value}</span>
                      <Tag>{record.expectedType}</Tag>
                    </Space>
                  ),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 92,
                  render: (value: PreviewStatus) => (
                    <Tag color={STATUS_TAG_MAP[value].color}>{STATUS_TAG_MAP[value].label}</Tag>
                  ),
                },
                {
                  title: '类型检查',
                  width: 120,
                  render: (_, record) => {
                    if (!record.actualType) {
                      return <Text type="secondary">-</Text>;
                    }
                    return record.typeCompatible === false ? (
                      <Tag color="error">{record.actualType}</Tag>
                    ) : (
                      <Tag color="success">{record.actualType}</Tag>
                    );
                  },
                },
                {
                  title: '来源',
                  dataIndex: 'source',
                  width: 180,
                  ellipsis: true,
                },
                {
                  title: '值',
                  dataIndex: 'value',
                  render: (value: unknown, record) => (
                    <Space direction="vertical" size={2}>
                      <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {stringifyValue(value)}
                      </Text>
                      {record.note ? (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {record.note}
                        </Text>
                      ) : null}
                    </Space>
                  ),
                },
                {
                  title: '操作',
                  width: 72,
                  render: (_, record) =>
                    onLocateField ? (
                      <Button
                        size="small"
                        type="link"
                        onClick={() => {
                          trackWorkflowStudioEvent('node_preview_locate_clicked', {
                            nodeId,
                            field: record.field,
                            status: record.status,
                          });
                          updateTelemetrySnapshot((current) => ({
                            ...current,
                            locateClicked: current.locateClicked + 1,
                            updatedAt: new Date().toISOString(),
                          }));
                          onLocateField(record.field);
                        }}
                        style={{ paddingInline: 0 }}
                      >
                        定位
                      </Button>
                    ) : null,
                },
              ]}
            />

            <Input.TextArea
              readOnly
              value={JSON.stringify(resolvedPayload, null, 2)}
              autoSize={{ minRows: 4, maxRows: 10 }}
              style={{ fontFamily: 'monospace' }}
            />
          </>
        ) : null}

        <Drawer
          title="试跑埋点汇总（当前浏览器）"
          placement="right"
          width={680}
          open={summaryDrawerOpen}
          onClose={() => setSummaryDrawerOpen(false)}
          extra={
            <Space>
              <Button size="small" onClick={refreshSummaryRows}>
                刷新
              </Button>
              <Button size="small" type="primary" onClick={handleExportSummary}>
                导出 JSON
              </Button>
            </Space>
          }
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Segmented
                size="small"
                value={summaryRangeFilter}
                onChange={(value) => setSummaryRangeFilter(value as RangeFilter)}
                options={[
                  { label: '24 小时', value: '24h' },
                  { label: '7 天', value: '7d' },
                  { label: '30 天', value: '30d' },
                  { label: '全部', value: 'all' },
                ]}
              />
              <Input
                allowClear
                size="small"
                style={{ width: 220 }}
                placeholder="按节点 ID 搜索"
                value={summaryKeyword}
                onChange={(event) => setSummaryKeyword(event.target.value)}
              />
              <Tag.CheckableTag
                checked={summaryCurrentNodeOnly}
                onChange={(checked) => setSummaryCurrentNodeOnly(checked)}
              >
                仅当前节点
              </Tag.CheckableTag>
              <Button
                size="small"
                onClick={resetSummaryFilters}
                disabled={!hasSummaryActiveFilters}
              >
                重置筛选
              </Button>
            </Space>

            {hasSummaryActiveFilters ? (
              <Space wrap>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当前筛选:
                </Text>
                {summaryRangeFilter !== '7d' ? (
                  <Tag closable onClose={() => setSummaryRangeFilter('7d')}>
                    时间={summaryRangeFilter}
                  </Tag>
                ) : null}
                {summaryKeyword.trim() ? (
                  <Tag closable onClose={() => setSummaryKeyword('')}>
                    节点~{summaryKeyword.trim()}
                  </Tag>
                ) : null}
                {summaryCurrentNodeOnly ? (
                  <Tag closable onClose={() => setSummaryCurrentNodeOnly(false)}>
                    仅当前节点
                  </Tag>
                ) : null}
                {summaryFailureReasonFilter !== 'all' ? (
                  <Tag closable onClose={() => setSummaryFailureReasonFilter('all')}>
                    原因={summaryFailureReasonFilter}
                  </Tag>
                ) : null}
              </Space>
            ) : null}

            {summaryFailureReasonBuckets.length > 0 ? (
              <Space wrap>
                <Tag.CheckableTag
                  checked={summaryFailureReasonFilter === 'all'}
                  onChange={(checked) => {
                    if (checked) {
                      setSummaryFailureReasonFilter('all');
                    }
                  }}
                >
                  全部原因
                </Tag.CheckableTag>
                {summaryFailureReasonBuckets.map((bucket) => (
                  <Tag.CheckableTag
                    key={`summary-failure-bucket-${bucket.reason}`}
                    checked={summaryFailureReasonFilter === bucket.reason}
                    onChange={(checked) => {
                      if (checked) {
                        setSummaryFailureReasonFilter(bucket.reason);
                      } else {
                        setSummaryFailureReasonFilter('all');
                      }
                    }}
                  >
                    {bucket.reason}: {bucket.count}
                  </Tag.CheckableTag>
                ))}
              </Space>
            ) : null}

            <Alert
              type="info"
              showIcon
              message="汇总统计"
              description={[
                `节点数 ${summaryFilteredRows.length}`,
                `触发 ${summaryTotals.triggered}`,
                `成功 ${summaryTotals.completed}`,
                `失败 ${summaryTotals.failed}`,
                `成功率 ${formatRate(summaryTotals.completed, summaryTotals.triggered)}`,
                `定位点击 ${summaryTotals.locateClicked}`,
              ].join(' | ')}
            />

            <Table<WorkflowPreviewTelemetrySnapshotRow>
              size="small"
              rowKey={(row) => row.nodeId}
              pagination={{
                pageSize: 8,
                showSizeChanger: true,
                pageSizeOptions: ['8', '16', '32'],
                showTotal: (total) => `共 ${total} 条`,
              }}
              dataSource={summaryFilteredRows}
              onRow={(row) => ({
                onClick: () => handleFocusNode(row.nodeId, 'row'),
                style: onFocusNode ? { cursor: 'pointer' } : undefined,
              })}
              columns={[
                {
                  title: '节点',
                  width: 152,
                  render: (_, row) =>
                    row.nodeId === nodeId ? (
                      <Space size={6}>
                        <span>{row.nodeId}</span>
                        <Tag color="blue">当前</Tag>
                      </Space>
                    ) : (
                      row.nodeId
                    ),
                  sorter: (a, b) => a.nodeId.localeCompare(b.nodeId),
                },
                {
                  title: '触发',
                  render: (_, row) => row.snapshot.triggered,
                  width: 72,
                  sorter: (a, b) => a.snapshot.triggered - b.snapshot.triggered,
                },
                {
                  title: '成功',
                  render: (_, row) => row.snapshot.completed,
                  width: 72,
                  sorter: (a, b) => a.snapshot.completed - b.snapshot.completed,
                },
                {
                  title: '失败',
                  render: (_, row) => row.snapshot.failed,
                  width: 72,
                  sorter: (a, b) => a.snapshot.failed - b.snapshot.failed,
                },
                {
                  title: '成功率',
                  render: (_, row) => formatRate(row.snapshot.completed, row.snapshot.triggered),
                  width: 84,
                  sorter: (a, b) => {
                    const aRate = a.snapshot.triggered
                      ? a.snapshot.completed / a.snapshot.triggered
                      : 0;
                    const bRate = b.snapshot.triggered
                      ? b.snapshot.completed / b.snapshot.triggered
                      : 0;
                    return aRate - bRate;
                  },
                },
                {
                  title: '失败原因',
                  render: (_, row) => row.snapshot.lastFailureReason || '-',
                  width: 110,
                },
                {
                  title: '更新时间',
                  render: (_, row) => formatDateTime(row.snapshot.updatedAt),
                  ellipsis: true,
                  sorter: (a, b) => {
                    const aTime = a.snapshot.updatedAt
                      ? new Date(a.snapshot.updatedAt).getTime()
                      : 0;
                    const bTime = b.snapshot.updatedAt
                      ? new Date(b.snapshot.updatedAt).getTime()
                      : 0;
                    return aTime - bTime;
                  },
                  defaultSortOrder: 'descend',
                },
                {
                  title: '操作',
                  width: 68,
                  render: (_, row) =>
                    onFocusNode ? (
                      <Button
                        size="small"
                        type="link"
                        style={{ paddingInline: 0 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleFocusNode(row.nodeId, 'button');
                        }}
                      >
                        定位
                      </Button>
                    ) : null,
                },
              ]}
            />
          </Space>
        </Drawer>
      </Space>
    </Card>
  );
};

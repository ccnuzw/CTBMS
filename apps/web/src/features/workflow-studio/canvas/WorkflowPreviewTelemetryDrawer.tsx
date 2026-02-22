import React from 'react';
import { Line } from '@ant-design/plots';
import {
  Alert,
  Button,
  Drawer,
  Input,
  Progress,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  WORKFLOW_STUDIO_TELEMETRY_EVENT,
  buildWorkflowPreviewTelemetryTotals,
  clearAllWorkflowPreviewTelemetrySnapshots,
  listWorkflowPreviewTelemetrySnapshots,
  trackWorkflowStudioEvent,
  type WorkflowPreviewTelemetrySnapshotRow,
} from './telemetry';

const { Text } = Typography;

type RangeFilter = 'all' | '24h' | '7d' | '30d';

interface FailureTrendPoint {
  date: string;
  reason: string;
  failed: number;
}

const formatRate = (numerator: number, denominator: number): string => {
  if (!denominator) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
};

const formatDateKey = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
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

const buildFailureTrendData = (
  rows: WorkflowPreviewTelemetrySnapshotRow[],
): FailureTrendPoint[] => {
  const reasonTotals = new Map<string, number>();
  const dailyRaw = new Map<string, number>();

  rows.forEach((row) => {
    if (row.snapshot.failed <= 0) {
      return;
    }
    const dateKey = formatDateKey(row.snapshot.updatedAt);
    if (!dateKey) {
      return;
    }
    const reason = row.snapshot.lastFailureReason?.trim() || 'unknown';
    reasonTotals.set(reason, (reasonTotals.get(reason) ?? 0) + row.snapshot.failed);
    dailyRaw.set(
      `${dateKey}|||${reason}`,
      (dailyRaw.get(`${dateKey}|||${reason}`) ?? 0) + row.snapshot.failed,
    );
  });

  if (dailyRaw.size === 0) {
    return [];
  }

  const topReasons = [...reasonTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason]) => reason);

  const normalized = new Map<string, number>();
  dailyRaw.forEach((failed, key) => {
    const [date, reason] = key.split('|||');
    const normalizedReason = topReasons.includes(reason) ? reason : '其他';
    const normalizedKey = `${date}|||${normalizedReason}`;
    normalized.set(normalizedKey, (normalized.get(normalizedKey) ?? 0) + failed);
  });

  return [...normalized.entries()]
    .map(([key, failed]) => {
      const [date, reason] = key.split('|||');
      return {
        date,
        reason,
        failed,
      };
    })
    .sort((a, b) => {
      if (a.date === b.date) {
        return a.reason.localeCompare(b.reason);
      }
      return a.date.localeCompare(b.date);
    });
};

interface WorkflowPreviewTelemetryDrawerProps {
  open: boolean;
  onClose: () => void;
  onFocusNode?: (nodeId: string) => void;
}

export const WorkflowPreviewTelemetryDrawer: React.FC<WorkflowPreviewTelemetryDrawerProps> = ({
  open,
  onClose,
  onFocusNode,
}) => {
  const [rangeFilter, setRangeFilter] = React.useState<RangeFilter>('7d');
  const [keyword, setKeyword] = React.useState('');
  const [failureReasonFilter, setFailureReasonFilter] = React.useState<string>('all');
  const [rows, setRows] = React.useState<WorkflowPreviewTelemetrySnapshotRow[]>([]);

  const refreshRows = React.useCallback(() => {
    setRows(listWorkflowPreviewTelemetrySnapshots());
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    refreshRows();
  }, [open, refreshRows]);

  React.useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }
    const handleTelemetryChanged = () => {
      refreshRows();
    };
    window.addEventListener(WORKFLOW_STUDIO_TELEMETRY_EVENT, handleTelemetryChanged);
    return () => {
      window.removeEventListener(WORKFLOW_STUDIO_TELEMETRY_EVENT, handleTelemetryChanged);
    };
  }, [open, refreshRows]);

  const keywordRangeRows = React.useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (!inRange(row.snapshot.updatedAt, rangeFilter)) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      return row.nodeId.toLowerCase().includes(normalizedKeyword);
    });
  }, [keyword, rangeFilter, rows]);

  const filteredRows = React.useMemo(() => {
    if (failureReasonFilter === 'all') {
      return keywordRangeRows;
    }
    return keywordRangeRows.filter((row) => {
      if (row.snapshot.failed <= 0) {
        return false;
      }
      return row.snapshot.lastFailureReason === failureReasonFilter;
    });
  }, [failureReasonFilter, keywordRangeRows]);

  const totals = React.useMemo(
    () => buildWorkflowPreviewTelemetryTotals(filteredRows),
    [filteredRows],
  );
  const failureReasonBuckets = React.useMemo(
    () => buildFailureReasonBuckets(keywordRangeRows),
    [keywordRangeRows],
  );
  const totalFailedForBuckets = React.useMemo(
    () => failureReasonBuckets.reduce((acc, bucket) => acc + bucket.count, 0),
    [failureReasonBuckets],
  );
  const failureTopRows = React.useMemo(() => {
    return [...filteredRows]
      .filter((row) => row.snapshot.triggered > 0)
      .map((row) => ({
        nodeId: row.nodeId,
        triggered: row.snapshot.triggered,
        failed: row.snapshot.failed,
        failureRate: row.snapshot.failed / row.snapshot.triggered,
      }))
      .sort((a, b) => b.failureRate - a.failureRate || b.failed - a.failed)
      .slice(0, 5);
  }, [filteredRows]);
  const failureTrendRows = React.useMemo(
    () => (failureReasonFilter === 'all' ? keywordRangeRows : filteredRows),
    [failureReasonFilter, filteredRows, keywordRangeRows],
  );
  const failureTrendData = React.useMemo(
    () => buildFailureTrendData(failureTrendRows),
    [failureTrendRows],
  );
  const hasActiveFilters =
    rangeFilter !== '7d' || keyword.trim().length > 0 || failureReasonFilter !== 'all';

  const handleResetFilters = React.useCallback(() => {
    setRangeFilter('7d');
    setKeyword('');
    setFailureReasonFilter('all');
  }, []);

  const handleFocusNode = React.useCallback(
    (nodeId: string, trigger: 'row' | 'button') => {
      if (!onFocusNode) {
        return;
      }
      trackWorkflowStudioEvent('node_preview_locate_clicked', {
        nodeId,
        trigger,
        scope: 'telemetry_summary',
      });
      onFocusNode(nodeId);
    },
    [onFocusNode],
  );

  const handleExportSummary = React.useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      filters: {
        rangeFilter,
        keyword: keyword.trim(),
        failureReasonFilter,
      },
      totals,
      failureReasonBuckets,
      rows: filteredRows,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflow-preview-telemetry-summary-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
    trackWorkflowStudioEvent('node_preview_summary_exported', {
      nodeId: 'all',
      rowCount: filteredRows.length,
      rangeFilter,
      failureReasonFilter,
    });
  }, [failureReasonBuckets, failureReasonFilter, filteredRows, keyword, rangeFilter, totals]);

  const handleClearAll = React.useCallback(() => {
    clearAllWorkflowPreviewTelemetrySnapshots();
    setRows([]);
    setFailureReasonFilter('all');
    trackWorkflowStudioEvent('node_preview_summary_cleared', {
      scope: 'all_nodes',
    });
  }, []);

  return (
    <Drawer
      title="工作流试跑埋点总览（当前浏览器）"
      placement="right"
      width={760}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button size="small" onClick={refreshRows}>
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
            value={rangeFilter}
            onChange={(value) => setRangeFilter(value as RangeFilter)}
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
            style={{ width: 240 }}
            placeholder="按节点 ID 搜索"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Button size="small" onClick={handleResetFilters} disabled={!hasActiveFilters}>
            重置筛选
          </Button>
          <Popconfirm
            title="确定清空所有埋点统计？"
            description="将删除当前浏览器中所有节点的试跑统计。"
            okText="清空"
            cancelText="取消"
            onConfirm={handleClearAll}
          >
            <Button size="small" danger>
              清空全部
            </Button>
          </Popconfirm>
        </Space>

        {hasActiveFilters ? (
          <Space wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前筛选:
            </Text>
            {rangeFilter !== '7d' ? (
              <Tag closable onClose={() => setRangeFilter('7d')}>
                时间={rangeFilter}
              </Tag>
            ) : null}
            {keyword.trim() ? (
              <Tag closable onClose={() => setKeyword('')}>
                节点~{keyword.trim()}
              </Tag>
            ) : null}
            {failureReasonFilter !== 'all' ? (
              <Tag closable onClose={() => setFailureReasonFilter('all')}>
                原因={failureReasonFilter}
              </Tag>
            ) : null}
          </Space>
        ) : null}

        <Alert
          type="info"
          showIcon
          message="筛选后汇总"
          description={[
            `节点数 ${filteredRows.length}`,
            `触发 ${totals.triggered}`,
            `成功 ${totals.completed}`,
            `失败 ${totals.failed}`,
            `成功率 ${formatRate(totals.completed, totals.triggered)}`,
            `定位点击 ${totals.locateClicked}`,
            `自动开关 ${totals.autoToggle}`,
          ].join(' | ')}
        />

        {failureReasonBuckets.length > 0 ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap>
              <Tag.CheckableTag
                checked={failureReasonFilter === 'all'}
                onChange={(checked) => {
                  if (checked) {
                    setFailureReasonFilter('all');
                  }
                }}
              >
                全部原因
              </Tag.CheckableTag>
              {failureReasonBuckets.map((bucket) => (
                <Tag.CheckableTag
                  key={bucket.reason}
                  checked={failureReasonFilter === bucket.reason}
                  onChange={(checked) => {
                    if (checked) {
                      setFailureReasonFilter(bucket.reason);
                    } else {
                      setFailureReasonFilter('all');
                    }
                  }}
                >
                  {bucket.reason}: {bucket.count}
                </Tag.CheckableTag>
              ))}
            </Space>

            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                失败原因占比（当前时间范围与关键词）
              </Text>
              {failureReasonBuckets.slice(0, 6).map((bucket) => {
                const percent = totalFailedForBuckets
                  ? Number(((bucket.count / totalFailedForBuckets) * 100).toFixed(1))
                  : 0;
                return (
                  <div key={`bucket-bar-${bucket.reason}`}>
                    <Space
                      style={{ width: '100%', justifyContent: 'space-between', marginBottom: 2 }}
                    >
                      <Text style={{ fontSize: 12 }}>{bucket.reason}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {bucket.count} ({percent}%)
                      </Text>
                    </Space>
                    <Progress percent={percent} size="small" showInfo={false} />
                  </div>
                );
              })}
            </Space>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前筛选范围内暂无失败原因分组数据。
          </Text>
        )}

        {failureTopRows.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="失败率 Top 5 节点"
            description={failureTopRows
              .map(
                (row, index) =>
                  `${index + 1}. ${row.nodeId}（失败率 ${formatRate(row.failed, row.triggered)}，失败 ${row.failed}/${row.triggered}）`,
              )
              .join(' | ')}
          />
        ) : null}

        {failureTrendData.length > 0 ? (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Text strong style={{ fontSize: 13 }}>
              失败趋势（按快照更新时间日聚合）
            </Text>
            <Line
              data={failureTrendData}
              xField="date"
              yField="failed"
              seriesField="reason"
              smooth
              height={180}
              point={{ size: 3 }}
              yAxis={{
                min: 0,
                title: {
                  text: '失败量',
                },
              }}
              xAxis={{
                title: {
                  text: '日期',
                },
              }}
              legend={{
                position: 'top',
              }}
              tooltip={{
                formatter: (datum: Record<string, unknown>) => ({
                  name: String(datum.reason ?? '-'),
                  value: `${datum.failed ?? 0}`,
                }),
              }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              注：趋势基于当前浏览器中的节点快照统计，不代表后端完整历史事件流。
            </Text>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前筛选范围内暂无可展示的失败趋势数据。
          </Text>
        )}

        <Table<WorkflowPreviewTelemetrySnapshotRow>
          size="small"
          rowKey={(row) => row.nodeId}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条`,
          }}
          dataSource={filteredRows}
          onRow={(row) => ({
            onClick: () => handleFocusNode(row.nodeId, 'row'),
            style: onFocusNode ? { cursor: 'pointer' } : undefined,
          })}
          columns={[
            {
              title: '节点',
              dataIndex: 'nodeId',
              width: 160,
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
              width: 96,
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
              width: 120,
            },
            {
              title: '更新时间',
              render: (_, row) => formatDateTime(row.snapshot.updatedAt),
              ellipsis: true,
              sorter: (a, b) => {
                const aTime = a.snapshot.updatedAt ? new Date(a.snapshot.updatedAt).getTime() : 0;
                const bTime = b.snapshot.updatedAt ? new Date(b.snapshot.updatedAt).getTime() : 0;
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
  );
};

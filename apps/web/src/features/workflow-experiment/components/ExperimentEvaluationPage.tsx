import React, { useMemo, useState } from 'react';
import { Line } from '@ant-design/plots';
import {
  App,
  Button,
  Card,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import type { ExperimentRunDto, WorkflowExperimentDto } from '@packages/types';
import {
  useAbortExperiment,
  useExperimentEvaluation,
  useExperimentRuns,
  useExperiments,
  usePauseExperiment,
  useStartExperiment,
} from '../api';

const { Title, Text } = Typography;

const statusConfig: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  RUNNING: { color: 'processing', label: '运行中' },
  PAUSED: { color: 'warning', label: '已暂停' },
  COMPLETED: { color: 'success', label: '已完成' },
  ABORTED: { color: 'error', label: '已中止' },
};

const variantColors = {
  A: '#1677ff',
  B: '#52c41a',
};

const prepareChartData = (runs: ExperimentRunDto[]) => {
  const sorted = [...runs].sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );

  return sorted.map((run) => ({
    time: new Date(run.createdAt ?? new Date()).toLocaleTimeString('zh-CN'),
    duration: run.durationMs,
    variant: `Variant ${run.variant}`,
  }));
};

export const ExperimentEvaluationPage: React.FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | undefined>();

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const status = searchParams.get('status') ?? undefined;
  const keyword = searchParams.get('keyword') ?? undefined;

  const { data, isLoading } = useExperiments({ page, pageSize, status, keyword });
  const { data: evaluation, isLoading: isEvaluationLoading } = useExperimentEvaluation(
    selectedExperimentId,
  );
  const { data: runsData, isLoading: isRunsLoading } = useExperimentRuns(selectedExperimentId, {
    page: 1,
    pageSize: 100,
  });

  const startMutation = useStartExperiment();
  const pauseMutation = usePauseExperiment();
  const abortMutation = useAbortExperiment();

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next);
  };

  const handleStart = async (id: string) => {
    try {
      await startMutation.mutateAsync(id);
      message.success('实验已启动');
    } catch {
      message.error('启动失败');
    }
  };

  const handlePause = async (id: string) => {
    try {
      await pauseMutation.mutateAsync(id);
      message.success('实验已暂停');
    } catch {
      message.error('暂停失败');
    }
  };

  const handleAbort = async (id: string) => {
    try {
      await abortMutation.mutateAsync(id);
      message.success('实验已中止');
    } catch {
      message.error('中止失败');
    }
  };

  const chartData = useMemo(() => {
    return runsData?.data ? prepareChartData(runsData.data) : [];
  }, [runsData]);

  const chartConfig = {
    data: chartData,
    xField: 'time',
    yField: 'duration',
    seriesField: 'variant',
    color: (datum: { variant: string }) =>
      datum.variant === 'Variant A' ? variantColors.A : variantColors.B,
    point: {
      shapeField: 'circle',
      sizeField: 3,
    },
    style: {
      lineWidth: 2,
    },
  };

  const columns: ColumnsType<WorkflowExperimentDto> = [
    {
      title: '实验',
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.experimentCode}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => {
        const cfg = statusConfig[value] ?? { color: 'default', label: value };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '流量 A/B',
      width: 120,
      render: (_, record) => `${record.trafficSplitPercent}% / ${100 - record.trafficSplitPercent}%`,
    },
    {
      title: '当前执行(A/B)',
      width: 140,
      render: (_, record) => `${record.currentExecutionsA} / ${record.currentExecutionsB}`,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value: string) => (value ? new Date(value).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 280,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button type="link" size="small" onClick={() => setSelectedExperimentId(record.id)}>
            评估
          </Button>
          {(record.status === 'DRAFT' || record.status === 'PAUSED') && (
            <Button
              type="link"
              size="small"
              onClick={() => handleStart(record.id)}
              loading={startMutation.isPending}
            >
              启动
            </Button>
          )}
          {record.status === 'RUNNING' && (
            <Button
              type="link"
              size="small"
              onClick={() => handlePause(record.id)}
              loading={pauseMutation.isPending}
            >
              暂停
            </Button>
          )}
          {record.status !== 'COMPLETED' && record.status !== 'ABORTED' && (
            <Popconfirm title="确认中止该实验？" onConfirm={() => handleAbort(record.id)}>
              <Button type="link" size="small" danger loading={abortMutation.isPending}>
                中止
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const runColumns: ColumnsType<ExperimentRunDto> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => (value ? new Date(value).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '变体',
      dataIndex: 'variant',
      width: 90,
      render: (value: 'A' | 'B') => <Tag color={value === 'A' ? 'blue' : 'green'}>{value}</Tag>,
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 90,
      render: (value: boolean) =>
        value ? <Tag color="success">SUCCESS</Tag> : <Tag color="error">FAIL</Tag>,
    },
    {
      title: '耗时(ms)',
      dataIndex: 'durationMs',
      width: 110,
    },
    {
      title: '失败分类',
      dataIndex: 'failureCategory',
      width: 120,
      render: (value: string | null) => value ?? '-',
    },
  ];

  const metrics = evaluation?.metrics;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Title level={4} style={{ margin: 0 }}>
            灰度实验评估
          </Title>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索实验编码/名称"
              defaultValue={keyword}
              style={{ width: 240 }}
              onSearch={(value) => updateParams({ keyword: value || undefined, page: '1' })}
            />
            <Select
              allowClear
              style={{ width: 160 }}
              placeholder="状态"
              value={status}
              onChange={(value) => updateParams({ status: value, page: '1' })}
              options={Object.entries(statusConfig).map(([value, cfg]) => ({
                value,
                label: cfg.label,
              }))}
            />
          </Space>
        </Space>
      </Card>

      <Card>
        <Table<WorkflowExperimentDto>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data?.data ?? []}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) =>
              updateParams({ page: String(nextPage), pageSize: String(nextPageSize) }),
          }}
        />
      </Card>

      <Drawer
        title="实验评估看板"
        open={Boolean(selectedExperimentId)}
        onClose={() => setSelectedExperimentId(undefined)}
        width={960}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Card loading={isEvaluationLoading}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Text type="secondary">实验概览</Text>
              <Space size={24} wrap>
                <Statistic
                  title="实验状态"
                  value={statusConfig[evaluation?.experiment.status ?? 'DRAFT']?.label ?? '-'}
                />
                <Statistic
                  title="当前执行 A/B"
                  value={`${evaluation?.experiment.currentExecutionsA ?? 0} / ${evaluation?.experiment.currentExecutionsB ?? 0}`}
                />
                <Statistic
                  title="推荐结论"
                  value={evaluation?.variantComparison?.recommendation ?? '-'}
                />
              </Space>
            </Space>
          </Card>

          {metrics && (
            <Card title="指标对比" size="small">
              <Space size={24} wrap>
                <Statistic
                  title="A 成功率"
                  value={(metrics.variantA.successRate * 100).toFixed(2)}
                  suffix="%"
                />
                <Statistic
                  title="B 成功率"
                  value={(metrics.variantB.successRate * 100).toFixed(2)}
                  suffix="%"
                />
                <Statistic title="A 平均耗时(ms)" value={metrics.variantA.avgDurationMs} />
                <Statistic title="B 平均耗时(ms)" value={metrics.variantB.avgDurationMs} />
              </Space>
            </Card>
          )}

          {chartData.length > 0 && (
            <Card title="耗时趋势分析" size="small">
              <div style={{ height: 300 }}>
                <Line {...chartConfig} />
              </div>
            </Card>
          )}

          <Card title="运行明细" size="small">
            <Table<ExperimentRunDto>
              rowKey="id"
              loading={isRunsLoading}
              dataSource={runsData?.data ?? []}
              columns={runColumns}
              size="small"
              pagination={false}
              scroll={{ x: 700 }}
            />
          </Card>
        </Space>
      </Drawer>
    </Space>
  );
};

import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Flex,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  ExperimentOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  TrophyOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import type { WorkflowExperimentDto, ExperimentRunDto } from '@packages/types';
import {
  useExperiments,
  useExperimentEvaluation,
  useExperimentRuns,
  useCreateExperiment,
  useDeleteExperiment,
  useStartExperiment,
  usePauseExperiment,
  useAbortExperiment,
  useConcludeExperiment,
} from '../api/experiments';

const { Text, Title, Paragraph } = Typography;

const statusConfig: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  RUNNING: { color: 'processing', label: '运行中' },
  PAUSED: { color: 'warning', label: '已暂停' },
  COMPLETED: { color: 'success', label: '已完成' },
  ABORTED: { color: 'error', label: '已中止' },
};

const variantColors = { A: '#1677ff', B: '#fa8c16' };

export const ExperimentEvaluationPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const statusFilter = searchParams.get('status') ?? undefined;
  const keyword = searchParams.get('keyword') ?? undefined;

  const [selectedExperimentId, setSelectedExperimentId] = useState<string | undefined>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [concludeModal, setConcludeModal] = useState<{ open: boolean; id: string; winner: 'A' | 'B'; summary: string }>({
    open: false, id: '', winner: 'A', summary: '',
  });
  const [runVariantFilter, setRunVariantFilter] = useState<string | undefined>();
  const [runPage, setRunPage] = useState(1);

  // 创建表单
  const [createForm, setCreateForm] = useState({
    experimentCode: '',
    name: '',
    description: '',
    workflowDefinitionId: '',
    variantAVersionId: '',
    variantBVersionId: '',
    trafficSplitPercent: 50,
    maxExecutions: '',
  });

  const { data: experimentsData, isLoading } = useExperiments({
    status: statusFilter,
    keyword,
    page,
    pageSize,
  });

  const { data: evaluation, isLoading: isEvalLoading } = useExperimentEvaluation(selectedExperimentId);
  const { data: runsData } = useExperimentRuns(selectedExperimentId, {
    variant: runVariantFilter,
    page: runPage,
    pageSize: 20,
  });

  const createMutation = useCreateExperiment();
  const deleteMutation = useDeleteExperiment();
  const startMutation = useStartExperiment();
  const pauseMutation = usePauseExperiment();
  const abortMutation = useAbortExperiment();
  const concludeMutation = useConcludeExperiment();

  const handleCreate = async () => {
    if (!createForm.experimentCode || !createForm.name || !createForm.workflowDefinitionId) {
      message.warning('请填写必要字段');
      return;
    }
    try {
      await createMutation.mutateAsync({
        experimentCode: createForm.experimentCode,
        name: createForm.name,
        description: createForm.description || undefined,
        workflowDefinitionId: createForm.workflowDefinitionId,
        variantAVersionId: createForm.variantAVersionId,
        variantBVersionId: createForm.variantBVersionId,
        trafficSplitPercent: createForm.trafficSplitPercent,
        maxExecutions: createForm.maxExecutions ? Number(createForm.maxExecutions) : undefined,
      });
      message.success('实验已创建');
      setIsCreateModalOpen(false);
    } catch {
      message.error('创建失败');
    }
  };

  const handleConclude = async () => {
    try {
      await concludeMutation.mutateAsync({
        id: concludeModal.id,
        dto: { winnerVariant: concludeModal.winner, conclusionSummary: concludeModal.summary || undefined },
      });
      message.success('实验已结论');
      setConcludeModal({ open: false, id: '', winner: 'A', summary: '' });
    } catch {
      message.error('操作失败');
    }
  };

  // ── 指标汇总 ──
  const metricsA = evaluation?.metrics?.variantA;
  const metricsB = evaluation?.metrics?.variantB;
  const comparison = evaluation?.variantComparison;

  const columns: ColumnsType<WorkflowExperimentDto> = [
    {
      title: '实验编号',
      dataIndex: 'experimentCode',
      width: 140,
      render: (code: string) => <Text strong>{code}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const cfg = statusConfig[status] ?? { color: 'default', label: status };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '流量分配',
      dataIndex: 'trafficSplitPercent',
      width: 140,
      render: (pct: number) => (
        <Space size={4}>
          <Tag color="blue">A: {pct}%</Tag>
          <Tag color="orange">B: {100 - pct}%</Tag>
        </Space>
      ),
    },
    {
      title: '执行次数 (A/B)',
      width: 140,
      render: (_, record) => (
        <Text>
          <span style={{ color: variantColors.A }}>{record.currentExecutionsA}</span>
          {' / '}
          <span style={{ color: variantColors.B }}>{record.currentExecutionsB}</span>
        </Text>
      ),
    },
    {
      title: '胜者',
      dataIndex: 'winnerVariant',
      width: 80,
      render: (winner: string | null) =>
        winner ? (
          <Tag color={winner === 'A' ? 'blue' : 'orange'} icon={<TrophyOutlined />}>
            {winner}
          </Tag>
        ) : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      width: 200,
      render: (_, record) => (
        <Space size={4} wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedExperimentId(record.id);
              setRunPage(1);
              setRunVariantFilter(undefined);
            }}
          >
            评估
          </Button>
          {(record.status === 'DRAFT' || record.status === 'PAUSED') && (
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={async () => {
                try { await startMutation.mutateAsync(record.id); message.success('已启动'); } catch { message.error('启动失败'); }
              }}
            >
              启动
            </Button>
          )}
          {record.status === 'RUNNING' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<PauseCircleOutlined />}
                onClick={async () => {
                  try { await pauseMutation.mutateAsync(record.id); message.success('已暂停'); } catch { message.error('暂停失败'); }
                }}
              >
                暂停
              </Button>
              <Button
                type="link"
                size="small"
                icon={<TrophyOutlined />}
                onClick={() => setConcludeModal({ open: true, id: record.id, winner: 'A', summary: '' })}
              >
                结论
              </Button>
            </>
          )}
          {record.status !== 'COMPLETED' && record.status !== 'ABORTED' && (
            <Popconfirm title="确认中止实验?" onConfirm={async () => {
              try { await abortMutation.mutateAsync(record.id); message.success('已中止'); } catch { message.error('中止失败'); }
            }}>
              <Button type="link" size="small" danger icon={<StopOutlined />}>中止</Button>
            </Popconfirm>
          )}
          {(record.status === 'DRAFT' || record.status === 'COMPLETED' || record.status === 'ABORTED') && (
            <Popconfirm title="确认删除?" onConfirm={async () => {
              try { await deleteMutation.mutateAsync(record.id); message.success('已删除'); } catch { message.error('删除失败'); }
            }}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const runColumns: ColumnsType<ExperimentRunDto> = [
    {
      title: '变体',
      dataIndex: 'variant',
      width: 70,
      render: (v: string) => <Tag color={v === 'A' ? 'blue' : 'orange'}>{v}</Tag>,
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 80,
      render: (success: boolean) =>
        success
          ? <Tag color="success" icon={<CheckCircleOutlined />}>成功</Tag>
          : <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>,
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 80,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      width: 100,
      render: (v: number | null) => v !== null && v !== undefined ? `${(v * 100).toFixed(1)}%` : '-',
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      width: 100,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '耗时',
      dataIndex: 'durationMs',
      width: 100,
      render: (ms: number) => `${ms}ms`,
    },
    {
      title: '失败类别',
      dataIndex: 'failureCategory',
      width: 120,
      render: (v: string | null) => v ? <Tag color="error">{v}</Tag> : '-',
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {/* ── Header ── */}
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <ExperimentOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <Title level={4} style={{ margin: 0 }}>灰度实验评估</Title>
          </Space>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索实验名称/编号"
              style={{ width: 200 }}
              defaultValue={keyword}
              onSearch={(v) => {
                const next = new URLSearchParams(searchParams);
                if (v) next.set('keyword', v); else next.delete('keyword');
                next.set('page', '1');
                setSearchParams(next);
              }}
            />
            <Select
              allowClear
              style={{ width: 130 }}
              placeholder="状态"
              value={statusFilter}
              onChange={(v) => {
                const next = new URLSearchParams(searchParams);
                if (v) next.set('status', v); else next.delete('status');
                next.set('page', '1');
                setSearchParams(next);
              }}
              options={[
                { label: '草稿', value: 'DRAFT' },
                { label: '运行中', value: 'RUNNING' },
                { label: '已暂停', value: 'PAUSED' },
                { label: '已完成', value: 'COMPLETED' },
                { label: '已中止', value: 'ABORTED' },
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
              新建实验
            </Button>
          </Space>
        </Flex>
      </Card>

      {/* ── Experiments Table ── */}
      <Card>
        <Table<WorkflowExperimentDto>
          rowKey="id"
          loading={isLoading}
          dataSource={experimentsData?.data ?? []}
          columns={columns}
          size="middle"
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total: experimentsData?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => {
              const next = new URLSearchParams(searchParams);
              next.set('page', String(p));
              next.set('pageSize', String(ps));
              setSearchParams(next);
            },
          }}
        />
      </Card>

      {/* ── Create Modal ── */}
      <Modal
        title="新建灰度实验"
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={560}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>实验编号 *</Text>
              <Input value={createForm.experimentCode} onChange={(e) => setCreateForm((p) => ({ ...p, experimentCode: e.target.value }))} style={{ marginTop: 4 }} />
            </Col>
            <Col span={12}>
              <Text strong>实验名称 *</Text>
              <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} style={{ marginTop: 4 }} />
            </Col>
          </Row>
          <div>
            <Text strong>工作流定义 ID *</Text>
            <Input value={createForm.workflowDefinitionId} onChange={(e) => setCreateForm((p) => ({ ...p, workflowDefinitionId: e.target.value }))} style={{ marginTop: 4 }} />
          </div>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>变体 A 版本 ID *</Text>
              <Input value={createForm.variantAVersionId} onChange={(e) => setCreateForm((p) => ({ ...p, variantAVersionId: e.target.value }))} style={{ marginTop: 4 }} />
            </Col>
            <Col span={12}>
              <Text strong>变体 B 版本 ID *</Text>
              <Input value={createForm.variantBVersionId} onChange={(e) => setCreateForm((p) => ({ ...p, variantBVersionId: e.target.value }))} style={{ marginTop: 4 }} />
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>A 流量占比 (%)</Text>
              <Input type="number" min={1} max={99} value={createForm.trafficSplitPercent} onChange={(e) => setCreateForm((p) => ({ ...p, trafficSplitPercent: Number(e.target.value) }))} style={{ marginTop: 4 }} />
            </Col>
            <Col span={12}>
              <Text strong>最大执行次数</Text>
              <Input type="number" min={1} placeholder="不限" value={createForm.maxExecutions} onChange={(e) => setCreateForm((p) => ({ ...p, maxExecutions: e.target.value }))} style={{ marginTop: 4 }} />
            </Col>
          </Row>
          <div>
            <Text strong>描述</Text>
            <Input.TextArea rows={2} value={createForm.description} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} style={{ marginTop: 4 }} />
          </div>
        </Space>
      </Modal>

      {/* ── Conclude Modal ── */}
      <Modal
        title="结论实验"
        open={concludeModal.open}
        onCancel={() => setConcludeModal((p) => ({ ...p, open: false }))}
        onOk={handleConclude}
        confirmLoading={concludeMutation.isPending}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text strong>胜出变体</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={concludeModal.winner}
              onChange={(v) => setConcludeModal((p) => ({ ...p, winner: v }))}
              options={[
                { label: '变体 A', value: 'A' },
                { label: '变体 B', value: 'B' },
              ]}
            />
          </div>
          <div>
            <Text strong>结论说明</Text>
            <Input.TextArea
              rows={3}
              value={concludeModal.summary}
              onChange={(e) => setConcludeModal((p) => ({ ...p, summary: e.target.value }))}
              style={{ marginTop: 4 }}
            />
          </div>
        </Space>
      </Modal>

      {/* ── Evaluation Drawer ── */}
      <Drawer
        title="实验评估看板"
        open={Boolean(selectedExperimentId)}
        onClose={() => setSelectedExperimentId(undefined)}
        width={960}
      >
        {evaluation && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {/* ── 实验基本信息 ── */}
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="实验编号">{evaluation.experiment.experimentCode}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusConfig[evaluation.experiment.status]?.color ?? 'default'}>
                  {statusConfig[evaluation.experiment.status]?.label ?? evaluation.experiment.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="名称">{evaluation.experiment.name}</Descriptions.Item>
              <Descriptions.Item label="流量分配">
                A: {evaluation.experiment.trafficSplitPercent}% / B: {100 - evaluation.experiment.trafficSplitPercent}%
              </Descriptions.Item>
              {evaluation.experiment.winnerVariant && (
                <Descriptions.Item label="胜出变体" span={2}>
                  <Tag color={evaluation.experiment.winnerVariant === 'A' ? 'blue' : 'orange'} icon={<TrophyOutlined />}>
                    变体 {evaluation.experiment.winnerVariant}
                  </Tag>
                </Descriptions.Item>
              )}
              {evaluation.experiment.conclusionSummary && (
                <Descriptions.Item label="结论" span={2}>
                  <Paragraph style={{ margin: 0, fontSize: 12 }} ellipsis={{ rows: 3, expandable: true }}>
                    {evaluation.experiment.conclusionSummary}
                  </Paragraph>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* ── 变体对比指标 ── */}
            {metricsA && metricsB && (
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                  <Card title={<Space><Tag color="blue">变体 A</Tag></Space>} size="small">
                    <Row gutter={[8, 8]}>
                      <Col span={8}>
                        <Statistic title="总执行" value={metricsA.totalExecutions} />
                      </Col>
                      <Col span={8}>
                        <Statistic title="成功率" value={`${(metricsA.successRate * 100).toFixed(1)}%`} valueStyle={{ color: metricsA.successRate >= 0.8 ? token.colorSuccess : token.colorWarning }} />
                      </Col>
                      <Col span={8}>
                        <Statistic title="badCase率" value={`${(metricsA.badCaseRate * 100).toFixed(1)}%`} valueStyle={{ color: metricsA.badCaseRate > 0.2 ? token.colorError : token.colorSuccess }} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="平均耗时" value={`${metricsA.avgDurationMs}ms`} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="P95 耗时" value={`${metricsA.p95DurationMs}ms`} />
                      </Col>
                    </Row>
                  </Card>
                </Col>
                <Col xs={24} sm={12}>
                  <Card title={<Space><Tag color="orange">变体 B</Tag></Space>} size="small">
                    <Row gutter={[8, 8]}>
                      <Col span={8}>
                        <Statistic title="总执行" value={metricsB.totalExecutions} />
                      </Col>
                      <Col span={8}>
                        <Statistic title="成功率" value={`${(metricsB.successRate * 100).toFixed(1)}%`} valueStyle={{ color: metricsB.successRate >= 0.8 ? token.colorSuccess : token.colorWarning }} />
                      </Col>
                      <Col span={8}>
                        <Statistic title="badCase率" value={`${(metricsB.badCaseRate * 100).toFixed(1)}%`} valueStyle={{ color: metricsB.badCaseRate > 0.2 ? token.colorError : token.colorSuccess }} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="平均耗时" value={`${metricsB.avgDurationMs}ms`} />
                      </Col>
                      <Col span={12}>
                        <Statistic title="P95 耗时" value={`${metricsB.p95DurationMs}ms`} />
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Row>
            )}

            {/* ── 对比结论 ── */}
            {comparison && (
              <Card title="对比分析" size="small" style={{ borderColor: token.colorPrimary }}>
                <Row gutter={[16, 16]}>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="成功率差异 (A-B)"
                      value={`${(comparison.successRateDelta * 100).toFixed(1)}%`}
                      prefix={comparison.successRateDelta > 0 ? <ArrowUpOutlined /> : comparison.successRateDelta < 0 ? <ArrowDownOutlined /> : null}
                      valueStyle={{ color: comparison.successRateDelta > 0 ? token.colorSuccess : comparison.successRateDelta < 0 ? token.colorError : undefined }}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="耗时差异 (A-B)"
                      value={`${comparison.avgDurationDelta}ms`}
                      prefix={comparison.avgDurationDelta < 0 ? <ArrowDownOutlined /> : comparison.avgDurationDelta > 0 ? <ArrowUpOutlined /> : null}
                      valueStyle={{ color: comparison.avgDurationDelta < 0 ? token.colorSuccess : comparison.avgDurationDelta > 0 ? token.colorError : undefined }}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="A 平均置信度" value={comparison.confidenceDeltaA !== null && comparison.confidenceDeltaA !== undefined ? `${(comparison.confidenceDeltaA * 100).toFixed(1)}%` : '-'} />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="B 平均置信度" value={comparison.confidenceDeltaB !== null && comparison.confidenceDeltaB !== undefined ? `${(comparison.confidenceDeltaB * 100).toFixed(1)}%` : '-'} />
                  </Col>
                </Row>
                <Card size="small" style={{ marginTop: 12, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                  <Text strong>建议：</Text>
                  <Text>{comparison.recommendation}</Text>
                </Card>
              </Card>
            )}

            {/* ── 运行明细 ── */}
            <Card
              title="运行明细"
              size="small"
              extra={
                <Select
                  allowClear
                  style={{ width: 120 }}
                  placeholder="变体筛选"
                  value={runVariantFilter}
                  onChange={(v) => { setRunVariantFilter(v); setRunPage(1); }}
                  options={[
                    { label: '变体 A', value: 'A' },
                    { label: '变体 B', value: 'B' },
                  ]}
                />
              }
            >
              <Table<ExperimentRunDto>
                rowKey="id"
                dataSource={runsData?.data ?? []}
                columns={runColumns}
                size="small"
                scroll={{ x: 900 }}
                pagination={{
                  current: runPage,
                  pageSize: 20,
                  total: runsData?.total ?? 0,
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: (p) => setRunPage(p),
                }}
              />
            </Card>
          </Space>
        )}
      </Drawer>
    </Space>
  );
};

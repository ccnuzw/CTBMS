import React, { useState } from 'react';
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
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Checkbox,
  theme,
} from 'antd';
import {
  DownloadOutlined,
  FileTextOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import type { ExportTaskDto, ExportReportSection } from '@packages/types';
import {
  useExportTasks,
  useExportTaskDetail,
  useCreateExportTask,
  useDeleteExportTask,
} from '../api/report-exports';

const { Text, Title, Paragraph } = Typography;

const formatStatusConfig: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'default', label: '等待中' },
  PROCESSING: { color: 'processing', label: '处理中' },
  COMPLETED: { color: 'success', label: '已完成' },
  FAILED: { color: 'error', label: '失败' },
};

const formatConfig: Record<string, { color: string; label: string }> = {
  PDF: { color: 'red', label: 'PDF' },
  WORD: { color: 'blue', label: 'Word' },
  JSON: { color: 'green', label: 'JSON' },
};

const sectionLabels: Record<string, string> = {
  CONCLUSION: '结论页',
  EVIDENCE: '证据页',
  DEBATE_PROCESS: '辩论过程页',
  RISK_ASSESSMENT: '风险评估页',
};

export const ReportExportPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const statusFilter = searchParams.get('status') ?? undefined;
  const formatFilter = searchParams.get('format') ?? undefined;

  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 创建表单状态
  const [createForm, setCreateForm] = useState({
    workflowExecutionId: '',
    format: 'PDF' as string,
    title: '',
    sections: ['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT'] as ExportReportSection[],
    includeRawData: false,
  });

  const { data: tasksData, isLoading } = useExportTasks({
    status: statusFilter,
    format: formatFilter,
    page,
    pageSize,
  });
  const { data: taskDetail } = useExportTaskDetail(selectedTaskId);
  const createMutation = useCreateExportTask();
  const deleteMutation = useDeleteExportTask();

  const handleCreate = async () => {
    if (!createForm.workflowExecutionId.trim()) {
      message.warning('请输入工作流执行实例 ID');
      return;
    }
    try {
      await createMutation.mutateAsync({
        workflowExecutionId: createForm.workflowExecutionId,
        format: createForm.format as 'PDF' | 'WORD' | 'JSON',
        sections: createForm.sections,
        title: createForm.title || undefined,
        includeRawData: createForm.includeRawData,
      });
      message.success('导出任务已创建');
      setIsCreateModalOpen(false);
      setCreateForm({
        workflowExecutionId: '',
        format: 'PDF',
        title: '',
        sections: ['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT'],
        includeRawData: false,
      });
    } catch {
      message.error('创建失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      message.success('已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const columns: ColumnsType<ExportTaskDto> = [
    {
      title: '格式',
      dataIndex: 'format',
      width: 80,
      render: (format: string) => {
        const cfg = formatConfig[format] ?? { color: 'default', label: format };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const cfg = formatStatusConfig[status] ?? { color: 'default', label: status };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '执行实例 ID',
      dataIndex: 'workflowExecutionId',
      width: 280,
      ellipsis: true,
      render: (id: string) => <Text copyable style={{ fontSize: 12 }}>{id}</Text>,
    },
    {
      title: '报告段落',
      dataIndex: 'sections',
      width: 260,
      render: (sections: string[]) => (
        <Space size={4} wrap>
          {(sections ?? []).map((s: string) => (
            <Tag key={s} style={{ fontSize: 11 }}>{sectionLabels[s] ?? s}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      width: 170,
      render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setSelectedTaskId(record.id)}
          >
            查看
          </Button>
          {record.status === 'COMPLETED' && record.downloadUrl && (
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              href={record.downloadUrl}
              target="_blank"
            >
              下载
            </Button>
          )}
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <FileTextOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <Title level={4} style={{ margin: 0 }}>
              报告导出中心
            </Title>
          </Space>
          <Space wrap>
            <Select
              allowClear
              style={{ width: 130 }}
              placeholder="格式"
              value={formatFilter}
              onChange={(v) => {
                const next = new URLSearchParams(searchParams);
                if (v) next.set('format', v); else next.delete('format');
                next.set('page', '1');
                setSearchParams(next);
              }}
              options={[
                { label: 'PDF', value: 'PDF' },
                { label: 'Word', value: 'WORD' },
                { label: 'JSON', value: 'JSON' },
              ]}
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
                { label: '等待中', value: 'PENDING' },
                { label: '处理中', value: 'PROCESSING' },
                { label: '已完成', value: 'COMPLETED' },
                { label: '失败', value: 'FAILED' },
              ]}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalOpen(true)}
            >
              新建导出
            </Button>
          </Space>
        </Flex>
      </Card>

      <Card>
        <Table<ExportTaskDto>
          rowKey="id"
          loading={isLoading}
          dataSource={tasksData?.data ?? []}
          columns={columns}
          size="middle"
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total: tasksData?.total ?? 0,
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

      {/* ── 创建导出 Modal ── */}
      <Modal
        title="新建报告导出"
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text strong>工作流执行实例 ID *</Text>
            <Input
              placeholder="输入 UUID"
              value={createForm.workflowExecutionId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, workflowExecutionId: e.target.value }))}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>导出格式</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={createForm.format}
              onChange={(v) => setCreateForm((prev) => ({ ...prev, format: v }))}
              options={[
                { label: 'PDF', value: 'PDF' },
                { label: 'Word', value: 'WORD' },
                { label: 'JSON', value: 'JSON' },
              ]}
            />
          </div>
          <div>
            <Text strong>报告标题（可选）</Text>
            <Input
              placeholder="留空使用默认标题"
              value={createForm.title}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Text strong>包含段落</Text>
            <Checkbox.Group
              style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}
              value={createForm.sections}
              onChange={(v) => setCreateForm((prev) => ({ ...prev, sections: v as ExportReportSection[] }))}
              options={[
                { label: '结论页', value: 'CONCLUSION' },
                { label: '证据页', value: 'EVIDENCE' },
                { label: '辩论过程页', value: 'DEBATE_PROCESS' },
                { label: '风险评估页', value: 'RISK_ASSESSMENT' },
              ]}
            />
          </div>
          <Checkbox
            checked={createForm.includeRawData}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, includeRawData: e.target.checked }))}
          >
            包含原始参数快照
          </Checkbox>
        </Space>
      </Modal>

      {/* ── 任务详情 Drawer ── */}
      <Drawer
        title="导出任务详情"
        open={Boolean(selectedTaskId)}
        onClose={() => setSelectedTaskId(undefined)}
        width={720}
      >
        {taskDetail && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="任务 ID">
                <Text copyable style={{ fontSize: 12 }}>{taskDetail.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={formatStatusConfig[taskDetail.status]?.color ?? 'default'}>
                  {formatStatusConfig[taskDetail.status]?.label ?? taskDetail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="格式">
                <Tag color={formatConfig[taskDetail.format]?.color ?? 'default'}>
                  {formatConfig[taskDetail.format]?.label ?? taskDetail.format}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="执行实例 ID">
                <Text copyable style={{ fontSize: 12 }}>{taskDetail.workflowExecutionId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {taskDetail.createdAt ? new Date(taskDetail.createdAt).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="完成时间">
                {taskDetail.completedAt ? new Date(taskDetail.completedAt).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="包含段落" span={2}>
                <Space size={4} wrap>
                  {(taskDetail.sections as string[]).map((s) => (
                    <Tag key={s}>{sectionLabels[s] ?? s}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
            </Descriptions>

            {taskDetail.errorMessage && (
              <Card title="错误信息" size="small" style={{ borderColor: token.colorError }}>
                <Text type="danger" style={{ fontSize: 12 }}>{taskDetail.errorMessage}</Text>
              </Card>
            )}

            {taskDetail.reportData && (
              <Card title="报告数据预览" size="small">
                <pre style={{ fontSize: 11, maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {JSON.stringify(taskDetail.reportData, null, 2)}
                </pre>
              </Card>
            )}

            {taskDetail.downloadUrl && (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                href={taskDetail.downloadUrl}
                target="_blank"
                block
              >
                下载报告
              </Button>
            )}
          </Space>
        )}
      </Drawer>
    </Space>
  );
};

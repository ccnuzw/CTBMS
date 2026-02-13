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
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  AppstoreOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  SendOutlined,
  StarOutlined,
  StopOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import type { TemplateCatalogDto } from '@packages/types';
import {
  useTemplateCatalog,
  useMyTemplates,
  useTemplateDetail,
  useCreateTemplate,
  usePublishTemplate,
  useArchiveTemplate,
  useDeleteTemplate,
  useCopyTemplate,
} from '../api/templates';

const { Title, Text, Paragraph } = Typography;

const categoryConfig: Record<string, { color: string; label: string }> = {
  TRADING: { color: 'blue', label: '交易' },
  RISK_MANAGEMENT: { color: 'red', label: '风险管理' },
  ANALYSIS: { color: 'purple', label: '分析' },
  MONITORING: { color: 'orange', label: '监控' },
  REPORTING: { color: 'green', label: '报告' },
  CUSTOM: { color: 'default', label: '自定义' },
};

const statusConfig: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: '草稿' },
  PUBLISHED: { color: 'success', label: '已发布' },
  ARCHIVED: { color: 'warning', label: '已归档' },
};

export const TemplateMarketPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') ?? 'market';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const categoryFilter = searchParams.get('category') ?? undefined;
  const keyword = searchParams.get('keyword') ?? undefined;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copyModal, setCopyModal] = useState<{ open: boolean; templateId: string; newName: string }>({
    open: false, templateId: '', newName: '',
  });

  const [createForm, setCreateForm] = useState({
    templateCode: '',
    name: '',
    description: '',
    category: 'CUSTOM' as string,
    sourceWorkflowDefinitionId: '',
    sourceVersionId: '',
  });

  const marketQuery = { category: categoryFilter, keyword, page, pageSize };
  const { data: marketData, isLoading: isMarketLoading } = useTemplateCatalog(
    activeTab === 'market' ? marketQuery : undefined,
  );
  const { data: myData, isLoading: isMyLoading } = useMyTemplates(
    activeTab === 'mine' ? marketQuery : undefined,
  );
  const { data: templateDetail } = useTemplateDetail(selectedTemplateId);

  const createMutation = useCreateTemplate();
  const publishMutation = usePublishTemplate();
  const archiveMutation = useArchiveTemplate();
  const deleteMutation = useDeleteTemplate();
  const copyMutation = useCopyTemplate();

  const currentData = activeTab === 'market' ? marketData : myData;
  const isLoading = activeTab === 'market' ? isMarketLoading : isMyLoading;

  const handleCreate = async () => {
    if (!createForm.templateCode || !createForm.name || !createForm.sourceWorkflowDefinitionId) {
      message.warning('请填写必要字段');
      return;
    }
    try {
      await createMutation.mutateAsync({
        templateCode: createForm.templateCode,
        name: createForm.name,
        description: createForm.description || undefined,
        category: createForm.category as 'TRADING' | 'RISK_MANAGEMENT' | 'ANALYSIS' | 'MONITORING' | 'REPORTING' | 'CUSTOM',
        sourceWorkflowDefinitionId: createForm.sourceWorkflowDefinitionId,
        sourceVersionId: createForm.sourceVersionId,
      });
      message.success('模板已创建');
      setIsCreateModalOpen(false);
      setCreateForm({ templateCode: '', name: '', description: '', category: 'CUSTOM', sourceWorkflowDefinitionId: '', sourceVersionId: '' });
    } catch {
      message.error('创建失败');
    }
  };

  const handleCopy = async () => {
    try {
      await copyMutation.mutateAsync({
        templateId: copyModal.templateId,
        newName: copyModal.newName || undefined,
      });
      message.success('模板已复制到工作流空间');
      setCopyModal({ open: false, templateId: '', newName: '' });
    } catch {
      message.error('复制失败');
    }
  };

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    setSearchParams(next);
  };

  const columns: ColumnsType<TemplateCatalogDto> = [
    {
      title: '模板',
      width: 240,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Space size={4}>
            <Text strong>{record.name}</Text>
            {record.isOfficial && (
              <Tag color="gold" icon={<SafetyCertificateOutlined />} style={{ fontSize: 10 }}>
                官方
              </Tag>
            )}
          </Space>
          <Text type="secondary" style={{ fontSize: 11 }}>{record.templateCode}</Text>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
      render: (cat: string) => {
        const cfg = categoryConfig[cat] ?? { color: 'default', label: cat };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: string) => {
        const cfg = statusConfig[status] ?? { color: 'default', label: status };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '节点/连线',
      width: 100,
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>{record.nodeCount} / {record.edgeCount}</Text>
      ),
    },
    {
      title: '使用次数',
      dataIndex: 'usageCount',
      width: 90,
      render: (v: number) => <Tag icon={<CopyOutlined />}>{v}</Tag>,
    },
    {
      title: '作者',
      dataIndex: 'authorName',
      width: 100,
      render: (name: string | null) => (
        <Space size={4}>
          <UserOutlined style={{ fontSize: 11 }} />
          <Text style={{ fontSize: 12 }}>{name ?? '-'}</Text>
        </Space>
      ),
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
            onClick={() => setSelectedTemplateId(record.id)}
          >
            查看
          </Button>
          {record.status === 'PUBLISHED' && (
            <Button
              type="link"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => setCopyModal({ open: true, templateId: record.id, newName: `${record.name} (副本)` })}
            >
              复制
            </Button>
          )}
          {activeTab === 'mine' && (
            <>
              {record.status === 'DRAFT' && (
                <Button
                  type="link"
                  size="small"
                  icon={<SendOutlined />}
                  onClick={async () => {
                    try { await publishMutation.mutateAsync(record.id); message.success('已发布'); } catch { message.error('发布失败'); }
                  }}
                >
                  发布
                </Button>
              )}
              {record.status === 'PUBLISHED' && (
                <Button
                  type="link"
                  size="small"
                  icon={<StopOutlined />}
                  onClick={async () => {
                    try { await archiveMutation.mutateAsync(record.id); message.success('已归档'); } catch { message.error('归档失败'); }
                  }}
                >
                  归档
                </Button>
              )}
              <Popconfirm title="确认删除?" onConfirm={async () => {
                try { await deleteMutation.mutateAsync(record.id); message.success('已删除'); } catch { message.error('删除失败'); }
              }}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <AppstoreOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <Title level={4} style={{ margin: 0 }}>模板市场</Title>
          </Space>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="搜索模板"
              style={{ width: 200 }}
              defaultValue={keyword}
              onSearch={(v) => updateParams({ keyword: v || undefined, page: '1' })}
            />
            <Select
              allowClear
              style={{ width: 120 }}
              placeholder="分类"
              value={categoryFilter}
              onChange={(v) => updateParams({ category: v, page: '1' })}
              options={Object.entries(categoryConfig).map(([value, cfg]) => ({ label: cfg.label, value }))}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
              发布模板
            </Button>
          </Space>
        </Flex>
      </Card>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => updateParams({ tab: key, page: '1' })}
          items={[
            { key: 'market', label: '公开模板' },
            { key: 'mine', label: '我的模板' },
          ]}
        />
        <Table<TemplateCatalogDto>
          rowKey="id"
          loading={isLoading}
          dataSource={currentData?.data ?? []}
          columns={columns}
          size="middle"
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize,
            total: currentData?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (p, ps) => updateParams({ page: String(p), pageSize: String(ps) }),
          }}
        />
      </Card>

      {/* ── Create Modal ── */}
      <Modal
        title="发布模板"
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>模板编号 *</Text>
              <Input value={createForm.templateCode} onChange={(e) => setCreateForm((p) => ({ ...p, templateCode: e.target.value }))} style={{ marginTop: 4 }} />
            </Col>
            <Col span={12}>
              <Text strong>模板名称 *</Text>
              <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} style={{ marginTop: 4 }} />
            </Col>
          </Row>
          <div>
            <Text strong>分类</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={createForm.category}
              onChange={(v) => setCreateForm((p) => ({ ...p, category: v }))}
              options={Object.entries(categoryConfig).map(([value, cfg]) => ({ label: cfg.label, value }))}
            />
          </div>
          <div>
            <Text strong>源工作流定义 ID *</Text>
            <Input value={createForm.sourceWorkflowDefinitionId} onChange={(e) => setCreateForm((p) => ({ ...p, sourceWorkflowDefinitionId: e.target.value }))} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong>源版本 ID *</Text>
            <Input value={createForm.sourceVersionId} onChange={(e) => setCreateForm((p) => ({ ...p, sourceVersionId: e.target.value }))} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong>描述</Text>
            <Input.TextArea rows={3} value={createForm.description} onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))} style={{ marginTop: 4 }} />
          </div>
        </Space>
      </Modal>

      {/* ── Copy Modal ── */}
      <Modal
        title="复制模板到工作流空间"
        open={copyModal.open}
        onCancel={() => setCopyModal((p) => ({ ...p, open: false }))}
        onOk={handleCopy}
        confirmLoading={copyMutation.isPending}
      >
        <div>
          <Text strong>新工作流名称</Text>
          <Input
            value={copyModal.newName}
            onChange={(e) => setCopyModal((p) => ({ ...p, newName: e.target.value }))}
            style={{ marginTop: 4 }}
          />
        </div>
      </Modal>

      {/* ── Detail Drawer ── */}
      <Drawer
        title="模板详情"
        open={Boolean(selectedTemplateId)}
        onClose={() => setSelectedTemplateId(undefined)}
        width={720}
      >
        {templateDetail && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="模板编号">{templateDetail.templateCode}</Descriptions.Item>
              <Descriptions.Item label="名称">{templateDetail.name}</Descriptions.Item>
              <Descriptions.Item label="分类">
                <Tag color={categoryConfig[templateDetail.category]?.color ?? 'default'}>
                  {categoryConfig[templateDetail.category]?.label ?? templateDetail.category}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusConfig[templateDetail.status]?.color ?? 'default'}>
                  {statusConfig[templateDetail.status]?.label ?? templateDetail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="节点数">{templateDetail.nodeCount}</Descriptions.Item>
              <Descriptions.Item label="连线数">{templateDetail.edgeCount}</Descriptions.Item>
              <Descriptions.Item label="使用次数">{templateDetail.usageCount}</Descriptions.Item>
              <Descriptions.Item label="作者">{templateDetail.authorName ?? '-'}</Descriptions.Item>
              {templateDetail.isOfficial && (
                <Descriptions.Item label="官方" span={2}>
                  <Tag color="gold" icon={<SafetyCertificateOutlined />}>官方认证</Tag>
                </Descriptions.Item>
              )}
              {templateDetail.description && (
                <Descriptions.Item label="描述" span={2}>
                  <Paragraph style={{ margin: 0, fontSize: 12 }} ellipsis={{ rows: 4, expandable: true }}>
                    {templateDetail.description}
                  </Paragraph>
                </Descriptions.Item>
              )}
              {templateDetail.tags && (templateDetail.tags as string[]).length > 0 && (
                <Descriptions.Item label="标签" span={2}>
                  <Space size={4} wrap>
                    {(templateDetail.tags as string[]).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card title="DSL 快照预览" size="small">
              <pre style={{ fontSize: 11, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
                {JSON.stringify(templateDetail.dslSnapshot, null, 2)}
              </pre>
            </Card>

            {templateDetail.status === 'PUBLISHED' && (
              <Button
                type="primary"
                icon={<CopyOutlined />}
                block
                onClick={() => {
                  setSelectedTemplateId(undefined);
                  setCopyModal({
                    open: true,
                    templateId: templateDetail.id,
                    newName: `${templateDetail.name} (副本)`,
                  });
                }}
              >
                复制到我的工作流空间
              </Button>
            )}
          </Space>
        )}
      </Drawer>
    </Space>
  );
};

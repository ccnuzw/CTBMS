import React, { useState } from 'react';
import {
  App,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import type { UserConfigBindingDto } from '@packages/types';
import {
  useUserConfigBindings,
  useCreateUserConfigBinding,
  useUpdateUserConfigBinding,
  useDeleteUserConfigBinding,
} from '../api';

const { Title, Text } = Typography;

const bindingTypeOptions = [
  { label: '参数包', value: 'PARAMETER_SET' },
  { label: '规则包', value: 'DECISION_RULE_PACK' },
  { label: 'Agent 模板', value: 'AGENT_PROFILE' },
  { label: '模板目录', value: 'TEMPLATE_CATALOG' },
  { label: '流程定义', value: 'WORKFLOW_DEFINITION' },
];

export const UserConfigBindingPage: React.FC = () => {
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const keyword = searchParams.get('keyword') ?? undefined;
  const bindingType = searchParams.get('bindingType') ?? undefined;
  const isActiveRaw = searchParams.get('isActive');
  const isActive = isActiveRaw === null ? undefined : isActiveRaw === 'true';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState<UserConfigBindingDto | null>(null);
  const [formState, setFormState] = useState({
    bindingType: 'PARAMETER_SET',
    targetId: '',
    targetCode: '',
    priority: 100,
    isActive: true,
  });

  const { data, isLoading } = useUserConfigBindings({
    bindingType,
    isActive,
    keyword,
    page,
    pageSize,
  });
  const createMutation = useCreateUserConfigBinding();
  const updateMutation = useUpdateUserConfigBinding();
  const deleteMutation = useDeleteUserConfigBinding();

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  };

  const resetForm = () => {
    setEditingBinding(null);
    setFormState({
      bindingType: 'PARAMETER_SET',
      targetId: '',
      targetCode: '',
      priority: 100,
      isActive: true,
    });
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (record: UserConfigBindingDto) => {
    setEditingBinding(record);
    setFormState({
      bindingType: record.bindingType,
      targetId: record.targetId,
      targetCode: record.targetCode ?? '',
      priority: record.priority,
      isActive: record.isActive,
    });
    setIsModalOpen(true);
  };

  const submitForm = async () => {
    if (!formState.targetId.trim()) {
      message.warning('请填写目标ID');
      return;
    }

    try {
      if (editingBinding) {
        await updateMutation.mutateAsync({
          id: editingBinding.id,
          dto: {
            targetCode: formState.targetCode || undefined,
            priority: formState.priority,
            isActive: formState.isActive,
          },
        });
        message.success('绑定已更新');
      } else {
        await createMutation.mutateAsync({
          bindingType: formState.bindingType as
            | 'PARAMETER_SET'
            | 'DECISION_RULE_PACK'
            | 'AGENT_PROFILE'
            | 'TEMPLATE_CATALOG'
            | 'WORKFLOW_DEFINITION',
          targetId: formState.targetId.trim(),
          targetCode: formState.targetCode || undefined,
          priority: formState.priority,
          isActive: formState.isActive,
        });
        message.success('绑定已创建');
      }

      setIsModalOpen(false);
      resetForm();
    } catch {
      message.error(editingBinding ? '更新失败' : '创建失败');
    }
  };

  const handleToggle = async (record: UserConfigBindingDto, nextActive: boolean) => {
    try {
      await updateMutation.mutateAsync({
        id: record.id,
        dto: { isActive: nextActive },
      });
      message.success(nextActive ? '绑定已启用' : '绑定已停用');
    } catch {
      message.error('状态更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      message.success('绑定已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const columns: ColumnsType<UserConfigBindingDto> = [
    {
      title: '绑定类型',
      dataIndex: 'bindingType',
      width: 180,
      render: (value: string) => (
        <Tag color="blue">{bindingTypeOptions.find((item) => item.value === value)?.label ?? value}</Tag>
      ),
    },
    {
      title: '目标ID',
      dataIndex: 'targetId',
      width: 220,
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: '目标编码',
      dataIndex: 'targetCode',
      width: 180,
      render: (value: string | null) => value || '-',
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      width: 90,
      render: (value: boolean) => (value ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value: string) => (value ? new Date(value).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Switch
            size="small"
            checked={record.isActive}
            onChange={(checked) => handleToggle(record, checked)}
          />
          <Popconfirm title="确认删除该绑定？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Title level={4} style={{ margin: 0 }}>
              用户配置绑定
            </Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新建绑定
            </Button>
          </Space>
          <Space wrap>
            <Input.Search
              allowClear
              style={{ width: 240 }}
              placeholder="搜索 targetId / targetCode"
              defaultValue={keyword}
              onSearch={(value) => updateParams({ keyword: value || undefined, page: '1' })}
            />
            <Select
              allowClear
              style={{ width: 200 }}
              placeholder="绑定类型"
              value={bindingType}
              onChange={(value) => updateParams({ bindingType: value, page: '1' })}
              options={bindingTypeOptions}
            />
            <Select
              allowClear
              style={{ width: 120 }}
              placeholder="状态"
              value={isActiveRaw ?? undefined}
              onChange={(value) => updateParams({ isActive: value, page: '1' })}
              options={[
                { label: '启用', value: 'true' },
                { label: '停用', value: 'false' },
              ]}
            />
          </Space>
        </Space>
      </Card>

      <Card>
        <Table<UserConfigBindingDto>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.data ?? []}
          columns={columns}
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

      <Modal
        title={editingBinding ? '编辑绑定' : '新建绑定'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        onOk={submitForm}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text strong>绑定类型</Text>
            <Select
              disabled={Boolean(editingBinding)}
              style={{ width: '100%', marginTop: 4 }}
              value={formState.bindingType}
              onChange={(value) => setFormState((prev) => ({ ...prev, bindingType: value }))}
              options={bindingTypeOptions}
            />
          </div>
          <div>
            <Text strong>目标ID</Text>
            <Input
              disabled={Boolean(editingBinding)}
              style={{ marginTop: 4 }}
              value={formState.targetId}
              onChange={(e) => setFormState((prev) => ({ ...prev, targetId: e.target.value }))}
            />
          </div>
          <div>
            <Text strong>目标编码</Text>
            <Input
              style={{ marginTop: 4 }}
              value={formState.targetCode}
              onChange={(e) => setFormState((prev) => ({ ...prev, targetCode: e.target.value }))}
            />
          </div>
          <div>
            <Text strong>优先级</Text>
            <Input
              type="number"
              min={0}
              max={9999}
              style={{ marginTop: 4 }}
              value={formState.priority}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  priority: Number(e.target.value || 0),
                }))
              }
            />
          </div>
          <div>
            <Space>
              <Text strong>启用状态</Text>
              <Switch
                checked={formState.isActive}
                onChange={(checked) => setFormState((prev) => ({ ...prev, isActive: checked }))}
              />
            </Space>
          </div>
        </Space>
      </Modal>
    </Space>
  );
};

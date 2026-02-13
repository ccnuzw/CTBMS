import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AgentMemoryPolicy,
  AgentProfileDto,
  AgentRoleType,
  CreateAgentProfileDto,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
  useAgentProfiles,
  useCreateAgentProfile,
  useDeleteAgentProfile,
  usePublishAgentProfile,
} from '../api';

const { Title } = Typography;

const roleOptions: AgentRoleType[] = [
  'ANALYST',
  'RISK_OFFICER',
  'JUDGE',
  'COST_SPREAD',
  'FUTURES_EXPERT',
  'SPOT_EXPERT',
  'LOGISTICS_EXPERT',
  'EXECUTION_ADVISOR',
];

const memoryOptions: AgentMemoryPolicy[] = ['none', 'short-term', 'windowed'];

export const AgentProfilePage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateAgentProfileDto>();
  const [keyword, setKeyword] = useState<string | undefined>();
  const [visible, setVisible] = useState(false);

  const { data, isLoading } = useAgentProfiles({
    includePublic: true,
    keyword,
    page: 1,
    pageSize: 100,
  });

  const createMutation = useCreateAgentProfile();
  const publishMutation = usePublishAgentProfile();
  const deleteMutation = useDeleteAgentProfile();

  const columns = useMemo<ColumnsType<AgentProfileDto>>(
    () => [
      { title: '编码', dataIndex: 'agentCode', width: 200 },
      { title: '名称', dataIndex: 'agentName', width: 180 },
      { title: '角色', dataIndex: 'roleType', width: 140, render: (v: string) => <Tag>{v}</Tag> },
      { title: '模型Key', dataIndex: 'modelConfigKey', width: 160 },
      { title: 'Prompt编码', dataIndex: 'agentPromptCode', width: 180 },
      { title: '版本', dataIndex: 'version', width: 80 },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 90,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{value ? 'ACTIVE' : 'INACTIVE'}</Tag>
        ),
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 160,
        render: (_, record) => (
          <Space size={4}>
            <Button
              type="link"
              onClick={async () => {
                try {
                  await publishMutation.mutateAsync(record.id);
                  message.success('发布成功');
                } catch (error) {
                  message.error(getErrorMessage(error) || '发布失败');
                }
              }}
            >
              发布
            </Button>
            <Popconfirm
              title="确认停用该 Agent?"
              onConfirm={async () => {
                try {
                  await deleteMutation.mutateAsync(record.id);
                  message.success('停用成功');
                } catch (error) {
                  message.error(getErrorMessage(error) || '停用失败');
                }
              }}
            >
              <Button type="link" danger>
                停用
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteMutation, message, publishMutation],
  );

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await createMutation.mutateAsync(values);
      message.success('创建成功');
      setVisible(false);
      form.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '创建失败');
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            Agent 管理中心
          </Title>
          <Space>
            <Input.Search
              allowClear
              placeholder="按编码/名称搜索"
              onSearch={(value) => setKeyword(value?.trim() || undefined)}
              style={{ width: 260 }}
            />
            <Button type="primary" onClick={() => setVisible(true)}>
              新建 Agent
            </Button>
          </Space>
        </Space>

        <Table<AgentProfileDto>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.data ?? []}
          columns={columns}
          scroll={{ x: 1300 }}
          pagination={false}
        />
      </Space>

      <Modal
        title="新建 Agent"
        open={visible}
        onCancel={() => setVisible(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={760}
      >
        <Form<CreateAgentProfileDto>
          layout="vertical"
          form={form}
          initialValues={{
            roleType: 'ANALYST',
            memoryPolicy: 'none',
            timeoutMs: 30000,
            templateSource: 'PRIVATE',
            toolPolicy: {},
            guardrails: {},
            retryPolicy: { retryCount: 1, retryBackoffMs: 2000 },
          }}
        >
          <Form.Item name="agentCode" label="编码" rules={[{ required: true }]}>
            <Input placeholder="如 MARKET_ANALYST_V1" />
          </Form.Item>
          <Form.Item name="agentName" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="roleType" label="角色" rules={[{ required: true }]}>
            <Select options={roleOptions.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="objective" label="目标">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="modelConfigKey" label="模型配置Key" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="agentPromptCode" label="Prompt编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="outputSchemaCode" label="输出Schema编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="memoryPolicy" label="记忆策略" rules={[{ required: true }]}>
            <Select options={memoryOptions.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="timeoutMs" label="超时(ms)" rules={[{ required: true }]}>
            <InputNumber min={1000} max={120000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="templateSource" label="模板来源" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'PRIVATE', value: 'PRIVATE' },
                { label: 'PUBLIC', value: 'PUBLIC' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

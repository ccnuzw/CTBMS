import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CreateDataConnectorDto,
  DataConnectorDto,
  DataConnectorType,
  DataConnectorOwnerType,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
  useCreateDataConnector,
  useDataConnectors,
  useDeleteDataConnector,
  useHealthCheckDataConnector,
} from '../api';

const { Title } = Typography;

const typeOptions: DataConnectorType[] = [
  'INTERNAL_DB',
  'REST_API',
  'GRAPHQL',
  'FILE_IMPORT',
  'WEBHOOK',
];

const ownerTypeOptions: DataConnectorOwnerType[] = ['SYSTEM', 'ADMIN'];

export const DataConnectorPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateDataConnectorDto>();
  const [keyword, setKeyword] = useState<string | undefined>();
  const [visible, setVisible] = useState(false);

  const { data, isLoading } = useDataConnectors({ keyword, page: 1, pageSize: 100 });
  const createMutation = useCreateDataConnector();
  const deleteMutation = useDeleteDataConnector();
  const healthMutation = useHealthCheckDataConnector();

  const columns = useMemo<ColumnsType<DataConnectorDto>>(
    () => [
      { title: '连接器编码', dataIndex: 'connectorCode', width: 220 },
      { title: '名称', dataIndex: 'connectorName', width: 180 },
      { title: '类型', dataIndex: 'connectorType', width: 120 },
      { title: '分类', dataIndex: 'category', width: 120 },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{value ? 'ACTIVE' : 'INACTIVE'}</Tag>
        ),
      },
      { title: '版本', dataIndex: 'version', width: 80 },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        render: (_, record) => (
          <Space size={4}>
            <Button
              type="link"
              onClick={async () => {
                try {
                  const res = await healthMutation.mutateAsync({
                    id: record.id,
                    payload: { timeoutMs: 1500 },
                  });
                  if (res.healthy) {
                    message.success(`健康检查通过，耗时 ${res.latencyMs}ms`);
                  } else {
                    message.warning(res.message || '健康检查失败');
                  }
                } catch (error) {
                  message.error(getErrorMessage(error) || '健康检查失败');
                }
              }}
            >
              健康检查
            </Button>
            <Popconfirm
              title="确认停用该连接器?"
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
    [deleteMutation, healthMutation, message],
  );

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const payload: CreateDataConnectorDto = {
        ...values,
        endpointConfig: values.endpointConfig
          ? JSON.parse(values.endpointConfig as unknown as string)
          : undefined,
      };
      await createMutation.mutateAsync(payload);
      message.success('连接器创建成功');
      setVisible(false);
      form.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '连接器创建失败');
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            数据连接器中心
          </Title>
          <Space>
            <Input.Search
              allowClear
              placeholder="按编码/名称搜索"
              onSearch={(value) => setKeyword(value?.trim() || undefined)}
              style={{ width: 260 }}
            />
            <Button type="primary" onClick={() => setVisible(true)}>
              新建连接器
            </Button>
          </Space>
        </Space>

        <Table<DataConnectorDto>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.data ?? []}
          columns={columns}
          scroll={{ x: 1300 }}
          pagination={false}
        />
      </Space>

      <Modal
        title="新建连接器"
        open={visible}
        onCancel={() => setVisible(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={760}
      >
        <Form<CreateDataConnectorDto>
          layout="vertical"
          form={form}
          initialValues={{
            connectorType: 'INTERNAL_DB',
            ownerType: 'SYSTEM',
          }}
        >
          <Form.Item name="connectorCode" label="编码" rules={[{ required: true }]}>
            <Input placeholder="如 INTERNAL_PRICE_DATA" />
          </Form.Item>
          <Form.Item name="connectorName" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="connectorType" label="类型" rules={[{ required: true }]}>
            <Select options={typeOptions.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Input placeholder="如 PRICE / FUTURES" />
          </Form.Item>
          <Form.Item name="ownerType" label="所有者类型" rules={[{ required: true }]}>
            <Select options={ownerTypeOptions.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="fallbackConnectorCode" label="Fallback连接器编码">
            <Input />
          </Form.Item>
          <Form.Item name="endpointConfig" label="Endpoint配置(JSON)">
            <Input.TextArea rows={3} placeholder={'例如 {"url":"https://example.com/health"}'} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

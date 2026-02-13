import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
  Drawer,
  Descriptions,
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
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import {
  useCreateDataConnector,
  useDataConnectors,
  useDeleteDataConnector,
  useHealthCheckDataConnector,
  useUpdateDataConnector,
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

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

export const DataConnectorPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateDataConnectorDto>();
  const [editForm] = Form.useForm<{
    connectorName: string;
    endpointConfigText?: string;
    isActive?: boolean;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState<string | undefined>(
    searchParams.get('keyword')?.trim() || undefined,
  );
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(
    searchParams.get('isActive') === 'true'
      ? true
      : searchParams.get('isActive') === 'false'
        ? false
        : undefined,
  );
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));
  const [selectedConnector, setSelectedConnector] = useState<DataConnectorDto | null>(null);
  const [editVisible, setEditVisible] = useState(false);

  const { data, isLoading } = useDataConnectors({
    keyword,
    isActive: isActiveFilter,
    page,
    pageSize,
  });
  const createMutation = useCreateDataConnector();
  const deleteMutation = useDeleteDataConnector();
  const healthMutation = useHealthCheckDataConnector();
  const updateMutation = useUpdateDataConnector();

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (keyword) {
      next.set('keyword', keyword);
    }
    if (isActiveFilter !== undefined) {
      next.set('isActive', String(isActiveFilter));
    }
    next.set('page', String(page));
    next.set('pageSize', String(pageSize));
    setSearchParams(next, { replace: true });
  }, [isActiveFilter, keyword, page, pageSize, setSearchParams]);

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
            <Button type="link" onClick={() => setSelectedConnector(record)}>
              详情
            </Button>
            <Button
              type="link"
              onClick={() => {
                setSelectedConnector(record);
                editForm.setFieldsValue({
                  connectorName: record.connectorName,
                  endpointConfigText: record.endpointConfig
                    ? JSON.stringify(record.endpointConfig, null, 2)
                    : '{}',
                  isActive: record.isActive,
                });
                setEditVisible(true);
              }}
            >
              编辑
            </Button>
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
      let endpointConfig: Record<string, unknown> | undefined;
      if (values.endpointConfig) {
        try {
          endpointConfig = JSON.parse(values.endpointConfig as unknown as string) as Record<
            string,
            unknown
          >;
        } catch {
          message.error('Endpoint配置必须是合法 JSON');
          return;
        }
      }
      const payload: CreateDataConnectorDto = {
        ...values,
        endpointConfig,
      };
      await createMutation.mutateAsync(payload);
      message.success('连接器创建成功');
      setVisible(false);
      form.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '连接器创建失败');
    }
  };

  const handleEdit = async () => {
    if (!selectedConnector) {
      return;
    }
    try {
      const values = await editForm.validateFields();
      let endpointConfig: Record<string, unknown> | undefined;
      if (values.endpointConfigText?.trim()) {
        try {
          endpointConfig = JSON.parse(values.endpointConfigText) as Record<string, unknown>;
        } catch {
          message.error('Endpoint配置必须是合法 JSON');
          return;
        }
      }

      await updateMutation.mutateAsync({
        id: selectedConnector.id,
        payload: {
          connectorName: values.connectorName,
          endpointConfig,
          isActive: values.isActive,
        },
      });
      message.success('连接器更新成功');
      setEditVisible(false);
    } catch (error) {
      message.error(getErrorMessage(error) || '连接器更新失败');
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
              onSearch={(value) => {
                setKeyword(value?.trim() || undefined);
                setPage(1);
              }}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              style={{ width: 140 }}
              placeholder="状态筛选"
              options={[
                { label: 'ACTIVE', value: true },
                { label: 'INACTIVE', value: false },
              ]}
              value={isActiveFilter}
              onChange={(value) => {
                setIsActiveFilter(value);
                setPage(1);
              }}
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
          pagination={{
            current: data?.page ?? page,
            pageSize: data?.pageSize ?? pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
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

      <Modal
        title={`编辑连接器 - ${selectedConnector?.connectorCode || ''}`}
        open={editVisible}
        onCancel={() => setEditVisible(false)}
        onOk={handleEdit}
        confirmLoading={updateMutation.isPending}
        width={760}
      >
        <Form layout="vertical" form={editForm}>
          <Form.Item name="connectorName" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isActive" label="是否启用">
            <Select
              options={[
                { label: 'ACTIVE', value: true },
                { label: 'INACTIVE', value: false },
              ]}
            />
          </Form.Item>
          <Form.Item name="endpointConfigText" label="Endpoint配置(JSON)">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="连接器详情"
        width={820}
        open={Boolean(selectedConnector) && !editVisible}
        onClose={() => setSelectedConnector(null)}
      >
        <Descriptions
          bordered
          size="small"
          column={2}
          items={[
            { key: 'code', label: '编码', children: selectedConnector?.connectorCode || '-' },
            { key: 'name', label: '名称', children: selectedConnector?.connectorName || '-' },
            { key: 'type', label: '类型', children: selectedConnector?.connectorType || '-' },
            { key: 'category', label: '分类', children: selectedConnector?.category || '-' },
            { key: 'owner', label: 'OwnerType', children: selectedConnector?.ownerType || '-' },
            { key: 'version', label: '版本', children: selectedConnector?.version ?? '-' },
            {
              key: 'status',
              label: '状态',
              children: selectedConnector ? (
                <Tag color={selectedConnector.isActive ? 'green' : 'red'}>
                  {selectedConnector.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Tag>
              ) : (
                '-'
              ),
            },
            {
              key: 'endpoint',
              label: 'Endpoint配置',
              span: 2,
              children: (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {selectedConnector?.endpointConfig
                    ? JSON.stringify(selectedConnector.endpointConfig, null, 2)
                    : '-'}
                </pre>
              ),
            },
          ]}
        />
      </Drawer>
    </Card>
  );
};

import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
  Collapse,
  Col,
  Drawer,
  Descriptions,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  theme,
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
import {
  typeOptions,
  ownerTypeOptions,
  categoryOptions,
  getConnectorTypeLabel,
  getConnectorCategoryLabel,
  getActiveStatusLabel,
  parsePositiveInt,
  slugifyConnectorCode,
  assembleEndpointConfig,
  decomposeEndpointConfig,
} from './connectorConstants';
import EndpointConfigFields from './EndpointConfigFields';

const { Title } = Typography;

export const DataConnectorPage: React.FC = () => {

  const { message } = App.useApp();
  const { token } = theme.useToken();
  const [form] = Form.useForm<CreateDataConnectorDto>();
  const [editForm] = Form.useForm<{
    connectorName: string;
    connectorType?: DataConnectorType;
    endpointConfig?: Record<string, unknown>;
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
  const [isCodeCustomized, setIsCodeCustomized] = useState(false);

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
    const next = new URLSearchParams(searchParams);
    if (keyword) {
      next.set('keyword', keyword);
    } else {
      next.delete('keyword');
    }
    if (isActiveFilter !== undefined) {
      next.set('isActive', String(isActiveFilter));
    } else {
      next.delete('isActive');
    }
    next.set('page', String(page));
    next.set('pageSize', String(pageSize));
    setSearchParams(next, { replace: true });
  }, [isActiveFilter, keyword, page, pageSize, searchParams, setSearchParams]);

  const columns = useMemo<ColumnsType<DataConnectorDto>>(
    () => [
      { title: '名称', dataIndex: 'connectorName', width: 220 },
      {
        title: '类型',
        dataIndex: 'connectorType',
        width: 140,
        render: (value: DataConnectorType) => (
          <Tag color="blue">{getConnectorTypeLabel(value)}</Tag>
        ),
      },
      {
        title: '分类',
        dataIndex: 'category',
        width: 140,
        render: (value: string) => <Tag>{getConnectorCategoryLabel(value)}</Tag>,
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{getActiveStatusLabel(value)}</Tag>
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
                  connectorType: record.connectorType,
                  ...decomposeEndpointConfig(
                    record.endpointConfig as Record<string, unknown> | null,
                  ),
                  endpointConfigText: record.endpointConfig
                    ? JSON.stringify(record.endpointConfig, null, 2)
                    : '{}',
                  isActive: record.isActive,
                } as Parameters<typeof editForm.setFieldsValue>[0]);
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
                    payload: { timeoutSeconds: 1 },
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
    [deleteMutation, editForm, healthMutation, message],
  );

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const connectorType = values.connectorType;
      const endpointConfig = assembleEndpointConfig(
        connectorType,
        values as unknown as Record<string, unknown>,
      );

      const payload: CreateDataConnectorDto = {
        ...values,
        endpointConfig,
      };
      await createMutation.mutateAsync(payload);
      message.success('连接器创建成功');
      setVisible(false);
      form.resetFields();
      setIsCodeCustomized(false);
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
      const connectorType = values.connectorType || selectedConnector.connectorType;
      const endpointConfig = assembleEndpointConfig(
        connectorType,
        values as unknown as Record<string, unknown>,
      );

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
                { label: getActiveStatusLabel(true), value: true },
                { label: getActiveStatusLabel(false), value: false },
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

      {/* ========== 新建连接器 ========== */}
      <Modal
        title={
          <Flex align="center" gap="middle">
            <span>新建数据连接器</span>
            <Space size="small">
              <Button
                size="small"
                type="primary"
                ghost
                onClick={() => {
                  form.setFieldsValue({
                    connectorType: 'REST_API',
                    ownerType: 'SYSTEM',
                  });
                }}
              >
                REST 接口
              </Button>
              <Button
                size="small"
                type="primary"
                ghost
                onClick={() => {
                  form.setFieldsValue({
                    connectorType: 'INTERNAL_DB',
                    ownerType: 'SYSTEM',
                  });
                }}
              >
                数据库
              </Button>
              <Button
                size="small"
                type="primary"
                ghost
                onClick={() => {
                  form.setFieldsValue({
                    connectorType: 'WEBHOOK',
                    ownerType: 'SYSTEM',
                  });
                }}
              >
                Webhook
              </Button>
            </Space>
          </Flex>
        }
        open={visible}
        onCancel={() => {
          setVisible(false);
          setIsCodeCustomized(false);
        }}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={760}
      >
        <Form<CreateDataConnectorDto>
          layout="vertical"
          form={form}
          initialValues={{
            connectorType: 'REST_API',
            ownerType: 'SYSTEM',
          }}
          onValuesChange={(changed) => {
            const changedName = changed.connectorName as string | undefined;
            if (changedName !== undefined && !isCodeCustomized) {
              const generatedCode = slugifyConnectorCode(changedName);
              form.setFieldsValue({ connectorCode: generatedCode || undefined });
            }
            const changedCode = changed.connectorCode as string | undefined;
            if (changedCode !== undefined) {
              const generatedCode = slugifyConnectorCode(form.getFieldValue('connectorName'));
              const normalized = changedCode.trim();
              if (!normalized) {
                setIsCodeCustomized(false);
              } else {
                setIsCodeCustomized(Boolean(generatedCode && normalized !== generatedCode));
              }
            }
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="connectorName" label="连接器名称 (中文)" rules={[{ required: true }]}>
                <Input placeholder="如：内部价格数据库" />
              </Form.Item>
              <Form.Item
                name="connectorCode"
                label={
                  <span style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 'normal' }}>
                    唯一编码 (根据名称自动生成)
                  </span>
                }
                rules={[{ required: true }]}
                style={{ marginTop: -16, marginBottom: 16 }}
              >
                <Input
                  bordered={false}
                  style={{
                    color: token.colorTextDisabled,
                    padding: 0,
                    fontSize: 12,
                    transform: 'translateY(-10px)',
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="connectorType" label="接入类型" rules={[{ required: true }]}>
                <Select
                  options={typeOptions.map((item) => ({
                    label: getConnectorTypeLabel(item),
                    value: item,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="业务分类" rules={[{ required: true }]}>
                <Select
                  showSearch
                  options={categoryOptions}
                  placeholder="选择业务分类"
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ownerType" label="所有者" rules={[{ required: true }]}>
                <Select options={ownerTypeOptions.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.connectorType !== curr.connectorType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('connectorType') as DataConnectorType;
              return <EndpointConfigFields type={type} />;
            }}
          </Form.Item>

          <Collapse
            ghost
            style={{ backgroundColor: token.colorFillQuaternary, borderRadius: 8 }}
          >
            <Collapse.Panel key="advanced" header="⚙️ 高级配置 (按需展开)">
              <Form.Item name="fallbackConnectorCode" label="Fallback 连接器编码">
                <Input placeholder="当主连接器不可用时自动切换" />
              </Form.Item>
            </Collapse.Panel>
          </Collapse>
        </Form>
      </Modal>

      {/* ========== 编辑连接器 ========== */}
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
                { label: getActiveStatusLabel(true), value: true },
                { label: getActiveStatusLabel(false), value: false },
              ]}
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.connectorType !== curr.connectorType}
          >
            {({ getFieldValue }) => {
              const type = (getFieldValue('connectorType') ||
                selectedConnector?.connectorType) as DataConnectorType;
              if (type) {
                return <EndpointConfigFields type={type} />;
              }
              return null;
            }}
          </Form.Item>

          <Collapse
            ghost
            style={{ backgroundColor: token.colorFillQuaternary, borderRadius: 8 }}
          >
            <Collapse.Panel key="raw" header="📝 原始 JSON 编辑 (高级)">
              <Form.Item name="endpointConfigText" label="Endpoint配置(JSON)">
                <Input.TextArea rows={4} />
              </Form.Item>
            </Collapse.Panel>
          </Collapse>
        </Form>
      </Modal>

      {/* ========== 详情抽屉 ========== */}
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
            {
              key: 'type',
              label: '类型',
              children: getConnectorTypeLabel(selectedConnector?.connectorType),
            },
            {
              key: 'category',
              label: '分类',
              children: getConnectorCategoryLabel(selectedConnector?.category),
            },
            { key: 'owner', label: '所有者类型', children: selectedConnector?.ownerType || '-' },
            { key: 'version', label: '版本', children: selectedConnector?.version ?? '-' },
            {
              key: 'status',
              label: '状态',
              children: selectedConnector ? (
                <Tag color={selectedConnector.isActive ? 'green' : 'red'}>
                  {getActiveStatusLabel(selectedConnector.isActive)}
                </Tag>
              ) : (
                '-'
              ),
            },
            {
              key: 'endpoint',
              label: '端点配置',
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

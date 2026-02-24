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

const { Title } = Typography;

const typeOptions: DataConnectorType[] = [
  'INTERNAL_DB',
  'REST_API',
  'EXCHANGE_API',
  'GRAPHQL',
  'FILE_IMPORT',
  'WEBHOOK',
];

const ownerTypeOptions: DataConnectorOwnerType[] = ['SYSTEM', 'ADMIN'];

const connectorTypeLabelMap: Record<DataConnectorType, string> = {
  INTERNAL_DB: '内部数据库',
  REST_API: 'REST 接口',
  EXCHANGE_API: '交易所接口',
  GRAPHQL: 'GraphQL 接口',
  FILE_IMPORT: '文件导入',
  WEBHOOK: 'Webhook 回调',
};

const connectorCategoryLabelMap: Record<string, string> = {
  MARKET_INTEL: '市场情报',
  MARKET_EVENT: '市场事件',
  MARKET_INSIGHT: '市场洞察',
  MARKET: '市场',
  PRICE: '价格',
  FUTURES: '期货',
  INTEL: '情报',
  ANALYSIS: '分析',
  TRADING: '交易',
  RISK_MANAGEMENT: '风控管理',
  MONITORING: '监控',
  REPORTING: '报表',
};

const categoryOptions = Object.entries(connectorCategoryLabelMap).map(([value, label]) => ({
  label: `${label} (${value})`,
  value,
}));

const getConnectorTypeLabel = (value?: DataConnectorType | null): string => {
  if (!value) return '-';
  return connectorTypeLabelMap[value] ?? value;
};

const getConnectorCategoryLabel = (value?: string | null): string => {
  if (!value) return '-';
  const normalized = value.trim().toUpperCase();
  return connectorCategoryLabelMap[normalized] ?? value;
};

const getActiveStatusLabel = (value?: boolean): string => (value ? '启用' : '停用');

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

/**
 * 将名称自动转换为 SNAKE_CASE 编码
 * "内部价格数据" → "nei_bu_jia_ge_shu_ju" (简化拼音/直译)
 * 如果名称全是英文，则直接 UPPER_SNAKE_CASE
 */
const slugifyConnectorCode = (name?: string): string => {
  if (!name?.trim()) return '';
  const trimmed = name.trim();
  // If all ASCII - just snake_case it
  if (/^[\x20-\x7e]+$/.test(trimmed)) {
    return trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
  // For Chinese/mixed, produce a simplified slug
  return trimmed
    .replace(/[\s-]+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5]+/g, '')
    .toUpperCase();
};

/**
 * 根据连接器类型，将结构化表单字段组装为 endpointConfig JSON
 */
const assembleEndpointConfig = (
  type: DataConnectorType,
  formValues: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const ep = (formValues.endpointConfig ?? {}) as Record<string, unknown>;
  const clean = (obj: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined && val !== null && val !== '') {
        result[key] = val;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  };

  switch (type) {
    case 'INTERNAL_DB':
      return clean({
        host: ep.host,
        port: ep.port,
        database: ep.database,
        schema: ep.schema,
        username: ep.username,
        password: ep.password,
        ssl: ep.ssl,
      });
    case 'REST_API':
      return clean({
        baseUrl: ep.baseUrl,
        authType: ep.authType,
        headerKey: ep.headerKey,
        headerValue: ep.headerValue,
        timeout: ep.timeout,
      });
    case 'EXCHANGE_API':
      return clean({
        baseUrl: ep.baseUrl,
        apiKey: ep.apiKey,
        secretKey: ep.secretKey,
      });
    case 'GRAPHQL':
      return clean({
        endpoint: ep.endpoint,
        wsEndpoint: ep.wsEndpoint,
        authHeader: ep.authHeader,
      });
    case 'FILE_IMPORT':
      return clean({
        filePath: ep.filePath,
        format: ep.format,
        delimiter: ep.delimiter,
        encoding: ep.encoding,
      });
    case 'WEBHOOK':
      return clean({
        callbackUrl: ep.callbackUrl,
        secretToken: ep.secretToken,
        retryCount: ep.retryCount,
        contentType: ep.contentType,
      });
    default:
      return ep && Object.keys(ep).length > 0 ? ep : undefined;
  }
};

/**
 * 将 endpointConfig JSON 反解为嵌套表单字段
 */
const decomposeEndpointConfig = (config?: Record<string, unknown> | null) => {
  if (!config) return {};
  return { endpointConfig: config };
};

/**
 * 根据连接器类型渲染结构化的端点配置表单字段
 */
const EndpointConfigFields: React.FC<{ type: DataConnectorType }> = ({ type }) => {
  const { token } = theme.useToken();

  const wrapperStyle: React.CSSProperties = {
    backgroundColor: token.colorFillAlter,
    padding: '16px 16px 0 16px',
    borderRadius: 8,
    marginBottom: 16,
  };

  switch (type) {
    case 'INTERNAL_DB':
      return (
        <div style={wrapperStyle}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
            🗄️ 数据库连接信息
          </Typography.Text>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'host']} label="主机地址">
                <Input placeholder="如: localhost 或 192.168.1.100" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['endpointConfig', 'port']} label="端口">
                <InputNumber style={{ width: '100%' }} placeholder="5432" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name={['endpointConfig', 'ssl']} label="SSL">
                <Select
                  allowClear
                  options={[
                    { label: '启用', value: true },
                    { label: '禁用', value: false },
                  ]}
                  placeholder="默认禁用"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'database']} label="数据库名">
                <Input placeholder="如: ctbms_production" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'schema']} label="Schema">
                <Input placeholder="如: public" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'username']} label="用户名">
                <Input placeholder="数据库登录用户" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'password']} label="密码">
                <Input.Password placeholder="数据库密码" />
              </Form.Item>
            </Col>
          </Row>
        </div>
      );

    case 'REST_API':
      return (
        <div style={wrapperStyle}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
            🌐 REST API 接入信息
          </Typography.Text>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name={['endpointConfig', 'baseUrl']} label="Base URL">
                <Input placeholder="https://api.example.com/v1" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'timeout']} label="超时 (ms)">
                <InputNumber style={{ width: '100%' }} placeholder="30000" min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'authType']} label="认证方式">
                <Select
                  allowClear
                  options={[
                    { label: '无认证', value: 'NONE' },
                    { label: 'Bearer Token', value: 'BEARER' },
                    { label: 'API Key (Header)', value: 'API_KEY' },
                    { label: 'Basic Auth', value: 'BASIC' },
                  ]}
                  placeholder="选择认证方式"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'headerKey']} label="认证 Header 名">
                <Input placeholder="如: Authorization" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'headerValue']} label="认证值 / Token">
                <Input.Password placeholder="Bearer xxx 或 API Key" />
              </Form.Item>
            </Col>
          </Row>
        </div>
      );

    case 'EXCHANGE_API':
      return (
        <div style={wrapperStyle}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
            📈 交易所 API 凭证
          </Typography.Text>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name={['endpointConfig', 'baseUrl']} label="API Base URL">
                <Input placeholder="https://api.exchange.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'apiKey']} label="API Key">
                <Input.Password placeholder="Access Key" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'secretKey']} label="Secret Key">
                <Input.Password placeholder="Secret Key" />
              </Form.Item>
            </Col>
          </Row>
        </div>
      );

    case 'GRAPHQL':
      return (
        <div style={wrapperStyle}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
            🔗 GraphQL 接入信息
          </Typography.Text>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'endpoint']} label="GraphQL Endpoint">
                <Input placeholder="https://api.example.com/graphql" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'wsEndpoint']} label="WebSocket Endpoint">
                <Input placeholder="wss://api.example.com/graphql (可选)" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name={['endpointConfig', 'authHeader']} label="认证 Header (完整值)">
                <Input.Password placeholder="如: Bearer eyJhbGciOi..." />
              </Form.Item>
            </Col>
          </Row>
        </div>
      );

    case 'FILE_IMPORT':
      return (
        <div style={wrapperStyle}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
            📁 文件导入配置
          </Typography.Text>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name={['endpointConfig', 'filePath']} label="文件路径 / URL">
                <Input placeholder="/data/imports/prices.csv 或 https://..." />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'format']} label="文件格式">
                <Select
                  options={[
                    { label: 'CSV', value: 'CSV' },
                    { label: 'JSON', value: 'JSON' },
                    { label: 'XLSX (Excel)', value: 'XLSX' },
                    { label: 'Parquet', value: 'PARQUET' },
                  ]}
                  placeholder="选择格式"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'delimiter']} label="分隔符 (CSV)">
                <Input placeholder="默认: ," />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'encoding']} label="编码">
                <Select
                  allowClear
                  options={[
                    { label: 'UTF-8', value: 'UTF-8' },
                    { label: 'GBK', value: 'GBK' },
                    { label: 'GB2312', value: 'GB2312' },
                    { label: 'ISO-8859-1', value: 'ISO-8859-1' },
                  ]}
                  placeholder="默认 UTF-8"
                />
              </Form.Item>
            </Col>
          </Row>
        </div>
      );

    case 'WEBHOOK':
      return (
        <div style={wrapperStyle}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
            🔔 Webhook 回调配置
          </Typography.Text>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name={['endpointConfig', 'callbackUrl']} label="回调 URL">
                <Input placeholder="https://your-server.com/webhook/receiver" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name={['endpointConfig', 'retryCount']} label="重试次数">
                <InputNumber style={{ width: '100%' }} min={0} max={10} placeholder="3" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'secretToken']} label="签名密钥 (Secret)">
                <Input.Password placeholder="用于校验 Webhook 签名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name={['endpointConfig', 'contentType']} label="Content-Type">
                <Select
                  allowClear
                  options={[
                    { label: 'application/json', value: 'application/json' },
                    { label: 'application/x-www-form-urlencoded', value: 'application/x-www-form-urlencoded' },
                  ]}
                  placeholder="默认 JSON"
                />
              </Form.Item>
            </Col>
          </Row>
        </div>
      );

    default:
      return null;
  }
};

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
            { key: 'owner', label: 'OwnerType', children: selectedConnector?.ownerType || '-' },
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

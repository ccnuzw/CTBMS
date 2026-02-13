import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { TriggerConfigDto, CreateTriggerConfigDto } from '@packages/types';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import {
  useTriggerConfigs,
  useTriggerConfigDetail,
  useCreateTriggerConfig,
  useDeleteTriggerConfig,
  useActivateTriggerConfig,
  useDeactivateTriggerConfig,
  useTriggerLogsByConfig,
  useTriggerLogs,
  type TriggerLogWithConfig,
} from '../api';

const { Title } = Typography;

const triggerTypeOptions = ['MANUAL', 'API', 'SCHEDULE', 'EVENT', 'ON_DEMAND'];

const triggerTypeColorMap: Record<string, string> = {
  MANUAL: 'default',
  API: 'blue',
  SCHEDULE: 'purple',
  EVENT: 'cyan',
  ON_DEMAND: 'geekblue',
};

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
  ERROR: 'volcano',
};

const logStatusColorMap: Record<string, string> = {
  SUCCESS: 'green',
  FAILED: 'red',
  SKIPPED: 'orange',
  TIMEOUT: 'volcano',
};

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const TriggerGatewayPage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateTriggerConfigDto>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>(searchParams.get('tab') || 'configs');
  const [keywordInput, setKeywordInput] = useState(searchParams.get('keyword')?.trim() || '');
  const [keyword, setKeyword] = useState<string | undefined>(
    searchParams.get('keyword')?.trim() || undefined,
  );
  const [typeFilter, setTypeFilter] = useState<string | undefined>(
    searchParams.get('triggerType') || undefined,
  );
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    searchParams.get('status') || undefined,
  );
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));
  const [logPage, setLogPage] = useState(1);
  const [logPageSize, setLogPageSize] = useState(50);

  const selectedTriggerType = Form.useWatch('triggerType', form);

  React.useEffect(() => {
    const next = new URLSearchParams();
    next.set('tab', activeTab);
    if (keyword) next.set('keyword', keyword);
    if (typeFilter) next.set('triggerType', typeFilter);
    if (statusFilter) next.set('status', statusFilter);
    next.set('page', String(page));
    next.set('pageSize', String(pageSize));
    setSearchParams(next, { replace: true });
  }, [activeTab, keyword, typeFilter, statusFilter, page, pageSize, setSearchParams]);

  const { data, isLoading } = useTriggerConfigs({
    keyword,
    triggerType: typeFilter,
    status: statusFilter,
    page,
    pageSize,
  });

  const { data: detail, isLoading: isDetailLoading } = useTriggerConfigDetail(
    selectedId || undefined,
  );

  const { data: configLogs, isLoading: isConfigLogsLoading } = useTriggerLogsByConfig(
    selectedId || undefined,
    { page: logPage, pageSize: logPageSize },
  );

  const { data: allLogs, isLoading: isAllLogsLoading } = useTriggerLogs(
    activeTab === 'logs' ? { page: logPage, pageSize: logPageSize } : undefined,
  );

  const createMutation = useCreateTriggerConfig();
  const deleteMutation = useDeleteTriggerConfig();
  const activateMutation = useActivateTriggerConfig();
  const deactivateMutation = useDeactivateTriggerConfig();

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await createMutation.mutateAsync(values);
      message.success('触发器创建成功');
      setCreateVisible(false);
      form.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '创建失败');
    }
  };

  const configColumns = useMemo<ColumnsType<TriggerConfigDto>>(
    () => [
      { title: '名称', dataIndex: 'name', width: 200 },
      {
        title: '触发类型',
        dataIndex: 'triggerType',
        width: 120,
        render: (value: string) => (
          <Tag color={triggerTypeColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (value: string) => (
          <Tag color={statusColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      {
        title: '最后触发',
        dataIndex: 'lastTriggeredAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '下次触发',
        dataIndex: 'nextFireAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 280,
        render: (_, record) => (
          <Space size={4}>
            <Button type="link" onClick={() => setSelectedId(record.id)}>
              详情
            </Button>
            {record.status === 'ACTIVE' ? (
              <Popconfirm
                title="确认停用该触发器?"
                onConfirm={async () => {
                  try {
                    await deactivateMutation.mutateAsync(record.id);
                    message.success('已停用');
                  } catch (error) {
                    message.error(getErrorMessage(error) || '操作失败');
                  }
                }}
              >
                <Button type="link" danger>
                  停用
                </Button>
              </Popconfirm>
            ) : (
              <Button
                type="link"
                onClick={async () => {
                  try {
                    await activateMutation.mutateAsync(record.id);
                    message.success('已启用');
                  } catch (error) {
                    message.error(getErrorMessage(error) || '操作失败');
                  }
                }}
              >
                启用
              </Button>
            )}
            <Popconfirm
              title="确认删除该触发器?"
              onConfirm={async () => {
                try {
                  await deleteMutation.mutateAsync(record.id);
                  message.success('删除成功');
                  if (selectedId === record.id) setSelectedId(null);
                } catch (error) {
                  message.error(getErrorMessage(error) || '删除失败');
                }
              }}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [activateMutation, deactivateMutation, deleteMutation, message, selectedId],
  );

  const logColumns = useMemo<ColumnsType<TriggerLogWithConfig>>(
    () => [
      {
        title: '触发器',
        dataIndex: ['triggerConfig', 'name'],
        width: 180,
        render: (value?: string) => value || '-',
      },
      {
        title: '触发类型',
        dataIndex: 'triggerType',
        width: 120,
        render: (value: string) => (
          <Tag color={triggerTypeColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (value: string) => (
          <Tag color={logStatusColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      {
        title: '耗时(ms)',
        dataIndex: 'durationMs',
        width: 100,
        render: (value?: number) => (value !== null && value !== undefined ? value : '-'),
      },
      {
        title: '错误信息',
        dataIndex: 'errorMessage',
        ellipsis: true,
        render: (value?: string) => value || '-',
      },
      {
        title: '触发时间',
        dataIndex: 'triggeredAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
    ],
    [],
  );

  const renderConfigsTab = () => (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="按名称搜索"
            value={keywordInput}
            onChange={(e) => {
              const nextValue = e.target.value;
              setKeywordInput(nextValue);
              if (!nextValue.trim()) {
                setKeyword(undefined);
                setPage(1);
              }
            }}
            onSearch={(value) => {
              const normalized = value?.trim() || '';
              setKeywordInput(normalized);
              setKeyword(normalized || undefined);
              setPage(1);
            }}
            style={{ width: 240 }}
          />
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="触发类型"
            options={triggerTypeOptions.map((item) => ({ label: item, value: item }))}
            value={typeFilter}
            onChange={(value) => {
              setTypeFilter(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder="状态"
            options={[
              { label: 'ACTIVE', value: 'ACTIVE' },
              { label: 'INACTIVE', value: 'INACTIVE' },
              { label: 'ERROR', value: 'ERROR' },
            ]}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          />
        </Space>
        <Button type="primary" onClick={() => setCreateVisible(true)}>
          新建触发器
        </Button>
      </Space>

      <Table<TriggerConfigDto>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.data ?? []}
        columns={configColumns}
        scroll={{ x: 1400 }}
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
  );

  const renderLogsTab = () => (
    <Table<TriggerLogWithConfig>
      rowKey="id"
      loading={isAllLogsLoading}
      dataSource={allLogs?.data ?? []}
      columns={logColumns}
      scroll={{ x: 1100 }}
      pagination={{
        current: allLogs?.page ?? logPage,
        pageSize: allLogs?.pageSize ?? logPageSize,
        total: allLogs?.total ?? 0,
        showSizeChanger: true,
        onChange: (nextPage, nextPageSize) => {
          setLogPage(nextPage);
          setLogPageSize(nextPageSize);
        },
      }}
    />
  );

  const renderCronConfigDetail = (config: Record<string, unknown>) => (
    <Descriptions column={2} bordered size="small">
      <Descriptions.Item label="Cron 表达式">{String(config.cronExpression ?? '-')}</Descriptions.Item>
      <Descriptions.Item label="时区">{String(config.timezone ?? '-')}</Descriptions.Item>
      <Descriptions.Item label="最大并发">{String(config.maxConcurrent ?? '-')}</Descriptions.Item>
      <Descriptions.Item label="补偿遗漏">{config.catchUpMissed ? '是' : '否'}</Descriptions.Item>
      {Boolean(config.startDate) && (
        <Descriptions.Item label="开始时间">
          {dayjs(String(config.startDate)).format('YYYY-MM-DD HH:mm:ss')}
        </Descriptions.Item>
      )}
      {Boolean(config.endDate) && (
        <Descriptions.Item label="结束时间">
          {dayjs(String(config.endDate)).format('YYYY-MM-DD HH:mm:ss')}
        </Descriptions.Item>
      )}
    </Descriptions>
  );

  const renderApiConfigDetail = (config: Record<string, unknown>) => (
    <Descriptions column={2} bordered size="small">
      <Descriptions.Item label="认证方式">{String(config.authMethod ?? '-')}</Descriptions.Item>
      <Descriptions.Item label="速率限制">{String(config.rateLimitPerMinute ?? '-')}/分钟</Descriptions.Item>
      {Boolean(config.allowedIps) && (
        <Descriptions.Item label="IP 白名单" span={2}>
          {Array.isArray(config.allowedIps) ? config.allowedIps.join(', ') : '-'}
        </Descriptions.Item>
      )}
    </Descriptions>
  );

  const renderEventConfigDetail = (config: Record<string, unknown>) => (
    <Descriptions column={2} bordered size="small">
      <Descriptions.Item label="事件来源">{String(config.eventSource ?? '-')}</Descriptions.Item>
      <Descriptions.Item label="事件类型">{String(config.eventType ?? '-')}</Descriptions.Item>
      <Descriptions.Item label="匹配模式">{String(config.matchMode ?? '-')}</Descriptions.Item>
      <Descriptions.Item label="防抖(ms)">{String(config.debounceMs ?? 0)}</Descriptions.Item>
      {Array.isArray(config.filterRules) && config.filterRules.length > 0 && (
        <Descriptions.Item label="过滤规则" span={2}>
          <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(config.filterRules, null, 2)}
          </pre>
        </Descriptions.Item>
      )}
    </Descriptions>
  );

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Title level={4} style={{ margin: 0 }}>
          触发接入中心
        </Title>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            setPage(1);
            setLogPage(1);
          }}
          items={[
            { key: 'configs', label: '触发器配置', children: renderConfigsTab() },
            { key: 'logs', label: '触发日志', children: renderLogsTab() },
          ]}
        />
      </Space>

      <Modal
        title="新建触发器"
        open={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={640}
      >
        <Form<CreateTriggerConfigDto>
          layout="vertical"
          form={form}
          initialValues={{ triggerType: 'SCHEDULE' }}
        >
          <Form.Item name="workflowDefinitionId" label="关联流程定义 ID" rules={[{ required: true }]}>
            <Input placeholder="输入 WorkflowDefinition UUID" />
          </Form.Item>
          <Form.Item name="name" label="触发器名称" rules={[{ required: true }]}>
            <Input placeholder="如: 每日定时触发" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="triggerType" label="触发类型" rules={[{ required: true }]}>
            <Select
              options={triggerTypeOptions.map((item) => ({ label: item, value: item }))}
            />
          </Form.Item>

          {selectedTriggerType === 'SCHEDULE' && (
            <>
              <Form.Item
                name={['cronConfig', 'cronExpression']}
                label="Cron 表达式"
                rules={[{ required: true }]}
              >
                <Input placeholder="如: 0 0 8 * * ? (每天8点)" />
              </Form.Item>
              <Form.Item name={['cronConfig', 'timezone']} label="时区" initialValue="Asia/Shanghai">
                <Input />
              </Form.Item>
            </>
          )}

          {selectedTriggerType === 'API' && (
            <>
              <Form.Item name={['apiConfig', 'authMethod']} label="认证方式" initialValue="API_KEY">
                <Select
                  options={[
                    { label: '无认证', value: 'NONE' },
                    { label: 'API Key', value: 'API_KEY' },
                    { label: 'Bearer Token', value: 'BEARER_TOKEN' },
                    { label: 'HMAC', value: 'HMAC' },
                  ]}
                />
              </Form.Item>
              <Form.Item name={['apiConfig', 'rateLimitPerMinute']} label="速率限制(/分钟)">
                <Input type="number" placeholder="60" />
              </Form.Item>
            </>
          )}

          {selectedTriggerType === 'EVENT' && (
            <>
              <Form.Item
                name={['eventConfig', 'eventSource']}
                label="事件来源"
                rules={[{ required: true }]}
              >
                <Input placeholder="如: market-data-service" />
              </Form.Item>
              <Form.Item
                name={['eventConfig', 'eventType']}
                label="事件类型"
                rules={[{ required: true }]}
              >
                <Input placeholder="如: PRICE_UPDATE" />
              </Form.Item>
              <Form.Item name={['eventConfig', 'matchMode']} label="匹配模式" initialValue="ALL">
                <Select
                  options={[
                    { label: '全部匹配 (ALL)', value: 'ALL' },
                    { label: '任意匹配 (ANY)', value: 'ANY' },
                  ]}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Drawer
        title="触发器详情"
        width={800}
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
      >
        {isDetailLoading ? (
          <Card loading />
        ) : detail ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="触发类型">
                <Tag color={triggerTypeColorMap[detail.triggerType] || 'default'}>
                  {detail.triggerType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColorMap[detail.status] || 'default'}>{detail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Cron 状态">
                {detail.cronState || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最后触发">
                {detail.lastTriggeredAt
                  ? dayjs(detail.lastTriggeredAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="下次触发">
                {detail.nextFireAt
                  ? dayjs(detail.nextFireAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="说明" span={2}>
                {detail.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="关联流程" span={2}>
                {detail.workflowDefinitionId}
              </Descriptions.Item>
            </Descriptions>

            {detail.cronConfig && (
              <Card title="Cron 配置" size="small">
                {renderCronConfigDetail(detail.cronConfig as Record<string, unknown>)}
              </Card>
            )}

            {detail.apiConfig && (
              <Card title="API 配置" size="small">
                {renderApiConfigDetail(detail.apiConfig as Record<string, unknown>)}
              </Card>
            )}

            {detail.eventConfig && (
              <Card title="事件配置" size="small">
                {renderEventConfigDetail(detail.eventConfig as Record<string, unknown>)}
              </Card>
            )}

            {detail.paramOverrides && (
              <Card title="参数覆盖" size="small">
                <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detail.paramOverrides, null, 2)}
                </pre>
              </Card>
            )}

            <Card title="触发日志" size="small">
              <Table<TriggerLogWithConfig>
                rowKey="id"
                loading={isConfigLogsLoading}
                dataSource={configLogs?.data ?? []}
                columns={logColumns}
                scroll={{ x: 1000 }}
                size="small"
                pagination={{
                  current: configLogs?.page ?? logPage,
                  pageSize: configLogs?.pageSize ?? logPageSize,
                  total: configLogs?.total ?? 0,
                  showSizeChanger: true,
                  size: 'small',
                  onChange: (nextPage, nextPageSize) => {
                    setLogPage(nextPage);
                    setLogPageSize(nextPageSize);
                  },
                }}
              />
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </Card>
  );
};

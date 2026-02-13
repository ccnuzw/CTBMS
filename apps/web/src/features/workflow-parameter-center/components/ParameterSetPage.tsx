import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
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
import type {
  CreateParameterItemDto,
  CreateParameterSetDto,
  ParameterChangeLogDto,
  ParameterItemDto,
  ParameterOverrideDiffItemDto,
  ParameterScopeLevel,
  ParameterSetDto,
} from '@packages/types';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import {
  useBatchResetParameterItems,
  useCreateParameterItem,
  useCreateParameterSet,
  useDeleteParameterSet,
  useParameterChangeLogs,
  useParameterOverrideDiff,
  useParameterSetDetail,
  useParameterSets,
  usePublishParameterSet,
  useResetParameterItemToDefault,
} from '../api';

const { Title } = Typography;

const scopeOptions: ParameterScopeLevel[] = [
  'PUBLIC_TEMPLATE',
  'USER_TEMPLATE',
  'GLOBAL',
  'COMMODITY',
  'REGION',
  'ROUTE',
  'STRATEGY',
  'SESSION',
];

const paramTypeOptions = ['number', 'string', 'boolean', 'enum', 'json', 'expression'];

const scopeColorMap: Record<string, string> = {
  PUBLIC_TEMPLATE: 'blue',
  USER_TEMPLATE: 'cyan',
  GLOBAL: 'green',
  COMMODITY: 'orange',
  REGION: 'purple',
  ROUTE: 'magenta',
  STRATEGY: 'geekblue',
  SESSION: 'red',
};

const operationColorMap: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  RESET_TO_DEFAULT: 'orange',
  BATCH_RESET: 'volcano',
  PUBLISH: 'purple',
};

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const isPublished = (version?: number): boolean =>
  Number.isInteger(version) && Number(version) >= 2;

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

export const ParameterSetPage: React.FC = () => {
  const { message } = App.useApp();
  const [setForm] = Form.useForm<CreateParameterSetDto>();
  const [itemForm] = Form.useForm<CreateParameterItemDto>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keywordInput, setKeywordInput] = useState(searchParams.get('keyword')?.trim() || '');
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
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [publishingSetId, setPublishingSetId] = useState<string | null>(null);
  const [itemVisible, setItemVisible] = useState(false);
  const [detailTab, setDetailTab] = useState('items');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));
  const [logPage, setLogPage] = useState(1);
  const setTableContainerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (keyword) next.set('keyword', keyword);
    if (isActiveFilter !== undefined) next.set('isActive', String(isActiveFilter));
    next.set('page', String(page));
    next.set('pageSize', String(pageSize));
    setSearchParams(next, { replace: true });
  }, [isActiveFilter, keyword, page, pageSize, setSearchParams]);

  const { data, isLoading } = useParameterSets({
    includePublic: true,
    keyword,
    isActive: isActiveFilter,
    page,
    pageSize,
  });
  const { data: setDetail, isLoading: isDetailLoading } = useParameterSetDetail(
    selectedSetId || undefined,
  );
  const { data: overrideDiff, isLoading: isDiffLoading } = useParameterOverrideDiff(
    detailTab === 'diff' ? selectedSetId || undefined : undefined,
  );
  const { data: changeLogs, isLoading: isLogsLoading } = useParameterChangeLogs(
    detailTab === 'audit' ? selectedSetId || undefined : undefined,
    { page: logPage, pageSize: 20 },
  );

  const normalizedKeyword = keyword?.trim().toLowerCase() || '';
  const highlightedSetId = useMemo(() => {
    if (!normalizedKeyword) return null;
    const rows = data?.data || [];
    const exactMatch = rows.find((item) => item.setCode.trim().toLowerCase() === normalizedKeyword);
    if (exactMatch) return exactMatch.id;
    const fuzzyMatch = rows.find((item) => {
      const code = item.setCode.trim().toLowerCase();
      const name = item.name.trim().toLowerCase();
      return code.includes(normalizedKeyword) || name.includes(normalizedKeyword);
    });
    return fuzzyMatch?.id || null;
  }, [data?.data, normalizedKeyword]);

  React.useEffect(() => {
    if (!highlightedSetId || !setTableContainerRef.current) return;
    const timer = window.setTimeout(() => {
      const row = setTableContainerRef.current?.querySelector<HTMLElement>(
        `tr[data-row-key="${highlightedSetId}"]`,
      );
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [highlightedSetId]);

  const createSetMutation = useCreateParameterSet();
  const deleteSetMutation = useDeleteParameterSet();
  const createItemMutation = useCreateParameterItem();
  const publishSetMutation = usePublishParameterSet();
  const resetItemMutation = useResetParameterItemToDefault();
  const batchResetMutation = useBatchResetParameterItems();

  const handlePublishSet = async (record: ParameterSetDto) => {
    if (!record.isActive) {
      message.warning('参数包未启用，无法发布');
      return;
    }
    if (isPublished(record.version)) {
      message.info('参数包已发布');
      return;
    }
    try {
      setPublishingSetId(record.id);
      await publishSetMutation.mutateAsync({ id: record.id });
      message.success(`参数包 ${record.setCode} 发布成功`);
    } catch (error) {
      message.error(getErrorMessage(error) || '发布失败');
    } finally {
      setPublishingSetId(null);
    }
  };

  const handleResetItem = async (itemId: string) => {
    if (!selectedSetId) return;
    try {
      await resetItemMutation.mutateAsync({ setId: selectedSetId, itemId });
      message.success('已重置到默认值');
    } catch (error) {
      message.error(getErrorMessage(error) || '重置失败');
    }
  };

  const handleBatchReset = async () => {
    if (!selectedSetId || selectedItemIds.length === 0) return;
    try {
      const result = await batchResetMutation.mutateAsync({
        setId: selectedSetId,
        dto: { itemIds: selectedItemIds },
      });
      message.success(`已重置 ${result.resetCount} 个参数项`);
      setSelectedItemIds([]);
    } catch (error) {
      message.error(getErrorMessage(error) || '批量重置失败');
    }
  };

  const setColumns = useMemo<ColumnsType<ParameterSetDto>>(
    () => [
      { title: '参数包编码', dataIndex: 'setCode', width: 220 },
      { title: '名称', dataIndex: 'name', width: 180 },
      {
        title: '来源',
        dataIndex: 'templateSource',
        width: 100,
        render: (value: string) => (
          <Tag color={value === 'PUBLIC' ? 'blue' : 'default'}>{value}</Tag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{value ? 'ACTIVE' : 'INACTIVE'}</Tag>
        ),
      },
      {
        title: '版本',
        dataIndex: 'version',
        width: 90,
        render: (value: number) => (
          <Tag color={isPublished(value) ? 'green' : 'orange'}>{value}</Tag>
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
        width: 260,
        render: (_, record) => (
          <Space size={4}>
            <Button type="link" onClick={() => { setSelectedSetId(record.id); setDetailTab('items'); }}>
              查看详情
            </Button>
            <Popconfirm
              title="确认发布该参数包?"
              onConfirm={() => handlePublishSet(record)}
              disabled={!record.isActive || isPublished(record.version)}
            >
              <Button
                type="link"
                disabled={!record.isActive || isPublished(record.version)}
                loading={publishSetMutation.isPending && publishingSetId === record.id}
              >
                {isPublished(record.version) ? '已发布' : '发布'}
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认停用该参数包?"
              onConfirm={async () => {
                try {
                  await deleteSetMutation.mutateAsync(record.id);
                  message.success('停用成功');
                } catch (error) {
                  message.error(getErrorMessage(error) || '停用失败');
                }
              }}
              disabled={!record.isActive}
            >
              <Button type="link" danger disabled={!record.isActive}>
                停用
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteSetMutation, message, publishSetMutation.isPending, publishingSetId],
  );

  const itemColumns = useMemo<ColumnsType<ParameterItemDto>>(
    () => [
      { title: '参数编码', dataIndex: 'paramCode', width: 180 },
      { title: '名称', dataIndex: 'paramName', width: 150 },
      { title: '类型', dataIndex: 'paramType', width: 90 },
      {
        title: '作用域',
        dataIndex: 'scopeLevel',
        width: 140,
        render: (value: string) => (
          <Tag color={scopeColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      { title: '作用域值', dataIndex: 'scopeValue', width: 100, render: (v?: string) => v || '-' },
      {
        title: '当前值',
        dataIndex: 'value',
        width: 120,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '默认值',
        dataIndex: 'defaultValue',
        width: 120,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '继承状态',
        key: 'inheritStatus',
        width: 100,
        render: (_, record) => {
          const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
          const hasValue = record.value !== null && record.value !== undefined;
          if (!hasDefault) return <Tag>无模板</Tag>;
          if (!hasValue || JSON.stringify(record.value) === JSON.stringify(record.defaultValue)) {
            return <Tag color="green">继承</Tag>;
          }
          return <Tag color="orange">已覆盖</Tag>;
        },
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 80,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{value ? 'ON' : 'OFF'}</Tag>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 100,
        render: (_, record) => {
          const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
          const isOverridden = hasDefault && record.value !== null && record.value !== undefined &&
            JSON.stringify(record.value) !== JSON.stringify(record.defaultValue);
          return (
            <Popconfirm
              title="确认重置到默认值?"
              onConfirm={() => handleResetItem(record.id)}
              disabled={!isOverridden}
            >
              <Button type="link" size="small" disabled={!isOverridden}>
                重置
              </Button>
            </Popconfirm>
          );
        },
      },
    ],
    [selectedSetId],
  );

  const diffColumns = useMemo<ColumnsType<ParameterOverrideDiffItemDto>>(
    () => [
      { title: '参数编码', dataIndex: 'paramCode', width: 180 },
      { title: '名称', dataIndex: 'paramName', width: 150 },
      {
        title: '作用域',
        dataIndex: 'scopeLevel',
        width: 130,
        render: (value: string) => <Tag color={scopeColorMap[value] || 'default'}>{value}</Tag>,
      },
      {
        title: '模板默认值',
        dataIndex: 'templateDefault',
        width: 150,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '当前值',
        dataIndex: 'currentValue',
        width: 150,
        render: (value: unknown, record) => (
          <span style={{ color: record.isOverridden ? '#fa8c16' : undefined, fontWeight: record.isOverridden ? 600 : undefined }}>
            {formatValue(value)}
          </span>
        ),
      },
      {
        title: '覆盖状态',
        dataIndex: 'isOverridden',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'orange' : 'green'}>{value ? '已覆盖' : '继承'}</Tag>
        ),
      },
      {
        title: '覆盖来源',
        dataIndex: 'overrideSource',
        width: 120,
        render: (value?: string) => value || '-',
      },
    ],
    [],
  );

  const auditColumns = useMemo<ColumnsType<ParameterChangeLogDto>>(
    () => [
      {
        title: '操作',
        dataIndex: 'operation',
        width: 130,
        render: (value: string) => (
          <Tag color={operationColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      { title: '字段', dataIndex: 'fieldPath', width: 120, render: (v?: string) => v || '-' },
      {
        title: '旧值',
        dataIndex: 'oldValue',
        width: 150,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '新值',
        dataIndex: 'newValue',
        width: 150,
        render: (value: unknown) => formatValue(value),
      },
      { title: '变更原因', dataIndex: 'changeReason', ellipsis: true, render: (v?: string) => v || '-' },
      { title: '操作人', dataIndex: 'changedByUserId', width: 120 },
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
    ],
    [],
  );

  const handleCreateSet = async () => {
    try {
      const values = await setForm.validateFields();
      await createSetMutation.mutateAsync(values);
      message.success('参数包创建成功');
      setCreateVisible(false);
      setForm.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '参数包创建失败');
    }
  };

  const handleCreateItem = async () => {
    if (!selectedSetId) return;
    try {
      const values = await itemForm.validateFields();
      let parsedValue: unknown = undefined;
      const rawValue = (values.value as unknown as string | undefined)?.trim();
      if (rawValue) {
        try {
          parsedValue = JSON.parse(rawValue);
        } catch {
          parsedValue = rawValue;
        }
      }
      const payload: CreateParameterItemDto = { ...values, value: parsedValue };
      await createItemMutation.mutateAsync({ setId: selectedSetId, payload });
      message.success('参数项创建成功');
      setItemVisible(false);
      itemForm.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '参数项创建失败');
    }
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            参数中心
          </Title>
          <Space>
            <Input.Search
              allowClear
              placeholder="按编码/名称搜索"
              value={keywordInput}
              onChange={(event) => {
                const nextValue = event.target.value;
                setKeywordInput(nextValue);
                if (!nextValue.trim()) { setKeyword(undefined); setPage(1); }
              }}
              onSearch={(value) => {
                const normalized = value?.trim() || '';
                setKeywordInput(normalized);
                setKeyword(normalized || undefined);
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
              onChange={(value) => { setIsActiveFilter(value); setPage(1); }}
            />
            <Button type="primary" onClick={() => setCreateVisible(true)}>
              新建参数包
            </Button>
          </Space>
        </Space>

        <div ref={setTableContainerRef}>
          <Table<ParameterSetDto>
            rowKey="id"
            loading={isLoading}
            dataSource={data?.data ?? []}
            columns={setColumns}
            onRow={(record) =>
              record.id === highlightedSetId
                ? { style: { backgroundColor: '#fffbe6' } }
                : {}
            }
            scroll={{ x: 1400 }}
            pagination={{
              current: data?.page ?? page,
              pageSize: data?.pageSize ?? pageSize,
              total: data?.total ?? 0,
              showSizeChanger: true,
              onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); },
            }}
          />
        </div>
      </Space>

      <Modal
        title="新建参数包"
        open={createVisible}
        onCancel={() => setCreateVisible(false)}
        onOk={handleCreateSet}
        confirmLoading={createSetMutation.isPending}
      >
        <Form<CreateParameterSetDto>
          layout="vertical"
          form={setForm}
          initialValues={{ templateSource: 'PRIVATE' }}
        >
          <Form.Item name="setCode" label="参数包编码" rules={[{ required: true }]}>
            <Input placeholder="如 BASELINE_SET" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
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

      <Drawer
        title="参数包详情"
        width={1100}
        open={Boolean(selectedSetId)}
        onClose={() => { setSelectedSetId(null); setSelectedItemIds([]); }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <span>{setDetail?.name || '-'}</span>
              <Tag color={setDetail?.isActive ? 'green' : 'red'}>
                {setDetail?.isActive ? 'ACTIVE' : 'INACTIVE'}
              </Tag>
              <Tag color={isPublished(setDetail?.version) ? 'green' : 'orange'}>
                {isPublished(setDetail?.version) ? '已发布' : '未发布'}
              </Tag>
              <Tag>版本 {setDetail?.version ?? '-'}</Tag>
            </Space>
            <Space>
              {selectedItemIds.length > 0 && (
                <Popconfirm
                  title={`确认批量重置 ${selectedItemIds.length} 个参数项到默认值?`}
                  onConfirm={handleBatchReset}
                >
                  <Button danger loading={batchResetMutation.isPending}>
                    批量重置 ({selectedItemIds.length})
                  </Button>
                </Popconfirm>
              )}
              <Button type="primary" onClick={() => setItemVisible(true)}>
                新建参数项
              </Button>
            </Space>
          </Space>

          <Tabs
            activeKey={detailTab}
            onChange={setDetailTab}
            items={[
              {
                key: 'items',
                label: '参数列表',
                children: (
                  <Table<ParameterItemDto>
                    rowKey="id"
                    loading={isDetailLoading}
                    dataSource={setDetail?.items ?? []}
                    columns={itemColumns}
                    pagination={false}
                    scroll={{ x: 1400 }}
                    rowSelection={{
                      selectedRowKeys: selectedItemIds,
                      onChange: (keys) => setSelectedItemIds(keys as string[]),
                      getCheckboxProps: (record) => ({
                        disabled: !(
                          record.defaultValue !== null &&
                          record.defaultValue !== undefined &&
                          record.value !== null &&
                          record.value !== undefined &&
                          JSON.stringify(record.value) !== JSON.stringify(record.defaultValue)
                        ),
                      }),
                    }}
                  />
                ),
              },
              {
                key: 'diff',
                label: `覆盖对比${overrideDiff ? ` (${overrideDiff.overriddenCount}/${overrideDiff.totalCount})` : ''}`,
                children: (
                  <Table<ParameterOverrideDiffItemDto>
                    rowKey="paramCode"
                    loading={isDiffLoading}
                    dataSource={overrideDiff?.items ?? []}
                    columns={diffColumns}
                    pagination={false}
                    scroll={{ x: 1100 }}
                  />
                ),
              },
              {
                key: 'audit',
                label: '变更审计',
                children: (
                  <Table<ParameterChangeLogDto>
                    rowKey="id"
                    loading={isLogsLoading}
                    dataSource={changeLogs?.data ?? []}
                    columns={auditColumns}
                    scroll={{ x: 1100 }}
                    pagination={{
                      current: changeLogs?.page ?? logPage,
                      pageSize: 20,
                      total: changeLogs?.total ?? 0,
                      onChange: (nextPage) => setLogPage(nextPage),
                    }}
                  />
                ),
              },
            ]}
          />
        </Space>
      </Drawer>

      <Modal
        title="新建参数项"
        open={itemVisible}
        onCancel={() => setItemVisible(false)}
        onOk={handleCreateItem}
        confirmLoading={createItemMutation.isPending}
      >
        <Form<CreateParameterItemDto>
          layout="vertical"
          form={itemForm}
          initialValues={{ scopeLevel: 'GLOBAL', paramType: 'number' }}
        >
          <Form.Item name="paramCode" label="参数编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="paramName" label="参数名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="paramType" label="参数类型" rules={[{ required: true }]}>
            <Select options={paramTypeOptions.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="scopeLevel" label="作用域" rules={[{ required: true }]}>
            <Select options={scopeOptions.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="scopeValue" label="作用域值">
            <Input />
          </Form.Item>
          <Form.Item name="defaultValue" label="默认值(JSON或文本)">
            <Input.TextArea rows={2} placeholder="设置模板默认值" />
          </Form.Item>
          <Form.Item name="value" label="值(JSON或文本)">
            <Input.TextArea rows={2} placeholder={'例如 80 或 {"x":1}'} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  InputNumber,
  Switch,
  Divider,
} from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  RollbackOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type {
  CreateParameterItemDto,
  CreateParameterSetDto,
  ParameterChangeLogDto,
  ParameterImpactPreviewDto,
  ParameterItemDto,
  ParameterOverrideDiffItemDto,
  ParameterScopeLevel,
  ParameterSetDto,
  UpdateParameterItemDto,
  WorkflowTemplateSource,
} from '@packages/types';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import {
  useBatchResetParameterItems,
  useCreateParameterItem,
  useCreateParameterSet,
  useDeleteParameterSet,
  useParameterChangeLogs,
  useParameterImpactPreview,
  useParameterOverrideDiff,
  useParameterSetDetail,
  useParameterSets,
  usePublishParameterSet,
  useResetParameterItemToDefault,
  useUpdateParameterItem,
} from '../api';
import { ParameterDiffView, ParameterInheritanceStatus, ParameterResolutionPreview } from './index';

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

const templateSourceLabelMap: Record<WorkflowTemplateSource, string> = {
  PUBLIC: '公共',
  PRIVATE: '私有',
  COPIED: '复制',
};

const getTemplateSourceLabel = (value?: WorkflowTemplateSource | null): string => {
  if (!value) return '-';
  return templateSourceLabelMap[value] ?? value;
};

const scopeLabelMap: Record<ParameterScopeLevel, string> = {
  PUBLIC_TEMPLATE: '公共模板',
  USER_TEMPLATE: '用户模板',
  GLOBAL: '全局',
  COMMODITY: '品种',
  REGION: '区域',
  ROUTE: '航线',
  STRATEGY: '策略',
  SESSION: '会话',
};

const getScopeLabel = (value?: ParameterScopeLevel | string): string => {
  if (!value) return '-';
  return scopeLabelMap[value as ParameterScopeLevel] ?? value;
};

const getActiveStatusLabel = (value?: boolean): string => (value ? '启用' : '停用');

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

const parseMaybeJsonText = (value?: string): unknown => {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
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
  const [compareVisible, setCompareVisible] = useState(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [publishingSetId, setPublishingSetId] = useState<string | null>(null);
  const [itemVisible, setItemVisible] = useState(false);
  const [editItemVisible, setEditItemVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ParameterItemDto | null>(null);
  const [detailTab, setDetailTab] = useState('items');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [scopeResetLevel, setScopeResetLevel] = useState<ParameterScopeLevel | undefined>(undefined);
  const [scopeResetValue, setScopeResetValue] = useState('');
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));
  const [logPage, setLogPage] = useState(1);
  const [editItemForm] = Form.useForm<{
    paramName?: string;
    paramType?: string;
    scopeLevel?: ParameterScopeLevel;
    scopeValue?: string;
    value?: any;
    defaultValue?: any;
    minValueText?: string;
    maxValueText?: string;
    unit?: string;
    source?: string;
    changeReason?: string;
    isActive?: boolean;
  }>();
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
  const { data: impactPreview, isLoading: isImpactLoading } = useParameterImpactPreview(
    detailTab === 'impact' ? selectedSetId || undefined : undefined,
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
  const updateItemMutation = useUpdateParameterItem();

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

  const handleScopeBatchReset = async () => {
    if (!selectedSetId || !scopeResetLevel) {
      message.warning('请选择作用域后再执行批量重置');
      return;
    }
    try {
      const result = await batchResetMutation.mutateAsync({
        setId: selectedSetId,
        dto: {
          scopeLevel: scopeResetLevel,
          scopeValue: scopeResetValue.trim() || undefined,
          reason: '按作用域批量重置',
        },
      });
      message.success(`按作用域重置完成，影响 ${result.resetCount} 个参数项`);
      setScopeResetLevel(undefined);
      setScopeResetValue('');
      setSelectedItemIds([]);
    } catch (error) {
      message.error(getErrorMessage(error) || '按作用域批量重置失败');
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
          <Tag color={value === 'PUBLIC' ? 'blue' : 'default'}>
            {getTemplateSourceLabel(value as WorkflowTemplateSource)}
          </Tag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{getActiveStatusLabel(value)}</Tag>
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
          <Tag color={scopeColorMap[value] || 'default'}>{getScopeLabel(value)}</Tag>
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
        width: 120,
        render: (_, record) => {
          const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
          return (
            <ParameterInheritanceStatus
              defaultValue={record.defaultValue}
              currentValue={record.value}
              hasDefault={hasDefault}
            />
          );
        },
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 80,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{getActiveStatusLabel(value)}</Tag>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_, record) => {
          const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
          const isOverridden = hasDefault && record.value !== null && record.value !== undefined &&
            JSON.stringify(record.value) !== JSON.stringify(record.defaultValue);
          return (
            <Space size={4}>
              <Button type="link" size="small" onClick={() => openEditItem(record)}>
                编辑
              </Button>
              <Popconfirm
                title="确认重置到默认值?"
                onConfirm={() => handleResetItem(record.id)}
                disabled={!isOverridden}
              >
                <Button type="link" size="small" disabled={!isOverridden}>
                  重置
                </Button>
              </Popconfirm>
            </Space>
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
        render: (value: string) => <Tag color={scopeColorMap[value] || 'default'}>{getScopeLabel(value)}</Tag>,
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

  const overrideSummary = useMemo(() => {
    const items = setDetail?.items ?? [];
    const total = items.length;
    let inherited = 0;
    let overridden = 0;
    let noTemplate = 0;
    for (const item of items) {
      const hasDefault = item.defaultValue !== null && item.defaultValue !== undefined;
      if (!hasDefault) {
        noTemplate++;
        continue;
      }
      const hasValue = item.value !== null && item.value !== undefined;
      if (!hasValue || JSON.stringify(item.value) === JSON.stringify(item.defaultValue)) {
        inherited++;
      } else {
        overridden++;
      }
    }
    const overrideRate = total > 0 ? Math.round((overridden / total) * 100) : 0;
    return { total, inherited, overridden, noTemplate, overrideRate };
  }, [setDetail?.items]);

  const [auditViewMode, setAuditViewMode] = useState<'table' | 'timeline'>('table');

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
      const payload: CreateParameterItemDto = {
        ...values,
        value: parseMaybeJsonText(values.value as unknown as string | undefined),
        defaultValue: parseMaybeJsonText(values.defaultValue as unknown as string | undefined),
      };
      await createItemMutation.mutateAsync({ setId: selectedSetId, payload });
      message.success('参数项创建成功');
      setItemVisible(false);
      itemForm.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '参数项创建失败');
    }
  };

  const openEditItem = (record: ParameterItemDto) => {
    setEditingItem(record);
    const isJsonOrText = record.paramType === 'json' || record.paramType === 'expression';

    editItemForm.setFieldsValue({
      paramName: record.paramName,
      paramType: record.paramType,
      scopeLevel: record.scopeLevel,
      scopeValue: record.scopeValue || undefined,
      value: isJsonOrText
        ? (record.value === null || record.value === undefined ? '' : JSON.stringify(record.value, null, 2))
        : record.value,
      defaultValue: isJsonOrText
        ? (record.defaultValue === null || record.defaultValue === undefined ? '' : JSON.stringify(record.defaultValue, null, 2))
        : record.defaultValue,
      minValueText:
        record.minValue === null || record.minValue === undefined
          ? ''
          : JSON.stringify(record.minValue, null, 2),
      maxValueText:
        record.maxValue === null || record.maxValue === undefined
          ? ''
          : JSON.stringify(record.maxValue, null, 2),
      unit: record.unit || undefined,
      source: record.source || undefined,
      isActive: record.isActive,
    });
    setEditItemVisible(true);
  };

  const handleUpdateItem = async () => {
    if (!selectedSetId || !editingItem) return;
    try {
      const values = await editItemForm.validateFields();
      const isJsonOrText = values.paramType === 'json' || values.paramType === 'expression';

      const payload: UpdateParameterItemDto = {
        paramName: values.paramName,
        paramType: values.paramType as UpdateParameterItemDto['paramType'],
        scopeLevel: values.scopeLevel,
        scopeValue: values.scopeValue,
        value: isJsonOrText ? parseMaybeJsonText(values.value) : values.value,
        defaultValue: isJsonOrText ? parseMaybeJsonText(values.defaultValue) : values.defaultValue,
        minValue: parseMaybeJsonText(values.minValueText),
        maxValue: parseMaybeJsonText(values.maxValueText),
        unit: values.unit,
        source: values.source,
        changeReason: values.changeReason || '更新参数项',
        isActive: values.isActive,
      };
      await updateItemMutation.mutateAsync({
        setId: selectedSetId,
        itemId: editingItem.id,
        payload,
      });
      message.success('参数项更新成功');
      setEditItemVisible(false);
      setEditingItem(null);
      editItemForm.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '参数项更新失败');
    }
  };

  const renderDynamicInput = (type?: string, placeholder?: string) => {
    if (type === 'boolean') {
      return <Switch checkedChildren="True" unCheckedChildren="False" />;
    }
    if (type === 'number') {
      return <InputNumber style={{ width: '100%' }} placeholder={placeholder} />;
    }
    if (type === 'json' || type === 'expression') {
      return <Input.TextArea rows={3} placeholder={placeholder} />;
    }
    return <Input placeholder={placeholder} />;
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
                { label: getActiveStatusLabel(true), value: true },
                { label: getActiveStatusLabel(false), value: false },
              ]}
              value={isActiveFilter}
              onChange={(value) => { setIsActiveFilter(value); setPage(1); }}
            />
            <Button onClick={() => setCompareVisible(true)}>
              版本对比
            </Button>
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
                { label: getTemplateSourceLabel('PRIVATE'), value: 'PRIVATE' },
                { label: getTemplateSourceLabel('PUBLIC'), value: 'PUBLIC' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="参数包详情"
        width="85%"
        open={Boolean(selectedSetId)}
        onClose={() => { setSelectedSetId(null); setSelectedItemIds([]); }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <Typography.Title level={4} style={{ margin: 0 }}>{setDetail?.name || '-'}</Typography.Title>
              <Tag color={setDetail?.isActive ? 'green' : 'red'}>
                {getActiveStatusLabel(setDetail?.isActive)}
              </Tag>
              <Tag color={isPublished(setDetail?.version) ? 'green' : 'orange'}>
                {isPublished(setDetail?.version) ? '已发布' : '未发布'}
              </Tag>
              <Tag>版本 {setDetail?.version ?? '-'}</Tag>
              {setDetail?.templateSource === 'PUBLIC' && (
                <Tooltip title="继承自公共模板">
                  <Tag color="blue" icon={<CheckCircleOutlined />}>公共模板</Tag>
                </Tooltip>
              )}
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

          <Space wrap>
            <Select<ParameterScopeLevel>
              allowClear
              style={{ width: 220 }}
              placeholder="按作用域批量重置"
              value={scopeResetLevel}
              options={scopeOptions.map((item) => ({ label: getScopeLabel(item), value: item }))}
              onChange={(value) => setScopeResetLevel(value)}
            />
            <Input
              style={{ width: 220 }}
              placeholder="作用域值(可选)"
              value={scopeResetValue}
              onChange={(event) => setScopeResetValue(event.target.value)}
            />
            <Popconfirm
              title="确认按当前作用域批量重置到默认值?"
              onConfirm={handleScopeBatchReset}
              disabled={!scopeResetLevel}
            >
              <Button disabled={!scopeResetLevel} loading={batchResetMutation.isPending}>
                按作用域批量重置
              </Button>
            </Popconfirm>
          </Space>

          {/* Override Impact Summary */}
          {setDetail && (
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic title="参数总数" value={overrideSummary.total} />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="继承模板"
                    value={overrideSummary.inherited}
                    valueStyle={{ color: '#52c41a' }}
                    prefix={<CheckCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="已覆盖"
                    value={overrideSummary.overridden}
                    valueStyle={{ color: '#fa8c16' }}
                    prefix={<WarningOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Tooltip title="已覆盖参数项占比">
                    <Statistic
                      title="覆盖率"
                      value={overrideSummary.overrideRate}
                      suffix="%"
                      valueStyle={{ color: overrideSummary.overrideRate > 50 ? '#fa8c16' : '#52c41a' }}
                    />
                  </Tooltip>
                </Card>
              </Col>
            </Row>
          )}

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
                key: 'impact',
                label: '影响预览',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <Row gutter={[16, 16]}>
                      <Col xs={12} sm={6}>
                        <Card size="small">
                          <Statistic
                            title="受影响流程"
                            value={impactPreview?.workflowCount ?? 0}
                            loading={isImpactLoading}
                          />
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card size="small">
                          <Statistic
                            title="受影响 Agent"
                            value={impactPreview?.agentCount ?? 0}
                            loading={isImpactLoading}
                          />
                        </Card>
                      </Col>
                    </Row>

                    <Card size="small" title="流程影响列表">
                      <Table<ParameterImpactPreviewDto['workflows'][number]>
                        rowKey="workflowVersionId"
                        loading={isImpactLoading}
                        dataSource={impactPreview?.workflows ?? []}
                        pagination={{ pageSize: 8 }}
                        columns={[
                          { title: '流程编码', dataIndex: 'workflowCode', width: 180 },
                          { title: '流程名称', dataIndex: 'workflowName', width: 220 },
                          { title: '版本', dataIndex: 'versionCode', width: 120, render: (v) => <Tag>{v}</Tag> },
                        ]}
                      />
                    </Card>

                    <Card size="small" title="Agent 影响列表">
                      <Table<ParameterImpactPreviewDto['agents'][number]>
                        rowKey="id"
                        loading={isImpactLoading}
                        dataSource={impactPreview?.agents ?? []}
                        pagination={{ pageSize: 8 }}
                        columns={[
                          { title: 'Agent 编码', dataIndex: 'agentCode', width: 200 },
                          { title: '名称', dataIndex: 'agentName', width: 180 },
                          { title: '角色', dataIndex: 'roleType', width: 160, render: (v) => <Tag>{v}</Tag> },
                        ]}
                      />
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'simulator',
                label: '继承模拟',
                children: selectedSetId ? (
                  <ParameterResolutionPreview parameterSetId={selectedSetId} />
                ) : null,
              },
              {
                key: 'audit',
                label: '变更审计',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Flex justify="flex-end">
                      <Select
                        style={{ width: 120 }}
                        value={auditViewMode}
                        onChange={setAuditViewMode}
                        options={[
                          { label: '表格视图', value: 'table' },
                          { label: '时间线', value: 'timeline' },
                        ]}
                      />
                    </Flex>
                    {auditViewMode === 'table' ? (
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
                    ) : (
                      <>
                        <Timeline
                          items={(changeLogs?.data ?? []).map((log) => ({
                            key: log.id,
                            color: operationColorMap[log.operation] === 'green'
                              ? 'green'
                              : operationColorMap[log.operation] === 'red'
                                ? 'red'
                                : operationColorMap[log.operation] === 'purple'
                                  ? 'purple' as unknown as undefined
                                  : 'blue',
                            dot: log.operation === 'PUBLISH'
                              ? <CheckCircleOutlined />
                              : log.operation === 'DELETE'
                                ? <WarningOutlined />
                                : log.operation === 'RESET_TO_DEFAULT' || log.operation === 'BATCH_RESET'
                                  ? <RollbackOutlined />
                                  : <EditOutlined />,
                            children: (
                              <Card size="small" style={{ marginBottom: 4 }}>
                                <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                                  <Space size={4}>
                                    <Tag color={operationColorMap[log.operation] || 'default'}>
                                      {log.operation}
                                    </Tag>
                                    {log.fieldPath && (
                                      <Tag>{log.fieldPath}</Tag>
                                    )}
                                  </Space>
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {log.createdAt
                                      ? dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')
                                      : '-'}
                                  </Typography.Text>
                                </Flex>
                                {(log.oldValue !== null && log.oldValue !== undefined) && (
                                  <Flex gap={8} style={{ fontSize: 12 }}>
                                    <Typography.Text type="secondary">旧值:</Typography.Text>
                                    <Typography.Text delete>{formatValue(log.oldValue)}</Typography.Text>
                                    <Typography.Text type="secondary">→</Typography.Text>
                                    <Typography.Text strong>{formatValue(log.newValue)}</Typography.Text>
                                  </Flex>
                                )}
                                {log.changeReason && (
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    原因: {log.changeReason}
                                  </Typography.Text>
                                )}
                                {log.changedByUserId && (
                                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                    操作人: {log.changedByUserId}
                                  </Typography.Text>
                                )}
                              </Card>
                            ),
                          }))}
                        />
                        <Flex justify="center">
                          <Button
                            type="link"
                            disabled={logPage <= 1}
                            onClick={() => setLogPage((prev) => Math.max(prev - 1, 1))}
                          >
                            上一页
                          </Button>
                          <Typography.Text type="secondary" style={{ lineHeight: '32px' }}>
                            {changeLogs?.page ?? logPage} / {Math.ceil((changeLogs?.total ?? 0) / 20) || 1}
                          </Typography.Text>
                          <Button
                            type="link"
                            disabled={(changeLogs?.page ?? logPage) >= Math.ceil((changeLogs?.total ?? 0) / 20)}
                            onClick={() => setLogPage((prev) => prev + 1)}
                          >
                            下一页
                          </Button>
                        </Flex>
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Space>
      </Drawer>

      <Modal
        title="参数版本/集合对比"
        open={compareVisible}
        onCancel={() => setCompareVisible(false)}
        width={1100}
        footer={null}
        destroyOnClose
      >
        <ParameterDiffView
          initialLeftId={selectedSetId || undefined}
          parameterSets={data?.data || []}
        />
      </Modal>

      <Modal
        title={`编辑参数项${editingItem ? ` - ${editingItem.paramCode}` : ''}`}
        open={editItemVisible}
        onCancel={() => {
          setEditItemVisible(false);
          setEditingItem(null);
        }}
        onOk={handleUpdateItem}
        confirmLoading={updateItemMutation.isPending}
        width={720}
      >
        <Form layout="vertical" form={editItemForm}>
          <Typography.Title level={5}>基本信息</Typography.Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="paramName" label="参数名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paramType" label="参数类型" rules={[{ required: true }]}>
                <Select options={paramTypeOptions.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="单位">
                <Input allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="source" label="来源">
                <Input allowClear placeholder="例如: 业务规则V1, 外部API" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>作用域</Typography.Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="scopeLevel" label="作用域层级" rules={[{ required: true }]}>
                <Select options={scopeOptions.map((item) => ({ label: getScopeLabel(item), value: item }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="scopeValue" label="作用域值">
                <Input placeholder="例如: USER_XYZ, REGION_CN" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>数值设定</Typography.Title>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.paramType !== curr.paramType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('paramType');
              return (
                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item name="value" label="当前值" valuePropName={type === 'boolean' ? 'checked' : 'value'}>
                      {renderDynamicInput(type, '覆盖后的实际生效值')}
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name="defaultValue" label="默认值" valuePropName={type === 'boolean' ? 'checked' : 'value'}>
                      {renderDynamicInput(type, '若未被覆盖，将继承此默认值')}
                    </Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>约束条件</Typography.Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="minValueText" label="最小值 (JSON/Text)">
                <Input placeholder="例如: 0, 1.5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxValueText" label="最大值 (JSON/Text)">
                <Input placeholder="例如: 100, 99.9" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>变更审计</Typography.Title>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="changeReason" label="变更原因">
                <Input.TextArea rows={1} placeholder="请简述本次修改的原因" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isActive" label="启用状态">
                <Select
                  options={[
                    { label: getActiveStatusLabel(true), value: true },
                    { label: getActiveStatusLabel(false), value: false },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

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
            <Select options={scopeOptions.map((item) => ({ label: getScopeLabel(item), value: item }))} />
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

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
  Tag,
  Typography,
} from 'antd';
import {
  CreateParameterItemDto,
  CreateParameterSetDto,
  ParameterItemDto,
  ParameterScopeLevel,
  ParameterSetDto,
} from '@packages/types';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import {
  useCreateParameterItem,
  useCreateParameterSet,
  useDeleteParameterSet,
  useParameterSetDetail,
  useParameterSets,
  usePublishParameterSet,
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

const isPublished = (version?: number): boolean =>
  Number.isInteger(version) && Number(version) >= 2;

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
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));
  const setTableContainerRef = React.useRef<HTMLDivElement | null>(null);

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

  const normalizedKeyword = keyword?.trim().toLowerCase() || '';
  const highlightedSetId = useMemo(() => {
    if (!normalizedKeyword) {
      return null;
    }
    const rows = data?.data || [];
    const exactMatch = rows.find((item) => item.setCode.trim().toLowerCase() === normalizedKeyword);
    if (exactMatch) {
      return exactMatch.id;
    }
    const fuzzyMatch = rows.find((item) => {
      const code = item.setCode.trim().toLowerCase();
      const name = item.name.trim().toLowerCase();
      return code.includes(normalizedKeyword) || name.includes(normalizedKeyword);
    });
    return fuzzyMatch?.id || null;
  }, [data?.data, normalizedKeyword]);

  React.useEffect(() => {
    if (!highlightedSetId || !setTableContainerRef.current) {
      return;
    }
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
            <Button type="link" onClick={() => setSelectedSetId(record.id)}>
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
      { title: '参数编码', dataIndex: 'paramCode', width: 220 },
      { title: '名称', dataIndex: 'paramName', width: 180 },
      { title: '类型', dataIndex: 'paramType', width: 100 },
      { title: '作用域', dataIndex: 'scopeLevel', width: 140 },
      { title: '作用域值', dataIndex: 'scopeValue', width: 120, render: (v?: string) => v || '-' },
      {
        title: '值',
        dataIndex: 'value',
        render: (value: unknown) => {
          if (value === null || value === undefined) {
            return '-';
          }
          if (typeof value === 'string') {
            return value;
          }
          return JSON.stringify(value);
        },
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{value ? 'ACTIVE' : 'INACTIVE'}</Tag>
        ),
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
    if (!selectedSetId) {
      return;
    }
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
      const payload: CreateParameterItemDto = {
        ...values,
        value: parsedValue,
      };
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
                ? {
                    style: {
                      backgroundColor: '#fffbe6',
                    },
                  }
                : {}
            }
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
        width={980}
        open={Boolean(selectedSetId)}
        onClose={() => setSelectedSetId(null)}
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
            <Button type="primary" onClick={() => setItemVisible(true)}>
              新建参数项
            </Button>
          </Space>
          <Table<ParameterItemDto>
            rowKey="id"
            loading={isDetailLoading}
            dataSource={setDetail?.items ?? []}
            columns={itemColumns}
            pagination={false}
            scroll={{ x: 1200 }}
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
          initialValues={{
            scopeLevel: 'GLOBAL',
            paramType: 'number',
          }}
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
          <Form.Item name="value" label="值(JSON或文本)">
            <Input.TextArea rows={2} placeholder={'例如 80 或 {"x":1}'} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

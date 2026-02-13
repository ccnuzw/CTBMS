import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { DecisionRecordDto } from '@packages/types';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import {
  useDecisionRecords,
  useDecisionRecordDetail,
  usePublishDecisionRecord,
  useDeleteDecisionRecord,
  useReviewDecisionRecord,
} from '../api';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const actionOptions = ['BUY', 'SELL', 'HOLD', 'REDUCE', 'REVIEW_ONLY'];

const actionColorMap: Record<string, string> = {
  BUY: 'green',
  SELL: 'red',
  HOLD: 'blue',
  REDUCE: 'orange',
  REVIEW_ONLY: 'default',
};

const riskColorMap: Record<string, string> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
  EXTREME: 'magenta',
};

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const DecisionRecordPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keywordInput, setKeywordInput] = useState(searchParams.get('keyword')?.trim() || '');
  const [keyword, setKeyword] = useState<string | undefined>(
    searchParams.get('keyword')?.trim() || undefined,
  );
  const [actionFilter, setActionFilter] = useState<string | undefined>(
    searchParams.get('action') || undefined,
  );
  const [publishedFilter, setPublishedFilter] = useState<boolean | undefined>(
    searchParams.get('isPublished') === 'true'
      ? true
      : searchParams.get('isPublished') === 'false'
        ? false
        : undefined,
  );
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (keyword) next.set('keyword', keyword);
    if (actionFilter) next.set('action', actionFilter);
    if (publishedFilter !== undefined) next.set('isPublished', String(publishedFilter));
    next.set('page', String(page));
    next.set('pageSize', String(pageSize));
    setSearchParams(next, { replace: true });
  }, [actionFilter, keyword, page, pageSize, publishedFilter, setSearchParams]);

  const { data, isLoading } = useDecisionRecords({
    keyword,
    action: actionFilter,
    isPublished: publishedFilter,
    createdAtFrom: dateRange?.[0]?.toISOString(),
    createdAtTo: dateRange?.[1]?.toISOString(),
    page,
    pageSize,
  });

  const { data: detail, isLoading: isDetailLoading } = useDecisionRecordDetail(
    selectedId || undefined,
  );

  const publishMutation = usePublishDecisionRecord();
  const deleteMutation = useDeleteDecisionRecord();
  const reviewMutation = useReviewDecisionRecord();

  const handlePublish = async (record: DecisionRecordDto) => {
    if (record.isPublished) {
      message.info('该决策记录已发布');
      return;
    }
    try {
      await publishMutation.mutateAsync(record.id);
      message.success('发布成功');
    } catch (error) {
      message.error(getErrorMessage(error) || '发布失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      message.success('删除成功');
      if (selectedId === id) setSelectedId(null);
    } catch (error) {
      message.error(getErrorMessage(error) || '删除失败');
    }
  };

  const handleReview = (record: DecisionRecordDto) => {
    let comment = '';
    modal.confirm({
      title: '审核决策记录',
      content: (
        <Input.TextArea
          rows={3}
          placeholder="请输入审核意见"
          onChange={(e) => {
            comment = e.target.value;
          }}
        />
      ),
      onOk: async () => {
        if (!comment.trim()) {
          message.warning('审核意见不能为空');
          return;
        }
        try {
          await reviewMutation.mutateAsync({ id: record.id, comment });
          message.success('审核完成');
        } catch (error) {
          message.error(getErrorMessage(error) || '审核失败');
        }
      },
    });
  };

  const columns = useMemo<ColumnsType<DecisionRecordDto>>(
    () => [
      {
        title: '决策行为',
        dataIndex: 'action',
        width: 120,
        render: (value: string) => (
          <Tag color={actionColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      {
        title: '置信度',
        dataIndex: 'confidence',
        width: 100,
        render: (value?: number) => (value !== null && value !== undefined ? `${value}%` : '-'),
      },
      {
        title: '风险等级',
        dataIndex: 'riskLevel',
        width: 100,
        render: (value?: string) =>
          value ? <Tag color={riskColorMap[value] || 'default'}>{value}</Tag> : '-',
      },
      {
        title: '目标窗口',
        dataIndex: 'targetWindow',
        width: 120,
        render: (value?: string) => value || '-',
      },
      {
        title: '推理摘要',
        dataIndex: 'reasoningSummary',
        ellipsis: true,
        render: (value?: string) => value || '-',
      },
      {
        title: '发布状态',
        dataIndex: 'isPublished',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'orange'}>{value ? '已发布' : '未发布'}</Tag>
        ),
      },
      {
        title: '审核人',
        dataIndex: 'reviewedByUserId',
        width: 120,
        render: (value?: string) => value || '-',
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
            <Popconfirm
              title="确认发布该决策记录?"
              onConfirm={() => handlePublish(record)}
              disabled={record.isPublished}
            >
              <Button type="link" disabled={record.isPublished}>
                {record.isPublished ? '已发布' : '发布'}
              </Button>
            </Popconfirm>
            <Button type="link" onClick={() => handleReview(record)}>
              审核
            </Button>
            <Popconfirm title="确认删除该记录?" onConfirm={() => handleDelete(record.id)}>
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteMutation, message, publishMutation],
  );

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            决策记录管理
          </Title>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder="按摘要搜索"
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
              style={{ width: 130 }}
              placeholder="决策行为"
              options={actionOptions.map((item) => ({ label: item, value: item }))}
              value={actionFilter}
              onChange={(value) => {
                setActionFilter(value);
                setPage(1);
              }}
            />
            <Select
              allowClear
              style={{ width: 130 }}
              placeholder="发布状态"
              options={[
                { label: '已发布', value: true },
                { label: '未发布', value: false },
              ]}
              value={publishedFilter}
              onChange={(value) => {
                setPublishedFilter(value);
                setPage(1);
              }}
            />
            <RangePicker
              onChange={(dates) => {
                setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
                setPage(1);
              }}
            />
          </Space>
        </Space>

        <Table<DecisionRecordDto>
          rowKey="id"
          loading={isLoading}
          dataSource={data?.data ?? []}
          columns={columns}
          scroll={{ x: 1500 }}
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

      <Drawer
        title="决策记录详情"
        width={720}
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
      >
        {isDetailLoading ? (
          <Card loading />
        ) : detail ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="决策行为">
                <Tag color={actionColorMap[detail.action] || 'default'}>{detail.action}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="置信度">
                {detail.confidence !== null && detail.confidence !== undefined
                  ? `${detail.confidence}%`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="风险等级">
                {detail.riskLevel ? (
                  <Tag color={riskColorMap[detail.riskLevel] || 'default'}>
                    {detail.riskLevel}
                  </Tag>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="目标窗口">
                {detail.targetWindow || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="发布状态" span={2}>
                <Tag color={detail.isPublished ? 'green' : 'orange'}>
                  {detail.isPublished ? '已发布' : '未发布'}
                </Tag>
                {detail.publishedAt && (
                  <span style={{ marginLeft: 8 }}>
                    {dayjs(detail.publishedAt).format('YYYY-MM-DD HH:mm:ss')}
                  </span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="审核人">
                {detail.reviewedByUserId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="审核意见">
                {detail.reviewComment || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="追踪 ID" span={2}>
                {detail.traceId || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="关联执行" span={2}>
                {detail.workflowExecutionId}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {detail.createdAt ? dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {detail.updatedAt ? dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Card title="推理摘要" size="small">
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {detail.reasoningSummary || '无'}
              </Typography.Paragraph>
            </Card>

            {detail.evidenceSummary && (
              <Card title="证据摘要" size="small">
                <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detail.evidenceSummary, null, 2)}
                </pre>
              </Card>
            )}

            {detail.paramSnapshot && (
              <Card title="参数快照" size="small">
                <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detail.paramSnapshot, null, 2)}
                </pre>
              </Card>
            )}

            {detail.outputSnapshot && (
              <Card title="输出快照" size="small">
                <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detail.outputSnapshot, null, 2)}
                </pre>
              </Card>
            )}
          </Space>
        ) : null}
      </Drawer>
    </Card>
  );
};

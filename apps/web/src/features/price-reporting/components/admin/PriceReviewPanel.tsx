import React, { useState } from 'react';
import { Card, Table, Button, Space, Tag, App, Row, Col, Statistic } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import {
  usePendingReviews,
  useReviewSubmission,
  useSubmissionStatistics,
} from '../../api/hooks';
import { useDictionary } from '@/hooks/useDictionaries';
import { usePriceSubTypeLabels } from '@/utils/priceSubType';

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  DRAFT: { text: '草稿', color: 'default' },
  SUBMITTED: { text: '待审核', color: 'processing' },
  PARTIAL_APPROVED: { text: '部分通过', color: 'warning' },
  APPROVED: { text: '已通过', color: 'success' },
  REJECTED: { text: '已拒绝', color: 'error' },
};

export const PriceReviewPanel: React.FC = () => {
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState({ page: 1, pageSize: 20 });

  const { data: pendingReviews, isLoading } = usePendingReviews(query);
  const { data: stats } = useSubmissionStatistics();
  const reviewSubmission = useReviewSubmission();
  const { data: priceSubTypeDict } = useDictionary('PRICE_SUB_TYPE');

  // 统一的价格类型标签映射（字典优先，兜底中文）
  const priceSubTypeLabels = usePriceSubTypeLabels(priceSubTypeDict);

  const handleApprove = (submissionId: string) => {
    modal.confirm({
      title: '确认通过？',
      content: '将批准该批次的所有价格数据',
      onOk: async () => {
        try {
          await reviewSubmission.mutateAsync({
            submissionId,
            dto: { action: 'approve_all' },
          });
          message.success('审核通过');
        } catch (err) {
          message.error('操作失败');
        }
      },
    });
  };

  const handleReject = (submissionId: string) => {
    modal.confirm({
      title: '确认拒绝？',
      content: '将拒绝该批次的所有价格数据',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await reviewSubmission.mutateAsync({
            submissionId,
            dto: { action: 'reject_all', note: '审核未通过' },
          });
          message.success('已拒绝');
        } catch (err) {
          message.error('操作失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '批次编号',
      dataIndex: 'batchCode',
      key: 'batchCode',
    },
    {
      title: '采集点',
      dataIndex: ['collectionPoint', 'name'],
      key: 'pointName',
    },
    {
      title: '填报人',
      dataIndex: ['submittedBy', 'name'],
      key: 'submitter',
    },
    {
      title: '生效日期',
      dataIndex: 'effectiveDate',
      key: 'effectiveDate',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN'),
    },
    {
      title: '提交时间',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '条目数',
      dataIndex: 'itemCount',
      key: 'itemCount',
      render: (count: number) => `${count} 条`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={STATUS_MAP[status]?.color}>{STATUS_MAP[status]?.text || status}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleApprove(record.id)}
            loading={reviewSubmission.isPending}
          >
            通过
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => handleReject(record.id)}
            loading={reviewSubmission.isPending}
          >
            拒绝
          </Button>
        </Space>
      ),
    },
  ];

  const expandedRowRender = (record: any) => {
    const priceColumns = [
      { title: '品种', dataIndex: 'commodity', key: 'commodity' },
      {
        title: '价格类型',
        dataIndex: 'subType',
        key: 'subType',
        render: (subType: string) => (
          <Tag color="blue">{priceSubTypeLabels[subType] || subType}</Tag>
        ),
      },
      {
        title: '价格',
        dataIndex: 'price',
        key: 'price',
        render: (price: number) => `${Number(price).toLocaleString()} 元/吨`,
      },
      { title: '水分', dataIndex: 'moisture', key: 'moisture', render: (v: number) => v ? `${v}%` : '-' },
      { title: '容重', dataIndex: 'bulkDensity', key: 'bulkDensity', render: (v: number) => v ? `${v} g/L` : '-' },
      { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true },
    ];

    return (
      <Table
        columns={priceColumns}
        dataSource={record.priceData || []}
        rowKey="id"
        pagination={false}
        size="small"
      />
    );
  };

  return (
    <div style={{ padding: 24 }}>
      {/* 统计 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="待审核" value={stats?.pendingReview || 0} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="今日完成" value={stats?.todayCompleted || 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="本周完成" value={stats?.weekCompleted || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="已拒绝" value={stats?.rejectedCount || 0} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
      </Row>

      <Card title="价格审核">
        <Table
          columns={columns}
          dataSource={pendingReviews?.data || []}
          rowKey="id"
          loading={isLoading}
          expandable={{ expandedRowRender }}
          pagination={{
            current: query.page,
            pageSize: query.pageSize,
            total: pendingReviews?.total || 0,
            onChange: (page, pageSize) => setQuery({ page, pageSize }),
          }}
        />
      </Card>
    </div>
  );
};

export default PriceReviewPanel;

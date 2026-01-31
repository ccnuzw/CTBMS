import React, { useState } from 'react';
import { Card, Form, InputNumber, Input, Select, Button, Space, Row, Col, message, Divider, Typography, Spin, Alert } from 'antd';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftOutlined, CopyOutlined, SendOutlined } from '@ant-design/icons';
import {
  useCreateSubmission,
  useSubmission,
  useAddPriceEntry,
  useSubmitSubmission,
  useCopyYesterdayData,
  usePointPriceHistory,
} from '../../api/hooks';
import { useCollectionPoints } from '../../../market-intel/api/collection-point';

const { Title, Text } = Typography;
const { TextArea } = Input;

const PRICE_SUB_TYPES = [
  { value: 'LISTED', label: '挂牌价' },
  { value: 'TRANSACTION', label: '成交价' },
  { value: 'ARRIVAL', label: '到港价' },
  { value: 'FOB', label: '平舱价' },
  { value: 'PURCHASE', label: '收购价' },
  { value: 'WHOLESALE', label: '批发价' },
];

const COMMODITIES = [
  { value: '玉米', label: '玉米' },
  { value: '大豆', label: '大豆' },
  { value: '小麦', label: '小麦' },
  { value: '水稻', label: '水稻' },
];

export const PriceEntryForm: React.FC = () => {
  const { pointId } = useParams<{ pointId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId') || undefined;
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const { data: pointsData } = useCollectionPoints({ page: 1, pageSize: 100, isActive: true });
  const currentPoint = pointsData?.data?.find((p: any) => p.id === pointId);

  const createSubmission = useCreateSubmission();
  const addEntry = useAddPriceEntry();
  const submitSubmission = useSubmitSubmission();
  const copyYesterday = useCopyYesterdayData();
  const { data: priceHistory } = usePointPriceHistory(pointId || '', 7);

  const { data: submission, isLoading: loadingSubmission } = useSubmission(submissionId || '');

  // 初始化或获取现有批次
  React.useEffect(() => {
    if (pointId && !submissionId) {
      createSubmission.mutateAsync({
        collectionPointId: pointId,
        effectiveDate: new Date(),
        taskId,
      }).then((result) => {
        setSubmissionId(result.id);
      }).catch(() => {
        message.error('创建填报批次失败');
      });
    }
  }, [pointId]);

  const handleCopyYesterday = async () => {
    if (!submissionId) return;
    try {
      await copyYesterday.mutateAsync(submissionId);
      message.success('已复制昨日数据');
    } catch (err: any) {
      message.error(err.response?.data?.message || '复制失败');
    }
  };

  const handleAddEntry = async (values: any) => {
    if (!submissionId) return;
    try {
      await addEntry.mutateAsync({
        submissionId,
        dto: {
          commodity: values.commodity,
          price: values.price,
          subType: values.subType || 'LISTED',
          sourceType: 'ENTERPRISE',
          geoLevel: 'ENTERPRISE',
          grade: values.grade,
          moisture: values.moisture,
          bulkDensity: values.bulkDensity,
          inventory: values.inventory,
          note: values.note,
        },
      });
      message.success('添加成功');
      form.resetFields(['price', 'moisture', 'bulkDensity', 'inventory', 'note']);
    } catch (err: any) {
      message.error(err.response?.data?.message || '添加失败');
    }
  };

  const handleSubmit = async () => {
    if (!submissionId) return;
    if (!submission?.priceData?.length) {
      message.warning('请至少添加一条价格数据');
      return;
    }
    try {
      await submitSubmission.mutateAsync(submissionId);
      message.success('提交成功');
      navigate('/price-reporting');
    } catch (err: any) {
      message.error(err.response?.data?.message || '提交失败');
    }
  };

  if (!pointId) {
    return <Alert type="error" message="采集点ID不存在" />;
  }

  const priceDataList = submission?.priceData || [];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          价格填报 - {currentPoint?.name || '加载中...'}
        </Title>
      </Space>

      <Row gutter={24}>
        <Col xs={24} lg={16}>
          <Card
            title="填报价格"
            extra={
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopyYesterday}
                loading={copyYesterday.isPending}
              >
                复制昨日
              </Button>
            }
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleAddEntry}
              initialValues={{
                commodity: '玉米',
                subType: 'LISTED',
                grade: '二等',
              }}
            >
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item name="commodity" label="品种" rules={[{ required: true }]}>
                    <Select options={COMMODITIES} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="subType" label="价格类型" rules={[{ required: true }]}>
                    <Select options={PRICE_SUB_TYPES} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="grade" label="等级">
                    <Select
                      options={[
                        { value: '一等', label: '一等' },
                        { value: '二等', label: '二等' },
                        { value: '三等', label: '三等' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item name="price" label="价格 (元/吨)" rules={[{ required: true }]}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="moisture" label="水分 %">
                    <InputNumber style={{ width: '100%' }} min={0} max={100} precision={1} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="bulkDensity" label="容重 g/L">
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="inventory" label="库存 (吨)">
                    <InputNumber style={{ width: '100%' }} min={0} precision={0} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="note" label="备注">
                <TextArea rows={2} placeholder="填写备注信息..." />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={addEntry.isPending}>
                  添加价格
                </Button>
              </Form.Item>
            </Form>
          </Card>

          {/* 已添加的价格列表 */}
          <Card title={`已添加 (${priceDataList.length} 条)`} style={{ marginTop: 16 }}>
            {loadingSubmission ? (
              <Spin />
            ) : !priceDataList.length ? (
              <Text type="secondary">暂无数据，请添加价格</Text>
            ) : (
              <div>
                {priceDataList.map((item: any, index: number) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: index < priceDataList.length - 1 ? '1px solid #f0f0f0' : 'none',
                    }}
                  >
                    <Space>
                      <Text strong>{item.commodity}</Text>
                      <Text type="secondary">{item.subType}</Text>
                      <Text style={{ color: '#1890ff', fontWeight: 'bold' }}>
                        {Number(item.price).toLocaleString()} 元/吨
                      </Text>
                      {item.moisture && <Text type="secondary">水分 {item.moisture}%</Text>}
                      {item.note && <Text type="secondary">({item.note})</Text>}
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Divider />

          <Space>
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              onClick={handleSubmit}
              loading={submitSubmission.isPending}
              disabled={!priceDataList.length}
            >
              提交审核
            </Button>
            <Button size="large" onClick={() => navigate('/price-reporting')}>
              保存草稿
            </Button>
          </Space>
        </Col>

        {/* 右侧：历史价格 */}
        <Col xs={24} lg={8}>
          <Card title="历史价格 (近7日)" size="small">
            {priceHistory?.length ? (
              <div>
                {priceHistory.map((item: any, index: number) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <Text type="secondary">
                      {new Date(item.effectiveDate).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                    </Text>
                    <Text strong>{Number(item.price).toLocaleString()}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary">暂无历史数据</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default PriceEntryForm;

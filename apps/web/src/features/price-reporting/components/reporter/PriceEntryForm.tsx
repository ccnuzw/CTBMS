import React, { useState } from 'react';
import { Card, Form, InputNumber, Input, Select, Button, Space, Row, Col, Divider, Typography, Spin, Alert, App } from 'antd';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftOutlined, CopyOutlined, SendOutlined, WarningOutlined } from '@ant-design/icons';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateSubmission,
  useSubmission,
  useAddPriceEntry,
  useSubmitSubmission,
  useCopyYesterdayData,
  usePointPriceHistory,
  useMyAssignedPoints,
} from '../../api/hooks';
import { useSubmitTask } from '../../../market-intel/api/tasks';
import { useCollectionPoints } from '../../../market-intel/api/collection-point';
import { getErrorMessage } from '../../../../api/client';
import { useVirtualUser } from '@/features/auth/virtual-user';
import { useDictionary } from '@/hooks/useDictionaries';

const { Title, Text } = Typography;
const { TextArea } = Input;

const PRICE_SUB_TYPE_FALLBACK = [
  { value: 'LISTED', label: '挂牌价' },
  { value: 'TRANSACTION', label: '成交价' },
  { value: 'ARRIVAL', label: '到港价' },
  { value: 'FOB', label: '平舱价' },
  { value: 'PURCHASE', label: '收购价' },
  { value: 'WHOLESALE', label: '批发价' },
];

// 默认品种列表（作为兜底）
const DEFAULT_COMMODITIES_FALLBACK = [
  { value: 'CORN', label: '玉米' },
  { value: 'SOYBEAN', label: '大豆' },
  { value: 'WHEAT', label: '小麦' },
  { value: 'RICE', label: '稻谷' },
  { value: 'SORGHUM', label: '高粱' },
  { value: 'BARLEY', label: '大麦' },
];

export const PriceEntryForm: React.FC = () => {
  const { pointId } = useParams<{ pointId: string }>();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId') || undefined;
  const urlCommodity = searchParams.get('commodity');
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const { currentUser } = useVirtualUser();

  const queryClient = useQueryClient();
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  const { data: priceSubTypeDict } = useDictionary('PRICE_SUB_TYPE');
  const { data: commodityDict } = useDictionary('COMMODITY');

  const priceSubTypeOptions = React.useMemo(() => {
    const items = (priceSubTypeDict || []).filter((item) => item.isActive);
    if (!items.length) return PRICE_SUB_TYPE_FALLBACK;
    return items.map((item) => ({ value: item.code, label: item.label }));
  }, [priceSubTypeDict]);

  const commodityOptions = React.useMemo(() => {
    const items = (commodityDict || []).filter((item) => item.isActive);
    if (!items.length) return DEFAULT_COMMODITIES_FALLBACK;
    return items.map((item) => ({ value: item.code, label: item.label }));
  }, [commodityDict]);

  const { data: pointsData } = useCollectionPoints({ page: 1, pageSize: 100, isActive: true });
  const currentPoint = pointsData?.data?.find((p: any) => p.id === pointId);

  // [NEW] 获取当前用户的分配信息以确定品种权限
  const { data: myAssignedPoints } = useMyAssignedPoints(undefined, currentUser?.id);
  const myAllocations = myAssignedPoints?.filter((a: any) => a.collectionPointId === pointId);

  // [NEW] 计算允许填报的品种
  const allowedCommodities = React.useMemo(() => {
    // 辅助函数：从 code 查找中文 label
    const getLabel = (code: string) => {
      const found = commodityOptions.find((opt) => opt.value === code);
      return found?.label || code;
    };

    // 0.5 如果URL指定了品种 (Daily Maintenance)
    if (urlCommodity) {
      return [{ value: urlCommodity, label: getLabel(urlCommodity) }];
    }

    // 1. 如果没有分配记录，或者分配记录包含"全品种"（commodity=null），则允许该点所有配置的品种
    const hasFullAccess = !myAllocations?.length || myAllocations.some((a: any) => !a.commodity);

    if (hasFullAccess) {
      if (currentPoint?.commodities?.length) {
        return currentPoint.commodities.map((c: string) => ({ value: c, label: getLabel(c) }));
      }
      return commodityOptions;
    }

    // 2. 如果只有特定品种分配，聚合所有分配的品种
    const allocatedCommodities = [...new Set(myAllocations.map((a: any) => a.commodity).filter(Boolean))];

    if (allocatedCommodities.length > 0) {
      return allocatedCommodities.map((c: string) => ({ value: c, label: getLabel(c) }));
    }

    // 3. 兜底 (理论上不应到达这里，除非分配了但没品种也没全选)
    return currentPoint?.commodities?.map((c: string) => ({ value: c, label: getLabel(c) })) || commodityOptions;
  }, [myAllocations, currentPoint, urlCommodity, commodityOptions]);

  // [NEW] 根据采集点配置过滤价格类型
  const allowedPriceTypes = React.useMemo(() => {
    if (!currentPoint?.priceSubTypes?.length) {
      return priceSubTypeOptions;
    }
    return priceSubTypeOptions.filter(t => currentPoint.priceSubTypes.includes(t.value));
  }, [currentPoint, priceSubTypeOptions]);

  const createSubmission = useCreateSubmission();
  const addEntry = useAddPriceEntry();
  const submitSubmission = useSubmitSubmission();
  const submitTask = useSubmitTask();
  const copyYesterday = useCopyYesterdayData();
  const commodity = Form.useWatch('commodity', form);
  const { data: priceHistory } = usePointPriceHistory(pointId || '', 7, commodity);

  const { data: submission, isLoading: loadingSubmission } = useSubmission(submissionId || '');

  // 初始化或获取现有批次
  React.useEffect(() => {
    if (pointId && !submissionId) {
      createSubmission.mutateAsync({
        collectionPointId: pointId,
        effectiveDate: new Date(),
        taskId,
      }).then((result) => {
        // Pre-populate the cache to avoid loading state
        queryClient.setQueryData(['price-submission', result.id], result);
        setSubmissionId(result.id);
      }).catch((err: any) => {
        message.error(getErrorMessage(err));
      });
    }
  }, [pointId]);

  // [NEW] 当允许的品种变化时，自动设置默认值
  React.useEffect(() => {
    if (allowedCommodities.length > 0) {
      // 如果当前选中的品种不在允许列表中，重置为第一个允许的品种
      const currentVal = form.getFieldValue('commodity');
      if (!currentVal || !allowedCommodities.find(c => c.value === currentVal)) {
        form.setFieldValue('commodity', allowedCommodities[0].value);
      }
    }
  }, [allowedCommodities, form]);

  const normalizeGrade = (value: unknown) => {
    if (value === null || value === undefined) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    const map: Record<string, string> = {
      '1': '一等',
      '一': '一等',
      '2': '二等',
      '二': '二等',
      '3': '三等',
      '三': '三等',
    };
    return map[raw] || raw;
  };

  const gradeOptions = React.useMemo(() => {
    const base = ['一等', '二等', '三等'];
    const historyGrades = (priceHistory || [])
      .map((item: any) => normalizeGrade(item.grade))
      .filter(Boolean) as string[];
    return Array.from(new Set([...base, ...historyGrades])).map(value => ({ value, label: value }));
  }, [priceHistory]);

  const handleCopyYesterday = () => {
    if (!priceHistory?.length) {
      message.warning('暂无历史数据可复制');
      return;
    }

    // Find latest entry for current commodity
    const latestEntry = priceHistory
      .filter((p: any) => p.commodity === commodity)
      .sort((a: any, b: any) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0];

    if (!latestEntry) {
      message.warning(`未找到 ${commodity || ''} 的历史数据`);
      return;
    }

    const copiedGrade = normalizeGrade(latestEntry.grade);
    const nextValues: Record<string, unknown> = {
      price: latestEntry.price !== undefined && latestEntry.price !== null ? Number(latestEntry.price) : undefined,
      subType: latestEntry.subType,
      moisture: latestEntry.moisture !== undefined && latestEntry.moisture !== null ? Number(latestEntry.moisture) : undefined,
      bulkDensity: latestEntry.bulkDensity !== undefined && latestEntry.bulkDensity !== null ? Number(latestEntry.bulkDensity) : undefined,
      inventory: latestEntry.inventory !== undefined && latestEntry.inventory !== null ? Number(latestEntry.inventory) : undefined,
      note: latestEntry.note || '复制自近期数据',
    };
    nextValues.grade = copiedGrade ?? undefined;

    form.setFieldsValue(nextValues);

    message.success('已填充最近一次填报数据');
  };

  const handleAddEntry = async (values: any) => {
    if (!submissionId) return;
    try {
      const bulkDensity = typeof values.bulkDensity === 'number' && values.bulkDensity > 0 ? values.bulkDensity : undefined;
      await addEntry.mutateAsync({
        submissionId,
        dto: {
          commodity: values.commodity,
          price: values.price,
          subType: values.subType || 'LISTED',
          sourceType: 'ENTERPRISE',
          geoLevel: 'ENTERPRISE',
          ...(values.grade ? { grade: values.grade } : {}),
          ...(typeof values.moisture === 'number' ? { moisture: values.moisture } : {}),
          ...(bulkDensity !== undefined ? { bulkDensity } : {}),
          ...(typeof values.inventory === 'number' ? { inventory: values.inventory } : {}),
          ...(values.note ? { note: values.note } : {}),
        },
      });
      message.success('添加成功');
      form.resetFields(['price', 'moisture', 'bulkDensity', 'inventory', 'note']);
    } catch (err: any) {
      message.error(getErrorMessage(err));
    }
  };

  const handleSubmit = async () => {
    if (!submissionId) return;
    if (!submission?.priceData?.length) {
      message.warning('请至少添加一条价格数据');
      return;
    }

    // [NEW] 检查是否填报了所有指定品种
    const filledCommodities = priceDataList.map((i: any) => i.commodity);
    const missingCommodities = allowedCommodities
      .map(c => c.value)
      .filter(c => !filledCommodities.includes(c));

    if (missingCommodities.length > 0) {
      modal.confirm({
        title: '确认提交未完成的填报？',
        content: (
          <div>
            <p>您还有以下分配的品种尚未填报：</p>
            <p style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{missingCommodities.join('、')}</p>
            <p>提交后任务将标记为完成。如需稍后继续，请点击“取消”并保存草稿。</p>
          </div>
        ),
        okText: '仍要提交',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => performSubmit(),
      });
      return;
    }

    await performSubmit();
  };

  const performSubmit = async () => {
    if (!submissionId) return;
    try {
      // 1. Submit the price submission (marks as SUBMITTED)
      await submitSubmission.mutateAsync(submissionId);

      // 2. If this is a task-based submission, also submit the task for review
      if (taskId) {
        await submitTask.mutateAsync({
          id: taskId,
          operatorId: currentUser?.id || 'unknown',
          data: { submissionId }
        });
        message.success('任务已提交审核');
      } else {
        message.success('提交成功');
      }

      navigate('/price-reporting');
    } catch (err: any) {
      message.error(getErrorMessage(err));
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
                loading={false}
              >
                复制历史数据
              </Button>
            }
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleAddEntry}
              initialValues={{
                commodity: 'CORN',
                subType: 'LISTED',
                grade: '二等',
              }}
            >
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item name="commodity" label="品种" rules={[{ required: true }]}>
                    <Select options={allowedCommodities} disabled={allowedCommodities.length === 1} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="subType" label="价格类型" rules={[{ required: true }]}>
                    <Select options={allowedPriceTypes} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="grade" label="等级">
                    <Select options={gradeOptions} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item
                    name="price"
                    label="价格 (元/吨)"
                    rules={[
                      { required: true, message: '请输入价格' },
                      {
                        validator: (_, value) => {
                          if (value === undefined || value === null || value === '') {
                            return Promise.resolve();
                          }
                          const normalized = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
                          if (Number.isFinite(normalized) && normalized > 0) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('价格必须大于 0'));
                        },
                      },
                    ]}
                  >
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
                    <InputNumber style={{ width: '100%' }} min={1} precision={0} />
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
                <Button type="primary" htmlType="submit" loading={addEntry.isPending} disabled={!submissionId}>
                  添加价格
                </Button>
              </Form.Item>
              {/* Deviation Warning Logic */}
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.price !== curr.price || prev.commodity !== curr.commodity}>
                {({ getFieldValue }) => {
                  const currentPrice = getFieldValue('price');
                  const currentCommodity = getFieldValue('commodity');

                  // Find latest history price for comparison
                  const latestHistory = priceHistory?.filter((h: any) => h.commodity === currentCommodity)?.[0];

                  if (currentPrice && latestHistory && latestHistory.price) {
                    const diff = Math.abs(currentPrice - Number(latestHistory.price));
                    const percent = (diff / Number(latestHistory.price)) * 100;

                    if (percent > 10) {
                      return (
                        <Alert
                          type="warning"
                          showIcon
                          icon={<WarningOutlined />}
                          message="价格波动预警"
                          description={
                            <span>
                              当前输入价格 <b>{currentPrice}</b> 与最近一次({new Date(latestHistory.effectiveDate).toLocaleDateString()})价格 <b>{Number(latestHistory.price)}</b> 相比波动幅度较大 (<b>{percent.toFixed(1)}%</b>)，请确认是否输入无误。
                            </span>
                          }
                          style={{ marginTop: 16 }}
                        />
                      );
                    }
                  }
                  return null;
                }}
              </Form.Item>
            </Form>
          </Card>

          {/* 已添加的价格列表 */}
          <Card title={`已添加 (${priceDataList.length} 条)`} style={{ marginTop: 16 }}>
            {submissionId && loadingSubmission ? (
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
              loading={submitSubmission.isPending || submitTask.isPending}
              disabled={!priceDataList.length}
            >
              {taskId ? '提交审核' : '提交'}
            </Button>
            <Button size="large" onClick={() => navigate('/price-reporting')}>
              保存草稿
            </Button>
          </Space>
        </Col>

        {/* 右侧：历史价格 */}
        <Col xs={24} lg={8}>
          <Card title="历史价格趋势 (近7日)" size="small">
            {priceHistory?.length ? (
              <div style={{ width: '100%' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={priceHistory.slice().reverse().map((i: any) => ({
                      date: new Date(i.effectiveDate).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
                      price: Number(i.price)
                    }))}
                    margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={['auto', 'auto']} hide />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: any) => [`${value} 元/吨`, '价格']}
                    />
                    <Area type="monotone" dataKey="price" stroke="#1890ff" fill="#e6f7ff" />
                  </AreaChart>
                </ResponsiveContainer>
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    最近报价: <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{Number(priceHistory[0].price).toLocaleString()}</span> 元/吨
                  </Text>
                </div>
              </div>
            ) : (
              <Text type="secondary">暂无历史数据</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div >
  );
};

export default PriceEntryForm;

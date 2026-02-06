import React, { useState } from 'react';
import { Card, Form, InputNumber, Input, Select, Button, Space, Row, Col, Divider, Typography, Spin, Alert, App } from 'antd';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftOutlined, CopyOutlined, SendOutlined, WarningOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateSubmission,
  useSubmission,
  useAddPriceEntry,
  useUpdatePriceEntry,
  useDeletePriceEntry,
  useSubmitSubmission,
  usePointPriceHistory,
  useMyAssignedPoints,
} from '../../api/hooks';
import { useCollectionPoints } from '../../../market-intel/api/collection-point';
import { getErrorMessage } from '../../../../api/client';
import { useVirtualUser } from '@/features/auth/virtual-user';
import { useDictionary } from '@/hooks/useDictionaries';
import { usePriceSubTypeLabels, usePriceSubTypeOptions } from '@/utils/priceSubType';

const { Title, Text } = Typography;
const { TextArea } = Input;



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
  const { data: commodityDict, isLoading: isLoadingCommodity } = useDictionary('COMMODITY');

  // 统一的价格类型选项与标签映射（字典优先，兜底中文）
  const priceSubTypeOptions = usePriceSubTypeOptions(priceSubTypeDict);
  const priceSubTypeLabels = usePriceSubTypeLabels(priceSubTypeDict);



  // 使用 fallback 作为兜底，确保在字典加载完成前也能正确显示中文标签
  const commodityOptions = React.useMemo(() => {
    if (isLoadingCommodity || !commodityDict) return DEFAULT_COMMODITIES_FALLBACK;
    const items = commodityDict.filter((item) => item.isActive);
    if (!items.length) return DEFAULT_COMMODITIES_FALLBACK;
    return items.map((item) => ({ value: item.code, label: item.label }));
  }, [commodityDict, isLoadingCommodity]);

  const commodityLabels = React.useMemo(() => {
    const map: Record<string, string> = {};
    commodityOptions.forEach(opt => { map[opt.value] = opt.label; });
    return map;
  }, [commodityOptions]);

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

  const commodity = Form.useWatch('commodity', form);
  const { data: priceHistory } = usePointPriceHistory(pointId || '', 7, commodity);

  const { data: submission, isLoading: loadingSubmission } = useSubmission(submissionId || '');

  // 获取价格数据列表，如果任务指定了品种则只显示该品种的数据
  const priceDataList = React.useMemo(() => {
    const allData = submission?.priceData || [];
    // 如果 URL 指定了品种（任务模式），只显示该品种的数据
    if (urlCommodity) {
      return allData.filter((item: any) => item.commodity === urlCommodity);
    }
    return allData;
  }, [submission?.priceData, urlCommodity]);

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

  // [NEW] 确保价格类型有有效的默认值
  React.useEffect(() => {
    if (allowedPriceTypes.length > 0) {
      const currentSubType = form.getFieldValue('subType');
      if (!currentSubType || !allowedPriceTypes.find(opt => opt.value === currentSubType)) {
        form.setFieldValue('subType', allowedPriceTypes[0].value);
      }
    }
  }, [allowedPriceTypes, form]);

  // [NEW] 对于驳回的任务，表单应该显示现有数据而不是默认值
  React.useEffect(() => {
    if (priceDataList.length > 0 && taskId) {
      // 如果是任务且有现有数据，设置表单为第一条数据
      const firstEntry = priceDataList[0];
      form.setFieldsValue({
        commodity: firstEntry.commodity,
        subType: firstEntry.subType,
        grade: firstEntry.grade || '二等',
        price: firstEntry.price,
        moisture: firstEntry.moisture,
        bulkDensity: firstEntry.bulkDensity,
        inventory: firstEntry.inventory,
        note: firstEntry.note,
      });
    } else if (priceDataList.length === 0 && taskId) {
      // 如果是任务但没有数据，保持默认值
      form.setFieldsValue({
        commodity: allowedCommodities[0]?.value || 'CORN',
        subType: allowedPriceTypes[0]?.value || 'LISTED',
        grade: '二等',
      });
    }
  }, [priceDataList, taskId, allowedCommodities, allowedPriceTypes, form]);

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
     // 确保 subType 值在允许的选项中，如果不在则使用默认值
     const validSubType = allowedPriceTypes.some(opt => opt.value === latestEntry.subType) 
       ? latestEntry.subType 
       : (allowedPriceTypes[0]?.value || 'LISTED');

     const nextValues: Record<string, unknown> = {
       price: latestEntry.price !== undefined && latestEntry.price !== null ? Number(latestEntry.price) : undefined,
       subType: validSubType,
       moisture: latestEntry.moisture !== undefined && latestEntry.moisture !== null ? Number(latestEntry.moisture) : undefined,
       bulkDensity: latestEntry.bulkDensity !== undefined && latestEntry.bulkDensity !== null ? Number(latestEntry.bulkDensity) : undefined,
       inventory: latestEntry.inventory !== undefined && latestEntry.inventory !== null ? Number(latestEntry.inventory) : undefined,
       note: latestEntry.note || '复制自近期数据',
     };
    nextValues.grade = copiedGrade ?? undefined;

    form.setFieldsValue(nextValues);

    message.success('已填充最近一次填报数据');
  };

  const updateEntry = useUpdatePriceEntry();
  const deleteEntry = useDeletePriceEntry();

  const handleAddEntry = async (values: any) => {
    if (!submissionId) return;
    
    try {
      const bulkDensity = typeof values.bulkDensity === 'number' && values.bulkDensity > 0 ? values.bulkDensity : undefined;
      const entryDto = {
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
      };

      // 对于驳回的任务，我们检查是否在更新现有数据
      if (taskId && priceDataList.length > 0) {
        // 查找匹配的现有条目（相同品种和价格类型）
        const existingEntry = priceDataList.find((item: any) => 
          item.commodity === values.commodity && 
          item.subType === (values.subType || 'LISTED')
        );

        if (existingEntry) {
          // 更新现有条目
          if (existingEntry.id) {
            await updateEntry.mutateAsync({
              submissionId,
              entryId: existingEntry.id,
              dto: entryDto,
            });
            message.success('数据已更新');
          } else {
            // 备用方案：删除后重新添加
            await addEntry.mutateAsync({
              submissionId,
              dto: entryDto,
            });
            message.success('数据已更新');
          }
          form.resetFields(['price', 'moisture', 'bulkDensity', 'inventory', 'note']);
          return;
        }
      }

      // 正常添加新数据
      await addEntry.mutateAsync({
        submissionId,
        dto: entryDto,
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
      // 提交价格填报批次
      // 后端会同时更新关联任务的状态为 SUBMITTED（待审核）
      await submitSubmission.mutateAsync(submissionId);

      // 提交成功后，需要刷新任务缓存，使已完成的任务从列表中移除
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ['my-intel-tasks', currentUser.id] });
      }
      
      // 同时也刷新分配点缓存，以防任务状态影响分配显示
      // 使用模糊匹配，因为我们不知道确切的 effectiveDate 参数
      queryClient.invalidateQueries({ queryKey: ['my-assigned-points'] });
      
      // 刷新提交统计数据缓存
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ['submission-statistics', currentUser.id] });
      }

      message.success(taskId ? '已提交审核' : '提交成功');
      navigate('/price-reporting');
    } catch (err: any) {
      message.error(getErrorMessage(err));
    }
  };

  if (!pointId) {
    return <Alert type="error" message="采集点ID不存在" />;
  }


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
              data-testid="price-form"
              // 初始值将在 useEffect 中动态设置
            >
              <Row gutter={16}>
                <Col xs={12} md={8}>
                  <Form.Item name="commodity" label="品种" rules={[{ required: true }]}>
                    <Select options={allowedCommodities} disabled={allowedCommodities.length === 1} />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="subType" label="价格类型" rules={[{ required: true }]}>
                    <Select 
                      options={allowedPriceTypes}
                      loading={!allowedPriceTypes.length}
                      placeholder={allowedPriceTypes.length ? "请选择价格类型" : "加载中..."}
                    />
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
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={addEntry.isPending || updateEntry.isPending} 
                  disabled={!submissionId}
                >
                  {taskId && priceDataList.length > 0 ? '更新价格' : '添加价格'}
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
          <Card 
            id="price-data-list"
            title={
              <Space>
                <span>已添加 ({priceDataList.length} 条)</span>
                {priceDataList.length > 0 && taskId && (
                  <Text type="warning" style={{ fontSize: 12 }}>
                    ⚠️ 驳回任务：请点击"编辑"按钮修改数据
                  </Text>
                )}
              </Space>
            } 
            style={{ marginTop: 16 }}
          >
            {taskId && priceDataList.length > 0 && (
              <Alert
                type="info"
                showIcon
                message="驳回任务操作提示"
                description={
                  <div>
                    <p>• 点击"编辑"按钮可修改现有数据，修改后点击"更新价格"保存</p>
                    <p>• 如需重新填报，请先点击"删除"移除旧数据</p>
                    <p>• 避免重复填报相同品种和价格类型，否则会报错</p>
                  </div>
                }
                style={{ marginBottom: 16 }}
              />
            )}
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
                      padding: '12px 8px',
                      borderBottom: index < priceDataList.length - 1 ? '1px solid #f0f0f0' : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: taskId ? '#f6ffed' : 'transparent',
                      borderRadius: 4,
                      marginBottom: index < priceDataList.length - 1 ? 4 : 0,
                      border: taskId ? '1px solid #b7eb8f' : 'none',
                    }}
                  >
                    <Space>
                      <Text strong>{commodityLabels[item.commodity] || item.commodity}</Text>
                      <Text type="secondary">{priceSubTypeLabels[item.subType] || item.subType}</Text>
                      <Text style={{ color: '#1890ff', fontWeight: 'bold' }}>
                        {Number(item.price).toLocaleString()} 元/吨
                      </Text>
                      {item.moisture && <Text type="secondary">水分 {item.moisture}%</Text>}
                      {item.note && <Text type="secondary">({item.note})</Text>}
                    </Space>
                    <Space>
                      <Button 
                        type="primary" 
                        size="small" 
                        icon={<EditOutlined />}
                        onClick={() => {
                          // 将数据加载到表单进行编辑
                          form.setFieldsValue({
                            commodity: item.commodity,
                            subType: item.subType,
                            grade: item.grade || '二等',
                            price: item.price,
                            moisture: item.moisture,
                            bulkDensity: item.bulkDensity,
                            inventory: item.inventory,
                            note: item.note,
                          });
                          
                          // 滚动到表单区域
                          document.querySelector('[data-testid="price-form"]')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        编辑
                      </Button>
                      <Button 
                        size="small" 
                        danger 
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          modal.confirm({
                            title: '确认删除？',
                            content: (
                              <div>
                                <p>确定要删除这条价格数据吗？</p>
                                <p style={{ fontWeight: 'bold' }}>
                                  {commodityLabels[item.commodity] || item.commodity} - 
                                  {priceSubTypeLabels[item.subType] || item.subType} - 
                                  ¥{Number(item.price).toLocaleString()}/吨
                                </p>
                              </div>
                            ),
                            okText: '删除',
                            okButtonProps: { danger: true },
                            cancelText: '取消',
                            onOk: async () => {
                              if (item.id && submissionId) {
                                try {
                                  await deleteEntry.mutateAsync({
                                    submissionId,
                                    entryId: item.id,
                                  });
                                  message.success('删除成功');
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      
      // 检查是否是重复填报的错误，提供更友好的提示
      if (errorMessage.includes('已有') && errorMessage.includes('请勿重复填报')) {
        const match = errorMessage.match(/该品种\((.+?)\)在当日\(.+?\)已有(.+?)数据/);
        if (match) {
          const [, commodity, date, priceType] = match;
          modal.confirm({
            title: '重复数据提示',
            content: (
              <div>
                <p>检测到重复数据：</p>
                <p style={{ fontWeight: 'bold', color: '#ff4d4f' }}>
                  {commodityLabels[commodity] || commodity} 在 {date} 已有 {priceSubTypeLabels[priceType] || priceType} 数据
                </p>
                <p>请选择以下操作：</p>
              </div>
            ),
            okText: '查看已添加数据',
            cancelText: '取消',
            onOk: () => {
              // 滚动到已添加数据区域
              document.getElementById('price-data-list')?.scrollIntoView({ behavior: 'smooth' });
            },
          });
          return;
        }
      }
      
      message.error(errorMessage);
    }
                              }
                            },
                          });
                        }}
                      >
                        删除
                      </Button>
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

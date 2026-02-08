import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  App,
  Popconfirm,
  Tooltip,
  Row,
  Col,
  Typography,
  Badge,
  Alert,
  DatePicker,
  Segmented,
} from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  ApartmentOutlined,
  BankOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';
import {
  useTaskTemplates,
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  useDeleteTaskTemplate,
  useExecuteTaskTemplate,
  usePreviewTaskDistribution,
  CreateTaskTemplateDto,
  TaskTemplate,
} from '../../api/hooks';
import { useUsers } from '../../../users/api/users';
import { OrgDeptTreeSelect } from '../../../organization/components/OrgDeptTreeSelect';
import { DistributionPreview } from '../../../market-intel/components/DistributionPreview';
import { DistributionPreviewResponse } from '@packages/types';
import { useCollectionPoints } from '../../../market-intel/api/collection-point';
import dayjs from 'dayjs';

const { Text } = Typography;
const { TextArea } = Input;

// 任务类型选项
const TASK_TYPE_OPTIONS = [
  { value: 'COLLECTION', label: '采集任务', color: 'blue' },
  { value: 'REPORT', label: '报告任务', color: 'orange' },
  { value: 'VERIFICATION', label: '核实任务', color: 'red' },
];

// 周期类型选项
const CYCLE_TYPE_OPTIONS = [
  { value: 'DAILY', label: '每日', description: '每天自动执行' },
  { value: 'WEEKLY', label: '每周', description: '每周执行一次' },
  { value: 'MONTHLY', label: '每月', description: '每月执行一次' },
  { value: 'ONE_TIME', label: '一次性', description: '仅执行一次' },
];

// 优先级选项
const PRIORITY_OPTIONS = [
  { value: 'LOW', label: '低', color: 'default' },
  { value: 'MEDIUM', label: '中', color: 'blue' },
  { value: 'HIGH', label: '高', color: 'orange' },
  { value: 'URGENT', label: '紧急', color: 'red' },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

const MONTH_DAY_OPTIONS = [
  ...Array.from({ length: 31 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}日`,
  })),
  { value: 0, label: '月末' },
];

// 采集点类型选项
const POINT_TYPE_OPTIONS = [
  { value: 'PORT', label: '港口', icon: '⚓' },
  { value: 'ENTERPRISE', label: '企业', icon: '🏭' },
  { value: 'STATION', label: '站台', icon: '🚂' },
  { value: 'MARKET', label: '市场', icon: '🏪' },
  { value: 'REGION', label: '区域', icon: '📍' },
];

// 分配模式选项
const ASSIGNEE_MODE_OPTIONS = [
  { value: 'BY_COLLECTION_POINT', label: '按采集点负责人', description: '按采集点类型或指定采集点分配负责人' },
  { value: 'MANUAL', label: '手动指定', description: '手动选择分配人员' },
  { value: 'BY_DEPARTMENT', label: '按部门', description: '分配给指定部门的所有成员' },
  { value: 'BY_ORGANIZATION', label: '按组织', description: '分配给指定组织的所有成员' },
];

const getTaskTypeInfo = (type: string) => {
  return TASK_TYPE_OPTIONS.find((t) => t.value === type) || { label: type, color: 'default' };
};

const getCycleTypeInfo = (type: string) => {
  return CYCLE_TYPE_OPTIONS.find((t) => t.value === type) || { label: type };
};

const getPriorityInfo = (priority: string) => {
  return PRIORITY_OPTIONS.find((p) => p.value === priority) || { label: priority, color: 'default' };
};

const getPointTypeInfo = (type: string) => {
  return POINT_TYPE_OPTIONS.find((t) => t.value === type) || { label: type, icon: '📍' };
};

// 格式化时间（分钟 -> HH:MM）
const formatMinuteToTime = (minute: number) => {
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

export const TaskTemplateManager: React.FC = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState<DistributionPreviewResponse | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [pointScope, setPointScope] = useState<'TYPE' | 'POINTS'>('TYPE');

  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

  // 数据查询
  const { data: templates, isLoading } = useTaskTemplates();
  const { data: users = [], isLoading: usersLoading } = useUsers({ status: 'ACTIVE' });
  const { data: collectionPointsData, isLoading: pointsLoading } = useCollectionPoints({
    page: 1,
    pageSize: 1000,
    isActive: true,
  });
  const createTemplate = useCreateTaskTemplate();
  const updateTemplate = useUpdateTaskTemplate();
  const deleteTemplate = useDeleteTaskTemplate();
  const executeTemplate = useExecuteTaskTemplate();
  const previewDistribution = usePreviewTaskDistribution();

  const collectionPointOptions = (collectionPointsData?.data || []).map((point) => ({
    value: point.id,
    label: `${point.name}${point.code ? ` (${point.code})` : ''}`,
  }));

  // 打开创建/编辑模态框
  const handleOpenModal = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      const nextPointScope = template.targetPointType
        ? 'TYPE'
        : (template.collectionPointIds && template.collectionPointIds.length > 0) || template.collectionPointId
          ? 'POINTS'
          : 'TYPE';
      setPointScope(nextPointScope);
      form.setFieldsValue({
        ...template,
        assigneeIds: template.assigneeIds || [],
        departmentIds: template.departmentIds || [],
        organizationIds: template.organizationIds || [],
        collectionPointIds: template.collectionPointIds?.length
          ? template.collectionPointIds
          : template.collectionPointId
            ? [template.collectionPointId]
            : [],
        activeFrom: template.activeFrom ? dayjs(template.activeFrom) : undefined,
        activeUntil: template.activeUntil ? dayjs(template.activeUntil) : undefined,
        runAtHour: Math.floor(template.runAtMinute / 60),
        runAtMin: template.runAtMinute % 60,
        dueAtHour: Math.floor(template.dueAtMinute / 60),
        dueAtMin: template.dueAtMinute % 60,
      });
    } else {
      setEditingTemplate(null);
      setPointScope('TYPE');
      form.resetFields();
      form.setFieldsValue({
        priority: 'MEDIUM',
        cycleType: 'DAILY',
        assigneeMode: 'BY_COLLECTION_POINT',
        collectionPointIds: [],
        deadlineOffset: 10,
        runAtHour: 8,
        runAtMin: 0,
        dueAtHour: 18,
        dueAtMin: 0,
        runDayOfWeek: 1,
        dueDayOfWeek: 7,
        runDayOfMonth: 1,
        dueDayOfMonth: 0,
        allowLate: true,
        maxBackfillPeriods: 3,
        isActive: true,
      });
    }
    setModalVisible(true);
  };

  // 处理分配模式切换时清空相关字段
  const handleAssigneeModeChange = (mode: string) => {
    if (mode !== 'MANUAL') {
      form.setFieldValue('assigneeIds', []);
    }
    if (mode !== 'BY_COLLECTION_POINT') {
      form.setFieldValue('targetPointType', undefined);
      form.setFieldValue('collectionPointIds', []);
      setPointScope('TYPE');
    }
    if (mode !== 'BY_DEPARTMENT') {
      form.setFieldValue('departmentIds', []);
    }
    if (mode !== 'BY_ORGANIZATION') {
      form.setFieldValue('organizationIds', []);
    }
  };

  const handlePointScopeChange = (value: 'TYPE' | 'POINTS') => {
    setPointScope(value);
    if (value === 'TYPE') {
      form.setFieldValue('collectionPointIds', []);
    } else {
      form.setFieldValue('targetPointType', undefined);
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const activeFrom = values.activeFrom?.toISOString ? values.activeFrom.toISOString() : values.activeFrom;
      const activeUntil = values.activeUntil?.toISOString ? values.activeUntil.toISOString() : values.activeUntil;
      const dto: CreateTaskTemplateDto = {
        ...values,
        activeFrom,
        activeUntil,
        runAtMinute: (values.runAtHour || 0) * 60 + (values.runAtMin || 0),
        dueAtMinute: (values.dueAtHour || 0) * 60 + (values.dueAtMin || 0),
      };
      delete (dto as any).runAtHour;
      delete (dto as any).runAtMin;
      delete (dto as any).dueAtHour;
      delete (dto as any).dueAtMin;

      if (editingTemplate) {
        await updateTemplate.mutateAsync({ id: editingTemplate.id, dto });
        message.success('模板更新成功');
      } else {
        await createTemplate.mutateAsync(dto);
        message.success('模板创建成功');
      }
      setModalVisible(false);
    } catch (err: any) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  // 删除模板
  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      message.success('模板已删除');
    } catch (err) {
      message.error('删除失败');
    }
  };

  // 手动执行模板
  const handleExecute = async (id: string) => {
    try {
      const result = await executeTemplate.mutateAsync(id);
      message.success(result.message || `成功创建 ${result.count} 个任务`);
      setPreviewVisible(false); // Close preview if open
    } catch (err: any) {
      message.error(err.response?.data?.message || '执行失败');
    }
  };

  // 预览分发
  const handlePreview = async (id: string) => {
    try {
      setCurrentTemplateId(id);
      const data = await previewDistribution.mutateAsync(id);
      setPreviewData(data);
      setPreviewVisible(true);
    } catch (err: any) {
      message.error('获取预览数据失败');
    }
  };

  // 切换启用状态
  const handleToggleActive = async (template: TaskTemplate) => {
    try {
      await updateTemplate.mutateAsync({
        id: template.id,
        dto: { isActive: !template.isActive } as any,
      });
      message.success(template.isActive ? '模板已禁用' : '模板已启用');
    } catch (err) {
      message.error('操作失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: TaskTemplate) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: '任务类型',
      dataIndex: 'taskType',
      key: 'taskType',
      width: 120,
      render: (type: string) => {
        const info = getTaskTypeInfo(type);
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '周期',
      dataIndex: 'cycleType',
      key: 'cycleType',
      width: 100,
      render: (type: string) => {
        const info = getCycleTypeInfo(type);
        return (
          <Space size={4}>
            <CalendarOutlined />
            <span>{info.label}</span>
          </Space>
        );
      },
    },
    {
      title: '分配范围',
      key: 'scope',
      width: 180,
      render: (_: any, record: TaskTemplate) => {
        if (record.assigneeMode === 'BY_COLLECTION_POINT') {
          if (record.targetPointType) {
            const info = getPointTypeInfo(record.targetPointType);
            return (
              <Space>
                <EnvironmentOutlined />
                <span>{info.icon} {info.label}类采集点</span>
              </Space>
            );
          }
          if (record.collectionPointIds && record.collectionPointIds.length > 0) {
            return (
              <Space>
                <EnvironmentOutlined />
                <span>指定采集点 ({record.collectionPointIds.length})</span>
              </Space>
            );
          }
          return (
            <Space>
              <TeamOutlined />
              <span>按采集点负责人</span>
            </Space>
          );
        }
        if (record.assigneeMode === 'BY_DEPARTMENT') {
          return (
            <Space>
              <ApartmentOutlined />
              <span>按部门 ({record.departmentIds?.length || 0})</span>
            </Space>
          );
        }
        if (record.assigneeMode === 'BY_ORGANIZATION') {
          return (
            <Space>
              <BankOutlined />
              <span>按组织 ({record.organizationIds?.length || 0})</span>
            </Space>
          );
        }
        if (record.assigneeMode === 'MANUAL') {
          return <Text type="secondary">手动指定 ({record.assigneeIds?.length || 0})</Text>;
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: '执行时间',
      key: 'schedule',
      width: 150,
      render: (_: any, record: TaskTemplate) => (
        <div>
          <div>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            下发: {formatMinuteToTime(record.runAtMinute)}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            截止: {formatMinuteToTime(record.dueAtMinute)}
          </Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean, record: TaskTemplate) => (
        <Switch
          checked={isActive}
          checkedChildren="启用"
          unCheckedChildren="禁用"
          onChange={() => handleToggleActive(record)}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: TaskTemplate) => (
        <Space>
          <Tooltip title="预览分发结果">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(record.id)}
              loading={previewDistribution.isPending && currentTemplateId === record.id}
            />
          </Tooltip>
          <Tooltip title="立即执行">
            <Button
              type="primary"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleExecute(record.id)}
              loading={executeTemplate.isPending}
            >
              执行
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除此模板？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <CalendarOutlined />
            <span>任务模板管理</span>
            <Badge count={templates?.filter((t) => t.isActive).length || 0} style={{ backgroundColor: '#52c41a' }} />
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            新建模板
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={templates || []}
          rowKey="id"
          loading={isLoading}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingTemplate ? '编辑任务模板' : '新建任务模板'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={980}
        confirmLoading={createTemplate.isPending || updateTemplate.isPending}
        styles={{ body: { paddingTop: 12 } }}
        {...modalProps}
      >
        <div ref={containerRef}>
          <Form form={form} layout="vertical">
          <Row gutter={24}>
            <Col span={16}>
              <Card size="small" title="基础信息" style={{ marginBottom: 16 }}>
                <Form.Item
                  name="name"
                  label="模板名称"
                  rules={[{ required: true, message: '请输入模板名称' }]}
                >
                  <Input placeholder="如：每日港口采集任务" {...autoFocusFieldProps} />
                </Form.Item>

                <Form.Item name="description" label="任务描述">
                  <TextArea rows={2} placeholder="任务说明和要求" />
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="taskType"
                      label="任务类型"
                      rules={[{ required: true, message: '请选择任务类型' }]}
                    >
                      <Select options={TASK_TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="priority" label="优先级">
                      <Select
                        options={PRIORITY_OPTIONS.map((p) => ({
                          value: p.value,
                          label: <Tag color={p.color}>{p.label}</Tag>,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card size="small" title="周期配置" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name="cycleType"
                      label="执行周期"
                      rules={[{ required: true, message: '请选择周期' }]}
                    >
                      <Select
                        optionLabelProp="label"
                        onChange={(value) => {
                          if (value === 'WEEKLY') {
                            form.setFieldsValue({
                              runDayOfWeek: form.getFieldValue('runDayOfWeek') ?? 1,
                              dueDayOfWeek: form.getFieldValue('dueDayOfWeek') ?? 7,
                              runDayOfMonth: undefined,
                              dueDayOfMonth: undefined,
                            });
                          } else if (value === 'MONTHLY') {
                            form.setFieldsValue({
                              runDayOfMonth: form.getFieldValue('runDayOfMonth') ?? 1,
                              dueDayOfMonth: form.getFieldValue('dueDayOfMonth') ?? 0,
                              runDayOfWeek: undefined,
                              dueDayOfWeek: undefined,
                            });
                          } else {
                            form.setFieldsValue({
                              runDayOfWeek: undefined,
                              dueDayOfWeek: undefined,
                              runDayOfMonth: undefined,
                              dueDayOfMonth: undefined,
                            });
                          }
                        }}
                        options={CYCLE_TYPE_OPTIONS.map((c) => ({
                          value: c.value,
                          label: c.label,
                          description: c.description,
                        }))}
                        optionRender={(option) => (
                          <div>
                            <div>{option.data.label}</div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {option.data.description}
                            </Text>
                          </div>
                        )}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="deadlineOffset" label="截止偏移（小时）">
                      <InputNumber min={1} max={72} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.cycleType !== cur.cycleType}>
                  {({ getFieldValue }) => {
                    const cycleType = getFieldValue('cycleType');

                    if (cycleType === 'WEEKLY') {
                      return (
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item
                              name="runDayOfWeek"
                              label="分发日（周）"
                              rules={[{ required: true, message: '请选择分发日' }]}
                            >
                              <Select options={WEEKDAY_OPTIONS} />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              name="dueDayOfWeek"
                              label="截止日（周）"
                              rules={[
                                { required: true, message: '请选择截止日' },
                                ({ getFieldValue }) => ({
                                  validator(_, value) {
                                    const runDay = getFieldValue('runDayOfWeek');
                                    if (runDay && value != null && value < runDay) {
                                      return Promise.reject(new Error('截止日不能早于分发日'));
                                    }
                                    return Promise.resolve();
                                  },
                                }),
                              ]}
                            >
                              <Select options={WEEKDAY_OPTIONS} />
                            </Form.Item>
                          </Col>
                        </Row>
                      );
                    }

                    if (cycleType === 'MONTHLY') {
                      return (
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item
                              name="runDayOfMonth"
                              label="分发日（月）"
                              rules={[{ required: true, message: '请选择分发日' }]}
                              extra="选择月末将自动适配不同月份天数"
                            >
                              <Select options={MONTH_DAY_OPTIONS} />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              name="dueDayOfMonth"
                              label="截止日（月）"
                              rules={[
                                { required: true, message: '请选择截止日' },
                                ({ getFieldValue }) => ({
                                  validator(_, value) {
                                    const runDay = getFieldValue('runDayOfMonth');
                                    if (runDay == null || value == null) return Promise.resolve();
                                    const runValue = runDay === 0 ? 32 : runDay;
                                    const dueValue = value === 0 ? 32 : value;
                                    if (dueValue < runValue) {
                                      return Promise.reject(new Error('截止日不能早于分发日'));
                                    }
                                    return Promise.resolve();
                                  },
                                }),
                              ]}
                              extra="选择月末将自动适配不同月份天数"
                            >
                              <Select options={MONTH_DAY_OPTIONS} />
                            </Form.Item>
                          </Col>
                        </Row>
                      );
                    }

                    return null;
                  }}
                </Form.Item>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="下发时间">
                      <Space>
                        <Form.Item name="runAtHour" noStyle>
                          <InputNumber min={0} max={23} placeholder="时" style={{ width: 80 }} />
                        </Form.Item>
                        <span>:</span>
                        <Form.Item name="runAtMin" noStyle>
                          <InputNumber min={0} max={59} placeholder="分" style={{ width: 80 }} />
                        </Form.Item>
                      </Space>
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="截止时间">
                      <Space>
                        <Form.Item name="dueAtHour" noStyle>
                          <InputNumber min={0} max={23} placeholder="时" style={{ width: 80 }} />
                        </Form.Item>
                        <span>:</span>
                        <Form.Item name="dueAtMin" noStyle>
                          <InputNumber min={0} max={59} placeholder="分" style={{ width: 80 }} />
                        </Form.Item>
                      </Space>
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card size="small" title="高级配置" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="activeFrom" label="生效时间">
                      <DatePicker showTime style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="activeUntil"
                      label="失效时间"
                      dependencies={['activeFrom']}
                      rules={[
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const start = getFieldValue('activeFrom');
                            if (!start || !value) return Promise.resolve();
                            if (dayjs(value).isBefore(dayjs(start))) {
                              return Promise.reject(new Error('失效时间不能早于生效时间'));
                            }
                            return Promise.resolve();
                          },
                        }),
                      ]}
                    >
                      <DatePicker showTime style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item name="maxBackfillPeriods" label="允许补发周期数">
                      <InputNumber min={0} max={365} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item name="allowLate" label="允许延期" valuePropName="checked">
                  <Switch checkedChildren="允许" unCheckedChildren="不允许" />
                </Form.Item>
              </Card>

              <Card size="small" title="分配范围" style={{ marginBottom: 16 }}>
                <Form.Item
                  name="assigneeMode"
                  label="分配模式"
                  dependencies={['taskType']}
                  rules={[
                    { required: true, message: '请选择分配模式' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (getFieldValue('taskType') === 'COLLECTION' && value !== 'BY_COLLECTION_POINT') {
                          return Promise.reject(new Error('采集任务需要绑定采集点'));
                        }
                        return Promise.resolve();
                      },
                    }),
                  ]}
                >
                  <Select
                    onChange={handleAssigneeModeChange}
                    optionLabelProp="label"
                    options={ASSIGNEE_MODE_OPTIONS.map((m) => ({
                      value: m.value,
                      label: m.label,
                      description: m.description,
                    }))}
                    optionRender={(option) => (
                      <div>
                        <div>{option.data.label}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {option.data.description}
                        </Text>
                      </div>
                    )}
                  />
                </Form.Item>

                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.taskType !== cur.taskType || prev.assigneeMode !== cur.assigneeMode}>
                  {({ getFieldValue }) => {
                    if (getFieldValue('taskType') === 'COLLECTION' && getFieldValue('assigneeMode') !== 'BY_COLLECTION_POINT') {
                      return (
                        <Alert
                          type="warning"
                          showIcon
                          message="采集任务需要绑定采集点，建议选择“按采集点负责人”"
                          style={{ marginBottom: 12 }}
                        />
                      );
                    }
                    return null;
                  }}
                </Form.Item>

                <Form.Item noStyle shouldUpdate={(prev, cur) => prev.assigneeMode !== cur.assigneeMode}>
                  {({ getFieldValue }) => {
                    const mode = getFieldValue('assigneeMode');

                    if (mode === 'MANUAL') {
                      return (
                        <Form.Item
                          name="assigneeIds"
                          label="指定业务员"
                          rules={[{ required: true, message: '请选择至少一名业务员' }]}
                        >
                          <Select
                            mode="multiple"
                            placeholder="搜索并选择业务员"
                            loading={usersLoading}
                            showSearch
                            optionFilterProp="label"
                            maxTagCount={5}
                            options={users.map((u) => ({
                              value: u.id,
                              label: `${u.name} (${u.department?.name || '未分配部门'})`,
                            }))}
                          />
                        </Form.Item>
                      );
                    }

                    if (mode === 'BY_COLLECTION_POINT') {
                      return (
                        <>
                          <Form.Item label="采集点范围">
                            <Segmented
                              value={pointScope}
                              onChange={(value) => handlePointScopeChange(value as 'TYPE' | 'POINTS')}
                              options={[
                                { label: '按类型', value: 'TYPE' },
                                { label: '按采集点', value: 'POINTS' },
                              ]}
                            />
                          </Form.Item>

                          {pointScope === 'TYPE' && (
                            <Form.Item
                              name="targetPointType"
                              label="目标采集点类型"
                              rules={[{ required: true, message: '请选择采集点类型' }]}
                              extra="选择后将自动为该类型所有采集点的负责人创建任务"
                            >
                              <Select
                                allowClear
                                placeholder="选择采集点类型"
                                options={POINT_TYPE_OPTIONS.map((t) => ({
                                  value: t.value,
                                  label: `${t.icon} ${t.label}`,
                                }))}
                              />
                            </Form.Item>
                          )}

                          {pointScope === 'POINTS' && (
                            <Form.Item
                              name="collectionPointIds"
                              label="指定采集点"
                              rules={[{ required: true, message: '请选择采集点' }]}
                              extra="将为这些采集点的负责人生成任务，并绑定到具体采集点"
                            >
                              <Select
                                mode="multiple"
                                placeholder="搜索并选择采集点"
                                loading={pointsLoading}
                                showSearch
                                optionFilterProp="label"
                                maxTagCount={5}
                                options={collectionPointOptions}
                              />
                            </Form.Item>
                          )}

                          <Alert
                            type="info"
                            showIcon
                            message="采集类任务会绑定采集点，便于后续填报、统计和追溯"
                          />
                        </>
                      );
                    }

                    if (mode === 'BY_DEPARTMENT') {
                      return (
                        <Form.Item
                          name="departmentIds"
                          label={
                            <Space>
                              <ApartmentOutlined />
                              <span>选择部门</span>
                            </Space>
                          }
                          rules={[{ required: true, message: '请选择至少一个部门' }]}
                          extra="将为所选部门的所有成员创建任务"
                        >
                          <OrgDeptTreeSelect
                            mode="dept"
                            multiple
                            showUserCount
                            placeholder="选择目标部门"
                          />
                        </Form.Item>
                      );
                    }

                    if (mode === 'BY_ORGANIZATION') {
                      return (
                        <Form.Item
                          name="organizationIds"
                          label={
                            <Space>
                              <BankOutlined />
                              <span>选择组织</span>
                            </Space>
                          }
                          rules={[{ required: true, message: '请选择至少一个组织' }]}
                          extra="将为所选组织的所有成员创建任务"
                        >
                          <OrgDeptTreeSelect
                            mode="org"
                            multiple
                            showUserCount
                            placeholder="选择目标组织"
                          />
                        </Form.Item>
                      );
                    }

                    return null;
                  }}
                </Form.Item>

                <Form.Item name="isActive" label="启用状态" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                </Form.Item>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" title="使用说明" style={{ position: 'sticky', top: 0 }}>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="建议先配置模板，再预览分发结果"
                  />
                  <div>
                    <Text strong>1. 任务类型</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">采集任务必须绑定采集点；报告类任务适合按部门/组织；核实任务建议优先级设为高或紧急。</Text>
                    </div>
                  </div>
                  <div>
                    <Text strong>2. 周期配置</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">每日/每周/每月/一次性。周/月任务需设置分发日与截止日，截止日不能早于分发日。</Text>
                    </div>
                  </div>
                  <div>
                    <Text strong>3. 高级配置</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">生效/失效时间控制模板周期，允许补发用于补齐历史周期，允许延期用于特殊情况延长截止。</Text>
                    </div>
                  </div>
                  <div>
                    <Text strong>4. 分配范围</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">按采集点负责人支持“按类型/按采集点”两种方式；按部门/组织会给所有成员生成任务。</Text>
                    </div>
                  </div>
                  <div>
                    <Text strong>5. 预览分发</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary">预览可查看将生成的任务数与未分配采集点，确认无误后执行。</Text>
                    </div>
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
        </Form>
        </div>
      </Modal>
      <DistributionPreview
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        data={previewData}
        onExecute={() => currentTemplateId && handleExecute(currentTemplateId)}
        executing={executeTemplate.isPending}
      />
    </div>
  );
};

export default TaskTemplateManager;

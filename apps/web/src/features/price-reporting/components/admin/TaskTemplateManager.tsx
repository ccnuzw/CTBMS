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
  message,
  Popconfirm,
  Tooltip,
  Row,
  Col,
  Typography,
  Divider,
  Badge,
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
} from '@ant-design/icons';
import {
  useTaskTemplates,
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  useDeleteTaskTemplate,
  useExecuteTaskTemplate,
  CreateTaskTemplateDto,
  TaskTemplate,
} from '../../api/hooks';

const { Text, Title } = Typography;
const { TextArea } = Input;

// 任务类型选项
const TASK_TYPE_OPTIONS = [
  { value: 'PRICE_COLLECTION', label: '价格采集', color: 'blue' },
  { value: 'INVENTORY_CHECK', label: '库存盘点', color: 'green' },
  { value: 'DAILY_REPORT', label: '市场日报', color: 'orange' },
  { value: 'FIELD_VISIT', label: '实地走访', color: 'purple' },
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
  { value: 'BY_COLLECTION_POINT', label: '按采集点负责人', description: '自动分配给采集点的负责人' },
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
  const [form] = Form.useForm();

  // 数据查询
  const { data: templates, isLoading } = useTaskTemplates();
  const createTemplate = useCreateTaskTemplate();
  const updateTemplate = useUpdateTaskTemplate();
  const deleteTemplate = useDeleteTaskTemplate();
  const executeTemplate = useExecuteTaskTemplate();

  // 打开创建/编辑模态框
  const handleOpenModal = (template?: TaskTemplate) => {
    if (template) {
      setEditingTemplate(template);
      form.setFieldsValue({
        ...template,
        runAtHour: Math.floor(template.runAtMinute / 60),
        runAtMin: template.runAtMinute % 60,
        dueAtHour: Math.floor(template.dueAtMinute / 60),
        dueAtMin: template.dueAtMinute % 60,
      });
    } else {
      setEditingTemplate(null);
      form.resetFields();
      form.setFieldsValue({
        priority: 'MEDIUM',
        cycleType: 'DAILY',
        assigneeMode: 'BY_COLLECTION_POINT',
        deadlineOffset: 10,
        runAtHour: 8,
        runAtMin: 0,
        dueAtHour: 18,
        dueAtMin: 0,
        isActive: true,
      });
    }
    setModalVisible(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const dto: CreateTaskTemplateDto = {
        ...values,
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
    } catch (err: any) {
      message.error(err.response?.data?.message || '执行失败');
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
        if (record.targetPointType) {
          const info = getPointTypeInfo(record.targetPointType);
          return (
            <Space>
              <EnvironmentOutlined />
              <span>{info.icon} {info.label}类采集点</span>
            </Space>
          );
        }
        if (record.assigneeMode === 'BY_COLLECTION_POINT') {
          return (
            <Space>
              <TeamOutlined />
              <span>按采集点负责人</span>
            </Space>
          );
        }
        return <Text type="secondary">手动指定</Text>;
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

      {/* 创建/编辑模态框 */}
      <Modal
        title={editingTemplate ? '编辑任务模板' : '新建任务模板'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={640}
        confirmLoading={createTemplate.isPending || updateTemplate.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="如：每日港口价格采集" />
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

          <Divider>周期配置</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="cycleType"
                label="执行周期"
                rules={[{ required: true, message: '请选择周期' }]}
              >
                <Select
                  options={CYCLE_TYPE_OPTIONS.map((c) => ({
                    value: c.value,
                    label: (
                      <div>
                        <div>{c.label}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>{c.description}</Text>
                      </div>
                    ),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deadlineOffset" label="截止偏移（小时）">
                <InputNumber min={1} max={72} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

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

          <Divider>分配范围</Divider>

          <Form.Item
            name="targetPointType"
            label="目标采集点类型"
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

          <Form.Item name="isActive" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskTemplateManager;

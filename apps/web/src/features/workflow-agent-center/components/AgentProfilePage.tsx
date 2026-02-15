import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  App,
  Button,
  Card,
  Collapse,
  Drawer,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Tooltip,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import {
  AgentMemoryPolicy,
  AgentProfileDto,
  AgentRoleType,
  CreateAgentProfileDto,
} from '@packages/types';
import { useSearchParams, Link } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import {
  useAgentProfiles,
  useAgentPromptTemplates,
  useCreateAgentProfile,
  useDeleteAgentProfile,
  usePublishAgentProfile,
  useUpdateAgentProfile,
} from '../api';
import { useAIConfigs } from '../../system-config/api';
import {
  AGENT_ROLE_OPTIONS,
  getAgentDisplayName,
  getAgentRoleLabel,
  getMemoryPolicyLabel,
  getAgentStatusLabel,
  getTemplateSourceLabel,
} from '../constants';
import { GuardrailsForm, RetryPolicyForm, ToolPolicyForm } from './index';
import { AgentPromptTemplateCreateDrawer } from './AgentPromptTemplateCreateDrawer';


const { Title } = Typography;

const memoryOptions: AgentMemoryPolicy[] = ['none', 'short-term', 'windowed'];

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

const slugifyAgentCode = (name?: string): string => {
  const normalized = (name || '')
    .trim()
    .toUpperCase()
    .replace(/[\s/\\]+/g, '_')
    .replace(/[^\w-]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) {
    return '';
  }
  return normalized.endsWith('_V1') ? normalized : `${normalized}_V1`;
};

const defaultOutputSchemaByRole = (role?: AgentRoleType): string => {
  const normalized = (role || 'ANALYST').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${normalized}_output_v1`;
};

type CreateAgentProfileFormValues = Omit<
  CreateAgentProfileDto,
  'toolPolicy' | 'guardrails' | 'retryPolicy'
> & {
  toolPolicy: Record<string, unknown>;
  guardrails: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
};

export const AgentProfilePage: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreateAgentProfileFormValues>();
  const [editForm] = Form.useForm<{
    agentName: string;
    modelConfigKey: string;
    agentPromptCode: string;
    timeoutMs: number;
    isActive: boolean;
    toolPolicy: Record<string, unknown>;
    guardrails: Record<string, unknown>;
    retryPolicy: Record<string, unknown>;
  }>();
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
  const [visible, setVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [promptCreateVisible, setPromptCreateVisible] = useState(false);
  const [isAgentCodeCustomized, setIsAgentCodeCustomized] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentProfileDto | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentProfileDto | null>(null);
  const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));
  const agentTableContainerRef = React.useRef<HTMLDivElement | null>(null);

  const { data: aiConfigs } = useAIConfigs();
  const { data: promptTemplates } = useAgentPromptTemplates({
    page: 1,
    pageSize: 100,
    isActive: true,
    includePublic: true,
  });

  const promptOptions = useMemo(() => {
    return (promptTemplates?.data || []).map((t) => ({
      label: `${t.name} (${t.promptCode})`,
      value: t.promptCode,
    }));
  }, [promptTemplates]);

  // Handle successful prompt creation
  const handlePromptCreated = (newPromptCode: string) => {
    // If we are in create mode
    if (visible) {
      form.setFieldsValue({ agentPromptCode: newPromptCode });
    }
    // If we are in edit mode
    if (editVisible) {
      editForm.setFieldsValue({ agentPromptCode: newPromptCode });
    }
  };


  const { data, isLoading } = useAgentProfiles({
    includePublic: true,
    keyword,
    isActive: isActiveFilter,
    page,
    pageSize,
  });

  const normalizedKeyword = keyword?.trim().toLowerCase() || '';
  const highlightedAgentId = useMemo(() => {
    if (!normalizedKeyword) {
      return null;
    }
    const rows = data?.data || [];
    const exactMatch = rows.find(
      (item) => item.agentCode.trim().toLowerCase() === normalizedKeyword,
    );
    if (exactMatch) {
      return exactMatch.id;
    }
    const fuzzyMatch = rows.find((item) => {
      const code = item.agentCode.trim().toLowerCase();
      const name = item.agentName.trim().toLowerCase();
      const displayName = getAgentDisplayName(item.agentName, item.agentCode).trim().toLowerCase();
      return (
        code.includes(normalizedKeyword) ||
        name.includes(normalizedKeyword) ||
        displayName.includes(normalizedKeyword)
      );
    });
    return fuzzyMatch?.id || null;
  }, [data?.data, normalizedKeyword]);

  const createMutation = useCreateAgentProfile();
  const publishMutation = usePublishAgentProfile();
  const deleteMutation = useDeleteAgentProfile();
  const updateMutation = useUpdateAgentProfile();

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

  React.useEffect(() => {
    if (!highlightedAgentId || !agentTableContainerRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      const row = agentTableContainerRef.current?.querySelector<HTMLElement>(
        `tr[data-row-key="${highlightedAgentId}"]`,
      );
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [highlightedAgentId]);

  React.useEffect(() => {
    if (!visible) {
      setIsAgentCodeCustomized(false);
    }
  }, [visible]);

  const columns = useMemo<ColumnsType<AgentProfileDto>>(
    () => [
      {
        title: '名称',
        dataIndex: 'agentName',
        width: 180,
        render: (_: string, record) => getAgentDisplayName(record.agentName, record.agentCode),
      },
      {
        title: '角色',
        dataIndex: 'roleType',
        width: 140,
        render: (v: AgentRoleType) => <Tag>{getAgentRoleLabel(v)}</Tag>,
      },
      { title: '模型配置Key', dataIndex: 'modelConfigKey', width: 160 },
      {
        title: '提示词编码',
        dataIndex: 'agentPromptCode',
        width: 180,
        render: (code: string) => (code ? <Link to={`/workflow/prompts?keyword=${code}`}>{code}</Link> : '-'),
      },
      { title: '版本', dataIndex: 'version', width: 80 },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 90,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{getAgentStatusLabel(value)}</Tag>
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
        width: 160,
        render: (_, record) => (
          <Space size={4}>
            <Button type="link" onClick={() => setSelectedAgent(record)}>
              详情
            </Button>
            <Button
              type="link"
              onClick={() => {
                setEditingAgent(record);
                editForm.setFieldsValue({
                  agentName: record.agentName,
                  modelConfigKey: record.modelConfigKey,
                  agentPromptCode: record.agentPromptCode,
                  timeoutMs: record.timeoutMs,
                  isActive: record.isActive,
                  toolPolicy: (record.toolPolicy || {}) as any,
                  guardrails: (record.guardrails || {}) as any,
                  retryPolicy: (record.retryPolicy || {}) as any,
                });
                setEditVisible(true);
              }}
            >
              编辑
            </Button>
            <Button
              type="link"
              onClick={async () => {
                try {
                  await publishMutation.mutateAsync(record.id);
                  message.success('发布成功');
                } catch (error) {
                  message.error(getErrorMessage(error) || '发布失败');
                }
              }}
            >
              发布
            </Button>
            <Popconfirm
              title="确认停用该智能体?"
              onConfirm={async () => {
                try {
                  await deleteMutation.mutateAsync(record.id);
                  message.success('停用成功');
                } catch (error) {
                  message.error(getErrorMessage(error) || '停用失败');
                }
              }}
            >
              <Button type="link" danger>
                停用
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteMutation, editForm, message, publishMutation],
  );

  const handleEdit = async () => {
    if (!editingAgent) {
      return;
    }

    try {
      const values = await editForm.validateFields();

      await updateMutation.mutateAsync({
        id: editingAgent.id,
        payload: {
          agentName: values.agentName,
          modelConfigKey: values.modelConfigKey,
          agentPromptCode: values.agentPromptCode,
          timeoutMs: values.timeoutMs,
          isActive: values.isActive,
          toolPolicy: values.toolPolicy,
          guardrails: values.guardrails,
          retryPolicy: values.retryPolicy,
        },
      });
      message.success('更新成功');
      setEditVisible(false);
      setEditingAgent(null);
    } catch (error) {
      message.error(getErrorMessage(error) || '更新失败');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();

      const payload: CreateAgentProfileDto = {
        agentCode: values.agentCode,
        agentName: values.agentName,
        roleType: values.roleType,
        objective: values.objective,
        modelConfigKey: values.modelConfigKey,
        agentPromptCode: values.agentPromptCode,
        memoryPolicy: values.memoryPolicy,
        outputSchemaCode: values.outputSchemaCode,
        timeoutMs: values.timeoutMs,
        templateSource: values.templateSource,
        toolPolicy: values.toolPolicy,
        guardrails: values.guardrails,
        retryPolicy: values.retryPolicy,
      };
      await createMutation.mutateAsync(payload);
      message.success('创建成功');
      setVisible(false);
      form.resetFields();
    } catch (error) {
      message.error(getErrorMessage(error) || '创建失败');
    }
  };

  const modelConfigOptions = React.useMemo(() => {
    return aiConfigs?.map((config) => ({
      label: config.isDefault ? `${config.configKey} (默认)` : config.configKey,
      value: config.configKey,
    })) || [];
  }, [aiConfigs]);

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            智能体管理中心
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
              placeholder="状态筛选"
              style={{ width: 140 }}
              options={[
                { label: '启用', value: true },
                { label: '停用', value: false },
              ]}
              value={isActiveFilter}
              onChange={(value) => {
                setIsActiveFilter(value);
                setPage(1);
              }}
            />
            <Button
              type="primary"
              onClick={() => {
                setVisible(true);
                setIsAgentCodeCustomized(false);
              }}
            >
              新建智能体
            </Button>
          </Space>
        </Space>

        <div ref={agentTableContainerRef}>
          <Table<AgentProfileDto>
            rowKey="id"
            loading={isLoading}
            dataSource={data?.data ?? []}
            columns={columns}
            onRow={(record) =>
              record.id === highlightedAgentId
                ? {
                  style: {
                    backgroundColor: '#fffbe6',
                  },
                }
                : {}
            }
            scroll={{ x: 1300 }}
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
        title="新建智能体"
        open={visible}
        onCancel={() => {
          setVisible(false);
          setIsAgentCodeCustomized(false);
        }}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        width={760}
      >
        <Form<CreateAgentProfileFormValues>
          layout="vertical"
          form={form}
          initialValues={{
            roleType: 'ANALYST',
            outputSchemaCode: defaultOutputSchemaByRole('ANALYST'),
            memoryPolicy: 'none',
            timeoutMs: 30000,
            templateSource: 'PRIVATE',
            toolPolicy: {},
            guardrails: { requireEvidence: true, noHallucination: true },
            retryPolicy: { retryCount: 1, retryBackoffMs: 2000 },
          }}
          onValuesChange={(changedValues, allValues) => {
            const changedName = changedValues.agentName as string | undefined;
            if (changedName !== undefined && !isAgentCodeCustomized) {
              const generatedCode = slugifyAgentCode(changedName);
              form.setFieldsValue({ agentCode: generatedCode || undefined });
            }

            const changedAgentCode = changedValues.agentCode as string | undefined;
            if (changedAgentCode !== undefined) {
              const generatedCode = slugifyAgentCode(allValues.agentName as string | undefined);
              const normalized = changedAgentCode.trim();
              if (!normalized) {
                setIsAgentCodeCustomized(false);
              } else {
                setIsAgentCodeCustomized(Boolean(generatedCode && normalized !== generatedCode));
              }
            }

            const changedRoleType = changedValues.roleType as AgentRoleType | undefined;
            if (changedRoleType !== undefined) {
              const currentSchema = form.getFieldValue('outputSchemaCode') as string | undefined;
              const currentSchemaNormalized = currentSchema?.trim();
              const defaultSchema = defaultOutputSchemaByRole(allValues.roleType as AgentRoleType | undefined);
              if (!currentSchemaNormalized || currentSchemaNormalized.endsWith('_output_v1')) {
                form.setFieldsValue({ outputSchemaCode: defaultSchema });
              }
            }
          }}
        >
          <Form.Item name="agentCode" label="编码" rules={[{ required: true }]}>
            <Input
              placeholder="如 MARKET_ANALYST_V1"
              addonAfter={(
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    const generatedCode = slugifyAgentCode(form.getFieldValue('agentName'));
                    form.setFieldsValue({ agentCode: generatedCode || undefined });
                    setIsAgentCodeCustomized(false);
                  }}
                >
                  自动生成
                </Button>
              )}
            />
          </Form.Item>
          <Form.Item name="agentName" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="roleType" label="角色" rules={[{ required: true }]}>
            <Select
              options={AGENT_ROLE_OPTIONS.map((item) => ({ label: getAgentRoleLabel(item), value: item }))}
            />
          </Form.Item>
          <Form.Item name="objective" label="目标">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="modelConfigKey" label="模型配置Key" rules={[{ required: true }]}>
            <Select
              options={modelConfigOptions}
              placeholder="选择 AI 模型配置"
              showSearch
            />
          </Form.Item>
          <Form.Item label="提示词编码" required>
            <Space style={{ display: 'flex' }} align="start">
              <Form.Item
                name="agentPromptCode"
                rules={[{ required: true }]}
                noStyle
              >
                <Select
                  showSearch
                  placeholder="选择提示词模板"
                  options={promptOptions}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                    (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: 440 }}
                />
              </Form.Item>
              <Tooltip title="新建提示词模板">
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setPromptCreateVisible(true)}
                />
              </Tooltip>
            </Space>
          </Form.Item>
          <Form.Item name="outputSchemaCode" label="输出 Schema 编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Collapse
            size="small"
            items={[
              {
                key: 'advanced-agent',
                label: '高级设置（记忆、超时、工具与防护）',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={0}>
                    <Form.Item name="memoryPolicy" label="记忆策略" rules={[{ required: true }]}>
                      <Select options={memoryOptions.map((item) => ({ label: getMemoryPolicyLabel(item), value: item }))} />
                    </Form.Item>
                    <Form.Item name="timeoutMs" label="超时(ms)" rules={[{ required: true }]}>
                      <InputNumber min={1000} max={120000} style={{ width: '100%' }} />
                    </Form.Item>
                    <ToolPolicyForm name="toolPolicy" />
                    <GuardrailsForm name="guardrails" />
                    <RetryPolicyForm name="retryPolicy" />
                    <Form.Item name="templateSource" label="模板来源" rules={[{ required: true }]}>
                      <Select
                        options={[
                          { label: '私有', value: 'PRIVATE' },
                          { label: '公共', value: 'PUBLIC' },
                        ]}
                      />
                    </Form.Item>
                  </Space>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      <Modal
        title={`编辑智能体 - ${editingAgent?.agentCode || ''}`}
        open={editVisible}
        onCancel={() => {
          setEditVisible(false);
          setEditingAgent(null);
        }}
        onOk={handleEdit}
        confirmLoading={updateMutation.isPending}
      >
        <Form layout="vertical" form={editForm}>
          <Form.Item name="agentName" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="modelConfigKey" label="模型配置Key" rules={[{ required: true }]}>
            <Select
              options={modelConfigOptions}
              placeholder="选择 AI 模型配置"
              showSearch
            />
          </Form.Item>
          <Form.Item label="提示词编码" required>
            <Space style={{ display: 'flex' }} align="start">
              <Form.Item
                name="agentPromptCode"
                rules={[{ required: true }]}
                noStyle
              >
                <Select
                  showSearch
                  placeholder="选择提示词模板"
                  options={promptOptions}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                    (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: 440 }}
                />
              </Form.Item>
              <Tooltip title="新建提示词模板">
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setPromptCreateVisible(true)}
                />
              </Tooltip>
            </Space>
          </Form.Item>
          <Form.Item name="timeoutMs" label="超时(ms)" rules={[{ required: true }]}>
            <InputNumber min={1000} max={120000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isActive" label="是否启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <ToolPolicyForm name="toolPolicy" />
          <GuardrailsForm name="guardrails" />
          <RetryPolicyForm name="retryPolicy" />
        </Form>
      </Modal>
      <Drawer
        title="智能体详情"
        width={1000}
        open={Boolean(selectedAgent)}
        onClose={() => setSelectedAgent(null)}
      >
        <Descriptions
          bordered
          size="small"
          column={2}
          items={[
            { key: 'code', label: '编码', children: selectedAgent?.agentCode || '-' },
            {
              key: 'name',
              label: '名称',
              children: getAgentDisplayName(selectedAgent?.agentName, selectedAgent?.agentCode),
            },
            { key: 'role', label: '角色', children: getAgentRoleLabel(selectedAgent?.roleType) },
            { key: 'model', label: '模型配置Key', children: selectedAgent?.modelConfigKey || '-' },
            {
              key: 'prompt',
              label: '提示词编码',
              children: selectedAgent?.agentPromptCode ? (
                <Link to={`/workflow/prompts?keyword=${selectedAgent.agentPromptCode}`}>
                  {selectedAgent.agentPromptCode}
                </Link>
              ) : (
                '-'
              ),
            },
            {
              key: 'schema',
              label: '输出 Schema',
              children: selectedAgent?.outputSchemaCode || '-',
            },
            {
              key: 'memory',
              label: '记忆策略',
              children: getMemoryPolicyLabel(selectedAgent?.memoryPolicy),
            },
            { key: 'timeout', label: '超时(ms)', children: selectedAgent?.timeoutMs ?? '-' },
            { key: 'version', label: '版本', children: selectedAgent?.version ?? '-' },
            {
              key: 'source',
              label: '模板来源',
              children: getTemplateSourceLabel(selectedAgent?.templateSource),
            },
            {
              key: 'status',
              label: '状态',
              children: selectedAgent ? (
                <Tag color={selectedAgent.isActive ? 'green' : 'red'}>
                  {getAgentStatusLabel(selectedAgent.isActive)}
                </Tag>
              ) : (
                '-'
              ),
            },
            {
              key: 'objective',
              label: '目标',
              span: 2,
              children: selectedAgent?.objective || '-',
            },
            {
              key: 'toolPolicy',
              label: '工具策略',
              span: 2,
              children: (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {selectedAgent?.toolPolicy
                    ? JSON.stringify(selectedAgent.toolPolicy, null, 2)
                    : '-'}
                </pre>
              ),
            },
            {
              key: 'guardrails',
              label: '防护规则',
              span: 2,
              children: (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {selectedAgent?.guardrails
                    ? JSON.stringify(selectedAgent.guardrails, null, 2)
                    : '-'}
                </pre>
              ),
            },
          ]}
        />
      </Drawer>


      <AgentPromptTemplateCreateDrawer
        open={promptCreateVisible}
        onClose={() => setPromptCreateVisible(false)}
        onSuccess={handlePromptCreated}
      />
    </Card >
  );
};

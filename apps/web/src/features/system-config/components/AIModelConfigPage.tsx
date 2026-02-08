import { PageContainer, ProTable, ActionType, ProColumns, ModalForm, ProFormText, ProFormSelect, ProFormDigit, ProFormSwitch, ProFormDependency, ProFormTextArea, ProFormInstance } from '@ant-design/pro-components';
import { Card, App, Alert, Space, Button, Modal, Tag, Typography, Tooltip, Badge, Divider, Checkbox } from 'antd';
import { useAIConfigs, useUpdateAIConfig, useDeleteAIConfig, useTestAIConnection, useFetchAIModels, useTestAIModel } from '../api';
import { useRef, useState } from 'react';
import { PlusOutlined, DeleteOutlined, EditOutlined, ApiOutlined, ReloadOutlined, CheckCircleFilled } from '@ant-design/icons';
import { AIModelConfig } from '../types';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Text } = Typography;

export const AIModelConfigPage = () => {
    const { message, modal } = App.useApp();
    const actionRef = useRef<ActionType>();
    const { data: configs, isLoading } = useAIConfigs(true);
    const updateMutation = useUpdateAIConfig();
    const deleteMutation = useDeleteAIConfig();
    const testConnectionMutation = useTestAIConnection();
    const fetchModelsMutation = useFetchAIModels();
    const testModelMutation = useTestAIModel();

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<Partial<AIModelConfig> | undefined>(undefined);
    const [fetchedModels, setFetchedModels] = useState<string[]>([]);
    const [selectedFetchedModels, setSelectedFetchedModels] = useState<string[]>([]);
    const [fetchDiagnostics, setFetchDiagnostics] = useState<Array<{ provider: string; message: string; activeUrl?: string }>>([]);
    const [fetchRecommendation, setFetchRecommendation] = useState<string | undefined>(undefined);
    const [fetchRecommendationPatch, setFetchRecommendationPatch] = useState<Partial<AIModelConfig> | undefined>(undefined);
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();
    const formRef = useRef<ProFormInstance>();

    const templateOptions = [
        { label: 'OpenAI 官方', value: 'openai_official' },
        { label: 'OpenAI 兼容中转', value: 'openai_proxy' },
        { label: 'Gemini 官方', value: 'gemini_official' },
        { label: 'Gemini 代理/中转', value: 'gemini_proxy' },
    ];

    const templateMap: Record<string, Partial<AIModelConfig>> = {
        openai_official: {
            provider: 'openai',
            apiUrl: 'https://api.openai.com/v1',
            authType: 'bearer',
            modelFetchMode: 'official',
            allowUrlProbe: true,
        },
        openai_proxy: {
            provider: 'openai',
            apiUrl: 'https://your-proxy.example.com/v1',
            authType: 'bearer',
            modelFetchMode: 'official',
            allowUrlProbe: true,
        },
        gemini_official: {
            provider: 'google',
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
            authType: 'api-key',
            modelFetchMode: 'official',
            allowUrlProbe: false,
        },
        gemini_proxy: {
            provider: 'google',
            apiUrl: 'https://your-proxy.example.com/v1beta',
            authType: 'api-key',
            modelFetchMode: 'official',
            allowUrlProbe: false,
        },
    };

    const formatJsonField = (value?: Record<string, string> | string) => {
        if (!value) return undefined;
        if (typeof value === 'string') return value;
        return JSON.stringify(value, null, 2);
    };

    const parseJsonField = (value: unknown, label: string) => {
        if (value === undefined || value === null || value === '') return undefined;
        if (typeof value === 'object') return value as Record<string, string>;
        if (typeof value === 'string') {
            try {
                return JSON.parse(value) as Record<string, string>;
            } catch (error) {
                message.error(`${label} 必须是合法 JSON`);
                throw error;
            }
        }
        return undefined;
    };

    const applyTemplate = (templateKey: string | undefined, form: ProFormInstance) => {
        if (!templateKey) return;
        const template = templateMap[templateKey];
        if (!template) return;

        form.setFieldsValue({
            provider: template.provider,
            apiUrl: template.apiUrl,
            authType: template.authType,
            modelFetchMode: template.modelFetchMode,
            allowUrlProbe: template.allowUrlProbe,
            headers: formatJsonField(template.headers as Record<string, string> | string),
            queryParams: formatJsonField(template.queryParams as Record<string, string> | string),
            pathOverrides: formatJsonField(template.pathOverrides as Record<string, string> | string),
        });
    };

    const handleEdit = (record: AIModelConfig) => {
        setCurrentRow({
            ...record,
            headers: formatJsonField(record.headers as Record<string, string> | string),
            queryParams: formatJsonField(record.queryParams as Record<string, string> | string),
            pathOverrides: formatJsonField(record.pathOverrides as Record<string, string> | string),
        });
        setEditModalVisible(true);
        setFetchedModels([]);
        setSelectedFetchedModels([]);
        setFetchDiagnostics([]);
        setFetchRecommendation(undefined);
        setFetchRecommendationPatch(undefined);
    };

    const handleAdd = () => {
        setCurrentRow({
            isActive: true,
            isDefault: false,
            provider: 'openai',
            authType: 'bearer',
            modelFetchMode: 'official',
            allowUrlProbe: true,
            temperature: 0.3,
            maxTokens: 8192,
            maxRetries: 3,
            timeoutMs: 30000,
            availableModels: []
        });
        setEditModalVisible(true);
        setFetchedModels([]);
        setSelectedFetchedModels([]);
        setFetchDiagnostics([]);
        setFetchRecommendation(undefined);
        setFetchRecommendationPatch(undefined);
    };

    const handleDelete = async (key: string) => {
        if (key === 'DEFAULT') {
            message.warning('默认配置 (DEFAULT) 不可删除');
            return;
        }

        const config = configs?.find(c => c.configKey === key);
        if (config?.isDefault) {
             message.warning('当前默认配置不可删除，请先设置其他配置为默认');
             return;
        }

        modal.confirm({
            title: '确认删除?',
            content: `确定要删除配置 "${key}" 吗？此操作不可恢复。`,
            onOk: async () => {
                try {
                    await deleteMutation.mutateAsync(key);
                    message.success('删除成功');
                    actionRef.current?.reload();
                } catch (error) {
                    message.error('删除失败');
                }
            }
        });
    };

    const handleFinish = async (values: any) => {
        try {
            // Include id if editing
            const { __template, showAdvanced, ...restValues } = values;
            const payload = {
                ...restValues,
                headers: parseJsonField(values.headers, 'Headers'),
                queryParams: parseJsonField(values.queryParams, 'Query Params'),
                pathOverrides: parseJsonField(values.pathOverrides, 'Path Overrides'),
            };
            if (currentRow?.id) {
                payload.id = currentRow.id;
            }

            await updateMutation.mutateAsync(payload);
            message.success('配置已保存');
            setEditModalVisible(false);
            actionRef.current?.reload();
            return true;
        } catch (error) {
            message.error('保存失败');
            return false;
        }
    };

    const handleFetchModels = async (form: any) => {
        const provider = form.getFieldValue('provider');
        const configKey = form.getFieldValue('configKey');
        const apiKey = form.getFieldValue('apiKey');
        const apiUrl = form.getFieldValue('apiUrl');
        if (!apiKey && !currentRow?.id) {
            message.warning('请填写 API Key 以获取模型列表');
            return;
        }

        const hide = message.loading('正在获取模型列表...', 0);
        try {
            const result = await fetchModelsMutation.mutateAsync({
                provider,
                apiKey,
                apiUrl,
                configKey,
            });

            const models = result.models || [];

            // Auto-update URL if corrected
            if (result.activeUrl && result.activeUrl !== apiUrl) {
                form.setFieldValue('apiUrl', result.activeUrl);
                message.info(`已自动修正 API 地址为: ${result.activeUrl}`);
            }

            setFetchedModels(models);
            setSelectedFetchedModels([]);
            setFetchDiagnostics(result.diagnostics || []);
            setFetchRecommendation(undefined);
            setFetchRecommendationPatch(undefined);

            if (result.provider && result.provider !== provider) {
                const nextAuthType = result.provider === 'openai' ? 'bearer' : 'api-key';
                const patch: Partial<AIModelConfig> = {
                    provider: result.provider,
                    authType: nextAuthType,
                };
                if (result.activeUrl && result.activeUrl !== apiUrl) {
                    patch.apiUrl = result.activeUrl;
                }
                setFetchRecommendation(`建议切换为 ${result.provider} 模式${patch.apiUrl ? '，并使用推荐的 API 地址' : ''}`);
                setFetchRecommendationPatch(patch);
            } else if (result.activeUrl && result.activeUrl !== apiUrl) {
                setFetchRecommendation('建议更新 API 地址为自动探测到的可用地址');
                setFetchRecommendationPatch({ apiUrl: result.activeUrl });
            }

            if (result.provider && result.provider !== provider) {
                message.info(`已使用 ${result.provider} 模式获取模型列表`);
            }
            message.success(`成功获取 ${models.length} 个模型，请从列表选择添加`);
        } catch (error: any) {
            message.error(`获取失败: ${error.message}`);
        } finally {
            hide();
        }
    };

    const handleAddSelectedModels = () => {
        const form = formRef.current;
        if (!form) return;
        if (selectedFetchedModels.length === 0) {
            message.warning('请先选择要添加的模型');
            return;
        }
        const currentAvailable = form.getFieldValue('availableModels') || [];
        const merged = [...new Set([...currentAvailable, ...selectedFetchedModels])].sort();
        form.setFieldValue('availableModels', merged);
        message.success(`已添加 ${selectedFetchedModels.length} 个模型到可用列表`);
    };

    const handleAddAllModels = () => {
        const form = formRef.current;
        if (!form) return;
        if (fetchedModels.length === 0) {
            message.warning('暂无可添加的模型');
            return;
        }
        const currentAvailable = form.getFieldValue('availableModels') || [];
        const merged = [...new Set([...currentAvailable, ...fetchedModels])].sort();
        form.setFieldValue('availableModels', merged);
        message.success(`已添加全部 ${fetchedModels.length} 个模型到可用列表`);
    };

    const handleTestSelectedModel = async () => {
        const form = formRef.current;
        if (!form) return;
        const modelName = selectedFetchedModels[0];
        if (!modelName) {
            message.warning('请先选择一个模型进行测试');
            return;
        }

        try {
            const values = form.getFieldsValue();
            const payload = {
                provider: values.provider,
                modelName,
                apiKey: values.apiKey,
                apiUrl: values.apiUrl,
                authType: values.authType,
                headers: parseJsonField(values.headers, 'Headers'),
                queryParams: parseJsonField(values.queryParams, 'Query Params'),
                pathOverrides: parseJsonField(values.pathOverrides, 'Path Overrides'),
                modelFetchMode: values.modelFetchMode,
                allowUrlProbe: values.allowUrlProbe,
                timeoutMs: values.timeoutMs,
                maxRetries: values.maxRetries,
                temperature: values.temperature,
                maxTokens: values.maxTokens,
                topP: values.topP,
            };

            const hide = message.loading('正在测试模型可用性...', 0);
            const result = await testModelMutation.mutateAsync(payload);
            hide();

            if (result.success) {
                modal.success({
                    title: '✅ 模型测试成功',
                    width: 500,
                    content: (
                        <div>
                            <p>{result.message}</p>
                            <div style={{ marginBottom: 10 }}>
                                <p style={{ margin: 0 }}><strong>模型:</strong> {result.modelId || modelName}</p>
                                {result.provider && <p style={{ margin: 0 }}><strong>供应商:</strong> {result.provider}</p>}
                            </div>
                            {result.response && (
                                <div style={{
                                    background: '#f5f5f5',
                                    padding: '8px 12px',
                                    borderRadius: 6,
                                    border: '1px solid #d9d9d9',
                                    fontSize: 12,
                                    fontFamily: 'monospace',
                                    maxHeight: 150,
                                    overflow: 'auto'
                                }}>
                                    {result.response}
                                </div>
                            )}
                        </div>
                    ),
                });
            } else {
                modal.error({
                    title: '❌ 模型测试失败',
                    width: 500,
                    content: (
                        <div>
                            <p style={{ fontWeight: 500 }}>{result.message}</p>
                            {result.error && (
                                <div style={{
                                    background: '#fff1f0',
                                    border: '1px solid #ffa39e',
                                    padding: 8,
                                    borderRadius: 4,
                                    marginTop: 8,
                                    color: '#cf1322',
                                    fontSize: 12
                                }}>
                                    {result.error}
                                </div>
                            )}
                        </div>
                    )
                });
            }
        } catch (error) {
            message.error('模型测试失败');
        }
    };

    const handleTestConnection = async (record: AIModelConfig) => {
        const hide = message.loading('正在测试连接...', 0);
        try {
            const result = await testConnectionMutation.mutateAsync(record.configKey);
            hide();

            if (result.success) {
                modal.success({
                    title: '✅ 连接测试成功',
                    width: 500,
                    content: (
                        <div>
                            <p>{result.message}</p>
                            <div style={{ marginBottom: 10 }}>
                                <p style={{ margin: 0 }}><strong>供应商:</strong> {result.provider}</p>
                                <p style={{ margin: 0 }}><strong>模型:</strong> {result.modelId}</p>
                            </div>
                            <div style={{
                                background: '#f5f5f5',
                                padding: '8px 12px',
                                borderRadius: 6,
                                border: '1px solid #d9d9d9',
                                fontSize: 12,
                                fontFamily: 'monospace',
                                maxHeight: 150,
                                overflow: 'auto'
                            }}>
                                {result.response}
                            </div>
                        </div>
                    ),
                });
            } else {
                modal.error({
                    title: '❌ 连接测试失败',
                    width: 500,
                    content: (
                        <div>
                            <p style={{ fontWeight: 500 }}>{result.message}</p>
                            {result.error && (
                                <div style={{
                                    background: '#fff1f0',
                                    border: '1px solid #ffa39e',
                                    padding: 8,
                                    borderRadius: 4,
                                    marginTop: 8,
                                    color: '#cf1322',
                                    fontSize: 12
                                }}>
                                    {result.error}
                                </div>
                            )}
                        </div>
                    )
                });
            }
        } catch (error) {
            hide();
            message.error('测试请求失败 (网络错误)');
        }
    };

    const columns: ProColumns<AIModelConfig>[] = [
        {
            title: '配置标识 (Key)',
            dataIndex: 'configKey',
            width: 160,
            fixed: 'left',
            render: (text, record) => (
                <Space>
                    <Text strong copyable>{text}</Text>
                    {record.isDefault && (
                        <Tooltip title="当前默认使用的模型配置">
                            <Tag color="blue" icon={<CheckCircleFilled />}>默认</Tag>
                        </Tooltip>
                    )}
                </Space>
            )
        },
        {
            title: '供应商',
            dataIndex: 'provider',
            width: 120,
            valueEnum: {
                google: { text: 'Google Gemini', status: 'Processing' },
                openai: { text: 'OpenAI', status: 'Success' },
            },
        },
        {
            title: '模型名称',
            dataIndex: 'modelName',
            width: 180,
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 90,
            render: (isActive) => (
                <Tag color={isActive ? 'green' : 'default'}>
                    {isActive ? '已启用' : '已禁用'}
                </Tag>
            ),
        },
        {
            title: '参数',
            key: 'params',
            search: false,
            width: 120,
            render: (_, record) => (
                <Space direction="vertical" size={0} style={{ fontSize: 12, color: '#666' }}>
                    <span>Temp: {record.temperature}</span>
                    <span>Tokens: {record.maxTokens}</span>
                </Space>
            )
        },
        {
            title: 'API 地址',
            dataIndex: 'apiUrl',
            valueType: 'text',
            width: 260,
            ellipsis: true,
            render: (text) => text || <Text type="secondary">默认</Text>
        },
        {
            title: '操作',
            valueType: 'option',
            width: 200,
            fixed: 'right',
            render: (_, record) => [
                <a key="test" onClick={() => handleTestConnection(record)}>
                    <ApiOutlined /> 测试
                </a>,
                <a key="edit" onClick={() => handleEdit(record)}>
                    编辑
                </a>,
                record.configKey !== 'DEFAULT' && (
                    <a key="delete" style={{ color: '#ff4d4f' }} onClick={() => handleDelete(record.configKey)}>
                        删除
                    </a>
                ),
            ],
        },
    ];

    return (
        <PageContainer
            header={{
                title: 'AI 模型配置',
                subTitle: '管理多供应商 AI 模型配置（Google Gemini, OpenAI 等）',
            }}
        >
            <Alert
                message="多模型支持"
                description="系统支持配置多个 AI 模型。勾选“设为默认”的配置将作为系统默认使用的模型。OpenAI 配置支持兼容 OpenAI 协议的中转服务（如 OneAPI, DeepSeek）。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <ProTable<AIModelConfig>
                headerTitle="模型配置列表"
                actionRef={actionRef}
                rowKey="configKey"
                loading={isLoading}
                dataSource={configs}
                columns={columns}
                search={false}
                pagination={false}
                toolBarRender={() => [
                    <Button key="add" type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                        新建配置
                    </Button>,
                ]}
            />

            <ModalForm
                title={currentRow?.configKey ? `编辑配置: ${currentRow.configKey}` : '新建 AI 配置'}
                open={editModalVisible}
                onOpenChange={setEditModalVisible}
                onFinish={handleFinish}
                initialValues={currentRow}
                formRef={formRef}
                modalProps={{
                    destroyOnClose: true,
                    maskClosable: false,
                    ...modalProps,
                }}
            >
                <div ref={containerRef}>
                    <Alert
                        type="info"
                        showIcon
                        message="使用提示"
                        description="建议先选择配置模板，再填写 API 密钥。需要代理/中转时，请打开高级配置并填写 Headers/Query Params/Path Overrides。"
                        style={{ marginBottom: 12 }}
                    />

                    <Text strong>基础配置</Text>
                    <Divider style={{ margin: '8px 0 12px' }} />
                    <ProFormDependency name={['provider']}>
                        {(_, form) => (
                            <ProFormSelect
                                name="__template"
                                label="配置模板"
                                placeholder="选择模板快速填充"
                                tooltip="选择模板将覆盖 Provider/URL/认证等字段"
                                options={templateOptions}
                                fieldProps={{
                                    onChange: (value) => applyTemplate(value as string | undefined, form),
                                }}
                            />
                        )}
                    </ProFormDependency>

                    <ProFormText
                        name="configKey"
                        label="配置标识"
                        placeholder="例如：GEMINI_PRO, GPT4, DEEPSEEK"
                        tooltip="唯一标识此配置的键"
                        disabled={!!currentRow?.id} // Disable editing key for existing
                        rules={[
                            { required: true, message: '请输入配置标识' },
                            { pattern: /^[A-Z0-9_]+$/, message: '仅允许大写字母、数字和下划线' }
                        ]}
                        fieldProps={currentRow?.id ? undefined : (autoFocusFieldProps as any)}
                    />

                    <ProFormSelect
                        name="provider"
                        label="供应商"
                        options={[
                            { label: 'Google Gemini', value: 'google' },
                            { label: 'OpenAI (兼容协议)', value: 'openai' },
                        ]}
                        rules={[{ required: true }]}
                        fieldProps={currentRow?.id ? (autoFocusFieldProps as any) : undefined}
                    />

                <ProFormSelect
                    name="modelName"
                    label="模型名称"
                    placeholder="选择或输入模型名称"
                    rules={[{ required: true }]}
                    showSearch
                    dependencies={['availableModels']}
                    request={async (params) => {
                        const { availableModels = [] } = params;
                        // Ensure current row's model is also an option if it exists
                        const options = [...new Set([...(availableModels || []), currentRow?.modelName].filter(Boolean))];
                        return options.map((m: string) => ({ label: m, value: m }));
                    }}
                />

                <ProFormSelect
                    name="availableModels"
                    label="可用模型列表"
                    placeholder="管理可用模型"
                    mode="tags"
                    tooltip="自动拉取会更新此处列表，也可手动维护。"
                    fieldProps={{
                        tokenSeparators: [',']
                    }}
                />

                <ProFormDependency name={['provider', 'apiKey', 'apiUrl', 'availableModels']}>
                    {({ provider, apiKey, apiUrl, availableModels }, form) => {
                        return (
                            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'flex-end', marginTop: -20 }}>
                                <Button
                                    type="link"
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    loading={fetchModelsMutation.isPending}
                                    onClick={async () => {
                                        await handleFetchModels(form);
                                        // The handleFetchModels now updates the form field directly
                                    }}
                                >
                                    从 {provider} 获取可用模型列表
                                </Button>
                            </div>
                        );
                    }}
                </ProFormDependency>

                {fetchedModels.length > 0 && (
                    <Card
                        size="small"
                        title="已获取模型列表"
                        style={{ marginBottom: 16 }}
                        extra={(
                            <Space size={8}>
                                <Button size="small" onClick={() => setSelectedFetchedModels(fetchedModels)}>
                                    全选
                                </Button>
                                <Button size="small" onClick={() => setSelectedFetchedModels([])}>
                                    清空选择
                                </Button>
                                <Button size="small" onClick={handleAddSelectedModels}>
                                    添加选中
                                </Button>
                                <Button size="small" onClick={handleAddAllModels}>
                                    添加全部
                                </Button>
                                <Button size="small" onClick={handleTestSelectedModel} loading={testModelMutation.isPending}>
                                    测试选中模型
                                </Button>
                                <Button size="small" onClick={() => {
                                    setFetchedModels([]);
                                    setSelectedFetchedModels([]);
                                    setFetchRecommendation(undefined);
                                    setFetchRecommendationPatch(undefined);
                                }}>
                                    清空列表
                                </Button>
                            </Space>
                        )}
                    >
                        {fetchRecommendation && (
                            <Alert
                                type="info"
                                showIcon
                                message="推荐配置"
                                description={(
                                    <Space size={8}>
                                        <span>{fetchRecommendation}</span>
                                        {fetchRecommendationPatch && (
                                            <Button
                                                size="small"
                                                type="link"
                                                onClick={() => {
                                                    const form = formRef.current;
                                                    if (!form) return;
                                                    form.setFieldsValue(fetchRecommendationPatch);
                                                    message.success('已应用推荐配置');
                                                }}
                                            >
                                                应用推荐
                                            </Button>
                                        )}
                                    </Space>
                                )}
                                style={{ marginBottom: 12 }}
                            />
                        )}
                        {fetchDiagnostics.length > 0 && (
                            <Alert
                                type="warning"
                                showIcon
                                message="模型获取诊断"
                                description={(
                                    <div>
                                        {fetchDiagnostics.map((item, index) => (
                                            <div key={`${item.provider}-${index}`} style={{ marginBottom: 4 }}>
                                                <Text strong>{item.provider}</Text>
                                                {item.activeUrl ? ` (${item.activeUrl})` : ''}
                                                ：{item.message}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                style={{ marginBottom: 12 }}
                            />
                        )}
                        <Checkbox.Group
                            value={selectedFetchedModels}
                            onChange={(values) => setSelectedFetchedModels(values as string[])}
                            options={fetchedModels.map((model) => ({ label: model, value: model }))}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                gap: 8,
                            }}
                        />
                    </Card>
                )}

                <ProFormText
                    name="apiUrl"
                    label="API 基础地址"
                    tooltip="OpenAI 默认 https://api.openai.com/v1；Gemini 默认 https://generativelanguage.googleapis.com/v1beta"
                    placeholder="留空使用默认值（建议使用模板）"
                />

                <ProFormText.Password
                    name="apiKey"
                    label="API 密钥"
                    placeholder="sk-..."
                    tooltip="若为空则尝试使用环境变量"
                />

                <ProFormSelect
                    name="authType"
                    label="认证方式"
                    tooltip="OpenAI 兼容默认 Bearer；Gemini 官方建议 API Key"
                    options={[
                        { label: 'Bearer', value: 'bearer' },
                        { label: 'API Key', value: 'api-key' },
                        { label: '自定义', value: 'custom' },
                        { label: '无认证', value: 'none' },
                    ]}
                />

                <ProFormSelect
                    name="modelFetchMode"
                    label="模型获取方式"
                    tooltip="官方自动拉取或手动维护"
                    options={[
                        { label: '官方/自动', value: 'official' },
                        { label: '手动维护', value: 'manual' },
                        { label: '自定义', value: 'custom' },
                    ]}
                />

                <Divider style={{ margin: '12px 0' }} />
                <Text strong>高级配置（代理/中转）</Text>
                <Divider style={{ margin: '8px 0 12px' }} />

                <ProFormSwitch
                    name="showAdvanced"
                    label="显示高级配置"
                    tooltip="仅代理/中转或特殊网关需要"
                />

                <ProFormDependency name={['showAdvanced', 'provider']}>
                    {({ showAdvanced, provider }) => (showAdvanced ? (
                        <>
                            {provider === 'openai' ? (
                                <ProFormSwitch
                                    name="allowUrlProbe"
                                    label="启用 URL 探测"
                                    tooltip="获取模型列表失败时尝试常见路径"
                                />
                            ) : null}

                            <ProFormTextArea
                                name="headers"
                                label="自定义 Headers (JSON)"
                                placeholder='例如：{"x-goog-api-key": "..."}'
                                tooltip="代理/中转常用。JSON 格式 Key-Value"
                                fieldProps={{ autoSize: { minRows: 3, maxRows: 6 } }}
                            />

                            <ProFormTextArea
                                name="queryParams"
                                label="Query Params (JSON)"
                                placeholder='例如：{"key": "..."}'
                                tooltip="将附加到请求 URL 的查询参数"
                                fieldProps={{ autoSize: { minRows: 3, maxRows: 6 } }}
                            />

                            <ProFormTextArea
                                name="pathOverrides"
                                label="Path Overrides (JSON)"
                                placeholder='例如：{"models": "/models", "generateContent": "/models/gemini-1.5-pro:generateContent"}'
                                tooltip="用于代理/中转自定义路径"
                                fieldProps={{ autoSize: { minRows: 3, maxRows: 6 } }}
                            />
                        </>
                    ) : null)}
                </ProFormDependency>

                <Divider style={{ margin: '12px 0' }} />
                <Text strong>模型参数</Text>
                <Divider style={{ margin: '8px 0 12px' }} />

                <Space size="large">
                    <ProFormDigit
                        name="temperature"
                        label="随机性 (Temperature)"
                        min={0}
                        max={2}
                        step={0.1}
                        width="xs"
                    />
                    <ProFormDigit
                        name="maxTokens"
                        label="最大 Token 数"
                        min={100}
                        step={100}
                        width="sm"
                    />
                </Space>

                <Space size="large">
                    <ProFormDigit
                        name="maxRetries"
                        label="重试次数"
                        min={0}
                        max={5}
                        width="xs"
                    />
                    <ProFormDigit
                        name="timeoutMs"
                        label="超时时间 (ms)"
                        min={1000}
                        width="sm"
                    />
                </Space>

                <Space size="large">
                    <ProFormSwitch
                        name="isActive"
                        label="启用配置"
                    />
                    <ProFormSwitch
                        name="isDefault"
                        label="设为默认"
                        tooltip="设为默认后，其他配置将自动取消默认状态"
                    />
                </Space>
                </div>
            </ModalForm>
        </PageContainer>
    );
};

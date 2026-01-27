
import { Button, App, Popconfirm, Tag, Space, Drawer } from 'antd';
import { useState, useRef } from 'react';
import { ActionType, ProColumns, ProTable, ModalForm, ProFormText, ProFormTextArea, ProFormSelect, ProFormSwitch } from '@ant-design/pro-components';
import { usePrompts, useCreatePrompt, useUpdatePrompt, useDeletePrompt, usePreviewPrompt } from '../api';
import { PromptTemplate } from '../types';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

const GENERIC_PROMPT_VARS = {
    content: "这是一个测试内容...",
    knownLocations: "北京、上海",
    knownCommodities: "玉米、大豆",
    jsonSchema: "{...}",
};

export const PromptTemplatePage = () => {
    const { message } = App.useApp();
    const actionRef = useRef<ActionType>();
    const { data: prompts, isLoading, refetch } = usePrompts();
    const createMutation = useCreatePrompt();
    const updateMutation = useUpdatePrompt();
    const deleteMutation = useDeletePrompt();
    const previewMutation = usePreviewPrompt();

    // State for Modal
    const [modalVisible, setModalVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<PromptTemplate | null>(null);

    // State for Preview Drawer
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewData, setPreviewData] = useState<{ system: string, user: string } | null>(null);

    // Auto Focus Hook
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();
    const isEditMode = !!currentRow;

    const handleEdit = (record: PromptTemplate) => {
        setCurrentRow(record);
        setModalVisible(true);
    };

    const handleCreate = () => {
        setCurrentRow(null);
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMutation.mutateAsync(id);
            message.success('已删除');
            actionRef.current?.reload();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleFinish = async (values: any) => {
        try {
            if (currentRow) {
                await updateMutation.mutateAsync({ id: currentRow.id, data: values });
                message.success('更新成功');
            } else {
                await createMutation.mutateAsync(values);
                message.success('创建成功');
            }
            setModalVisible(false);
            refetch(); // Refresh list to be sure
            return true;
        } catch (error) {
            message.error('操作失败');
            return false;
        }
    };

    const handlePreview = async (record: PromptTemplate) => {
        try {
            const data = await previewMutation.mutateAsync({
                code: record.code,
                variables: GENERIC_PROMPT_VARS
            });
            setPreviewData(data);
            setPreviewVisible(true);
        } catch (error) {
            message.error('预览失败');
        }
    }

    const columns: ProColumns<PromptTemplate>[] = [
        {
            title: '模板代码 (Code)',
            dataIndex: 'code',
            copyable: true,
            width: 250,
            render: (text) => <span style={{ fontWeight: 'bold' }}>{text}</span>
        },
        {
            title: '名称',
            dataIndex: 'name',
            width: 200,
        },
        {
            title: '分类',
            dataIndex: 'category',
            valueEnum: {
                A_STRUCTURED: { text: 'A类-结构化', status: 'Processing' },
                B_SEMI_STRUCTURED: { text: 'B类-半结构化', status: 'Warning' },
                C_DOCUMENT: { text: 'C类-文档', status: 'Success' },

            },
            width: 150,
        },
        {
            title: '版本',
            dataIndex: 'version',
            width: 80,
            render: (v) => <Tag>v{v}</Tag>
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 100,
            render: (_, record) => record.isActive ? <Tag color="success">启用</Tag> : <Tag color="error">禁用</Tag>,
        },
        {
            title: '操作',
            width: 250,
            key: 'option',
            valueType: 'option',
            render: (_, record) => [
                <Button
                    key="preview"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => handlePreview(record)}
                >
                    预览
                </Button>,
                <Button
                    key="edit"
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                >
                    编辑
                </Button>,
                <Popconfirm
                    key="delete"
                    title="确定删除此模板?"
                    onConfirm={() => handleDelete(record.id)}
                >
                    <Button type="primary" danger size="small" icon={<DeleteOutlined />}>
                        删除
                    </Button>
                </Popconfirm>,
            ],
        }
    ];

    return (
        <div style={{ background: '#F5F7FA' }}>
            <ProTable<PromptTemplate>
                headerTitle="AI 提示词模板管理 (Prompt Templates)"
                actionRef={actionRef}
                rowKey="id"
                loading={isLoading}
                dataSource={prompts || []}
                columns={columns}
                search={false}
                options={{
                    reload: () => refetch(),
                    density: true,
                    fullScreen: true,
                }}
                pagination={{ pageSize: 20 }}
                toolBarRender={() => [
                    <Button
                        key="button"
                        icon={<PlusOutlined />}
                        type="primary"
                        onClick={handleCreate}
                    >
                        新建模板
                    </Button>,
                ]}
            />

            <ModalForm
                title={currentRow ? "编辑模板" : "新建模板"}
                open={modalVisible}
                onOpenChange={setModalVisible}
                onFinish={handleFinish}
                initialValues={currentRow || {
                    isActive: true,
                    version: 1,
                    category: 'B_SEMI_STRUCTURED'
                }}
                modalProps={{ destroyOnClose: true, width: 800, ...modalProps }}
            >
                {/* [New] Wrap content with simple div for focus trap containment */}
                <div ref={containerRef}>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <ProFormText
                            name="code"
                            label="模板代码 (Code)"
                            placeholder="e.g. MARKET_INTEL_NEW"
                            rules={[{ required: true }]}
                            disabled={!!currentRow} // Code immutable after create
                            fieldProps={isEditMode ? undefined : (autoFocusFieldProps as any)}
                            width="md"
                        />
                        <ProFormText
                            name="name"
                            label="模板名称"
                            placeholder="e.g. 新版行情分析"
                            rules={[{ required: true }]}
                            fieldProps={isEditMode ? (autoFocusFieldProps as any) : undefined}
                            width="md"
                        />
                    </div>

                    <ProFormSelect
                        name="category"
                        label="业务分类"
                        valueEnum={{
                            A_STRUCTURED: 'A类-结构化',
                            B_SEMI_STRUCTURED: 'B类-半结构化',
                            C_DOCUMENT: 'C类-文档',
                        }}
                        rules={[{ required: true }]}
                    />

                    <ProFormTextArea
                        name="systemPrompt"
                        label="System Prompt"
                        tooltip="系统预设指令，支持 {{variables}}"
                        fieldProps={{ rows: 6, style: { fontFamily: 'monospace' } }}
                        rules={[{ required: true }]}
                    />

                    <ProFormTextArea
                        name="userPrompt"
                        label="User Prompt"
                        tooltip="用户输入指令，支持 {{variables}}"
                        fieldProps={{ rows: 4, style: { fontFamily: 'monospace' } }}
                        rules={[{ required: true }]}
                    />

                    <ProFormSwitch
                        name="isActive"
                        label="启用状态"
                    />
                </div>
            </ModalForm>

            <Drawer
                title="Prompt 渲染预览"
                width={600}
                onClose={() => setPreviewVisible(false)}
                open={previewVisible}
            >
                {previewData && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        <div>
                            <Tag color="blue">System Prompt</Tag>
                            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, marginTop: 8, whiteSpace: 'pre-wrap' }}>
                                {previewData.system}
                            </pre>
                        </div>
                        <div>
                            <Tag color="green">User Prompt</Tag>
                            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, marginTop: 8, whiteSpace: 'pre-wrap' }}>
                                {previewData.user}
                            </pre>
                        </div>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

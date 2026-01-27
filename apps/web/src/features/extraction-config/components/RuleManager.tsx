import React, { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Popconfirm,
    Typography,
    Flex,
    Switch,
    Modal,
    Empty,
    theme,
    App,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ThunderboltOutlined,
    PlayCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    useExtractionRules,
    useUpdateExtractionRule,
    useDeleteExtractionRule,
    ExtractionRule,
} from '../api/hooks';
import { RuleEditor } from './RuleEditor';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

const { Text } = Typography;

export const RuleManager: React.FC = () => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [editorVisible, setEditorVisible] = useState(false);
    const [editingRule, setEditingRule] = useState<ExtractionRule | null>(null);
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const { data: rules, isLoading } = useExtractionRules();
    const updateMutation = useUpdateExtractionRule();
    const deleteMutation = useDeleteExtractionRule();

    const handleCreate = () => {
        setEditingRule(null);
        setEditorVisible(true);
    };

    const handleEdit = (record: ExtractionRule) => {
        setEditingRule(record);
        setEditorVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMutation.mutateAsync(id);
            message.success('删除成功');
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleToggleActive = async (id: string, isActive: boolean) => {
        try {
            await updateMutation.mutateAsync({ id, isActive });
            message.success(isActive ? '已启用' : '已禁用');
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleEditorSave = () => {
        setEditorVisible(false);
        setEditingRule(null);
    };

    const columns: ColumnsType<ExtractionRule> = [
        {
            title: '规则名称',
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: '规则类型',
            dataIndex: 'targetType',
            key: 'targetType',
            width: 100,
            render: (type: string) => (
                <Tag color={type === 'EVENT' ? 'blue' : 'purple'}>
                    {type === 'EVENT' ? '事件提取' : '洞察提取'}
                </Tag>
            ),
        },
        {
            title: '详细分类',
            key: 'detailType',
            width: 120,
            render: (_, record: ExtractionRule) => {
                const isEvent = record.targetType === 'EVENT';
                const typeConfig = isEvent ? record.eventType : record.insightType;
                return (
                    <Tag bordered={false} color={typeConfig?.color}>
                        {typeConfig?.name || '-'}
                    </Tag>
                );
            },
        },
        {
            title: '条件数',
            key: 'conditions',
            width: 80,
            render: (_, record: ExtractionRule) => (
                <Tag>{record.conditions?.length || 0} 条</Tag>
            ),
        },
        {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            key: 'priority',
            width: 70,
            render: (priority: number) => (
                <Text type="secondary">{priority}</Text>
            ),
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 80,
            render: (isActive: boolean, record: ExtractionRule) => (
                <Switch
                    size="small"
                    checked={isActive}
                    onChange={(checked) => handleToggleActive(record.id, checked)}
                />
            ),
        },
        {
            title: '操作',
            key: 'actions',
            width: 100,
            fixed: 'right' as const,
            render: (_, record: ExtractionRule) => (
                <Space size="small">
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    />
                    <Popconfirm
                        title="确定删除此规则吗？"
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Card
                title={
                    <Flex align="center" gap={8}>
                        <ThunderboltOutlined style={{ color: token.colorWarning }} />
                        <span>提取规则管理</span>
                    </Flex>
                }
                extra={
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                        新建规则
                    </Button>
                }
            >
                <Table
                    dataSource={rules || []}
                    columns={columns}
                    rowKey="id"
                    loading={isLoading}
                    size="small"
                    pagination={false}
                    locale={{
                        emptyText: (
                            <Empty
                                description="暂无规则"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            >
                                <Button type="primary" onClick={handleCreate}>
                                    创建第一条规则
                                </Button>
                            </Empty>
                        ),
                    }}
                />
            </Card>

            <Modal
                title={editingRule ? '编辑提取规则' : '新建提取规则'}
                open={editorVisible}
                onCancel={() => setEditorVisible(false)}
                footer={null}
                width={900}
                destroyOnClose
                afterOpenChange={modalProps.afterOpenChange}
            >
                <div ref={containerRef}>
                    <RuleEditor
                        rule={editingRule}
                        onSave={handleEditorSave}
                        onCancel={() => setEditorVisible(false)}
                        autoFocusProps={autoFocusFieldProps}
                    />
                </div>
            </Modal>
        </>
    );
};

export default RuleManager;

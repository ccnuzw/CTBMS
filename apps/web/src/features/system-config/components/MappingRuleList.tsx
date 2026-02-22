import { useRef } from 'react';
import { Space, Popconfirm, App, Tag } from 'antd';
import { ProTable, ActionType, ProColumns, ModalForm } from '@ant-design/pro-components';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    useMappingRules,
    useCreateMappingRule,
    useUpdateMappingRule,
    useDeleteMappingRule,
} from '../api';
import { BusinessMappingRule, CreateMappingRuleDTO, UpdateMappingRuleDTO } from '../types';
import { MappingRuleForm } from './MappingRuleForm';

export const MappingRuleList = () => {
    const actionRef = useRef<ActionType>();
    const { message } = App.useApp();

    const { data: rules = [], isLoading } = useMappingRules();
    const { mutateAsync: createRule } = useCreateMappingRule();
    const { mutateAsync: updateRule } = useUpdateMappingRule();
    const { mutateAsync: deleteRule } = useDeleteMappingRule();

    const columns: ProColumns<BusinessMappingRule>[] = [
        {
            title: '业务域',
            dataIndex: 'domain',
            width: 150,
            filters: true,
            onFilter: true,
            valueType: 'select',
            valueEnum: {
                SENTIMENT: { text: 'SENTIMENT (情感)' },
                PRICE_SOURCE_TYPE: { text: 'PRICE_SOURCE_TYPE (源类型)' },
                PRICE_SUB_TYPE: { text: 'PRICE_SUB_TYPE (子类型)' },
                GEO_LEVEL: { text: 'GEO_LEVEL (地理层级)' },
            },
        },
        {
            title: '匹配关键词 / 规则',
            dataIndex: 'pattern',
            width: 200,
            render: (_) => <span style={{ fontFamily: 'monospace' }}>{_}</span>,
        },
        {
            title: '匹配模式',
            dataIndex: 'matchMode',
            width: 120,
            valueType: 'select',
            valueEnum: {
                CONTAINS: { text: '包含', status: 'Default' },
                EXACT: { text: '精确', status: 'Success' },
                REGEX: { text: '正则', status: 'Processing' },
            },
        },
        {
            title: '目标映射值',
            dataIndex: 'targetValue',
            width: 150,
            render: (val, record) => {
                let color = 'default';
                const v = String(val).toLowerCase();
                if (v === 'positive' || v === 'bullish') color = 'success';
                if (v === 'negative' || v === 'bearish') color = 'error';
                if (v === 'mixed' || v === 'neutral') color = 'warning';
                return <Tag color={color}>{val}</Tag>;
            }
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            width: 100,
            sorter: (a, b) => a.priority - b.priority,
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 100,
            valueType: 'switch',
            render: (_, record) => (
                <Tag color={record.isActive ? 'success' : 'default'}>
                    {record.isActive ? '启用' : '禁用'}
                </Tag>
            ),
        },
        {
            title: '说明备注',
            dataIndex: 'description',
            ellipsis: true,
        },
        {
            title: '操作',
            valueType: 'option',
            width: 150,
            fixed: 'right',
            render: (_, record) => [
                <ModalForm<UpdateMappingRuleDTO>
                    key="edit"
                    title={`编辑规则: ${record.pattern}`}
                    trigger={
                        <a key="edit-btn">
                            <Space><EditOutlined /> 编辑</Space>
                        </a>
                    }
                    autoFocusFirstInput
                    modalProps={{
                        destroyOnClose: true,
                    }}
                    onFinish={async (values) => {
                        await updateRule({ id: record.id, data: values });
                        message.success('规则更新成功');
                        return true;
                    }}
                >
                    <MappingRuleForm initialValues={record} mode="edit" />
                </ModalForm>,
                <Popconfirm
                    key="delete"
                    title="确定要删除这条映射规则吗？"
                    description="删除后，相关模块将无法通过此规则命中映射。"
                    onConfirm={async () => {
                        await deleteRule(record.id);
                        message.success('规则已删除');
                    }}
                    okText="是"
                    cancelText="否"
                >
                    <a style={{ color: 'var(--ant-color-error)' }} key="delete-btn">
                        <Space><DeleteOutlined /> 删除</Space>
                    </a>
                </Popconfirm>,
            ],
        },
    ];

    return (
        <ProTable<BusinessMappingRule>
            headerTitle="业务映射与情感规则"
            actionRef={actionRef}
            rowKey="id"
            search={false}
            options={{
                setting: true,
                reload: true,
            }}
            loading={isLoading}
            dataSource={rules}
            columns={columns}
            pagination={{
                pageSize: 20,
            }}
            toolBarRender={() => [
                <ModalForm<CreateMappingRuleDTO>
                    key="create"
                    title="新增映射规则"
                    trigger={
                        <a className="ant-btn ant-btn-primary">
                            <PlusOutlined /> 新建
                        </a>
                    }
                    autoFocusFirstInput
                    modalProps={{
                        destroyOnClose: true,
                    }}
                    onFinish={async (values) => {
                        await createRule(values);
                        message.success('规则创建成功');
                        return true;
                    }}
                >
                    <MappingRuleForm mode="create" />
                </ModalForm>,
            ]}
        />
    );
};

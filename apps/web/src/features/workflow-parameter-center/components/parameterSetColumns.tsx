import React from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { Button, Input, InputNumber, Popconfirm, Space, Switch, Tag } from 'antd';
import type {
    ParameterChangeLogDto,
    ParameterItemDto,
    ParameterOverrideDiffItemDto,
    ParameterSetDto,
    WorkflowTemplateSource,
} from '@packages/types';
import { ParameterInheritanceStatus } from './index';
import {
    scopeColorMap,
    operationColorMap,
    getTemplateSourceLabel,
    getScopeLabel,
    getActiveStatusLabel,
    isPublished,
    formatValue,
} from './useParameterSetViewModel';

// =============================================
// 辅助渲染函数
// =============================================

/**
 * 根据参数类型渲染对应的输入控件
 */
export const renderDynamicInput = (type?: string, placeholder?: string) => {
    if (type === 'boolean') {
        return <Switch checkedChildren="True" unCheckedChildren="False" />;
    }
    if (type === 'number') {
        return <InputNumber style={{ width: '100%' }} placeholder={placeholder} />;
    }
    if (type === 'json' || type === 'expression') {
        return <Input.TextArea rows={3} placeholder={placeholder} />;
    }
    return <Input placeholder={placeholder} />;
};

// =============================================
// 参数包列表列定义
// =============================================

interface SetColumnsDeps {
    actions: {
        handlePublishSet: (record: ParameterSetDto) => void;
    };
    setters: {
        setSelectedSetId: (id: string | null) => void;
        setDetailTab: (tab: string) => void;
    };
    mutations: {
        deleteSetMutation: { mutateAsync: (id: string) => Promise<unknown> };
        publishSetMutation: { isPending: boolean };
    };
    state: {
        publishingSetId: string | null;
    };
}

export const buildSetColumns = (deps: SetColumnsDeps): ColumnsType<ParameterSetDto> => [
    { title: '名称', dataIndex: 'name', width: 220 },
    {
        title: '来源',
        dataIndex: 'templateSource',
        width: 100,
        render: (value: string) => (
            <Tag color={value === 'PUBLIC' ? 'blue' : 'default'}>
                {getTemplateSourceLabel(value as WorkflowTemplateSource)}
            </Tag>
        ),
    },
    {
        title: '状态',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
            <Tag color={value ? 'green' : 'red'}>{getActiveStatusLabel(value)}</Tag>
        ),
    },
    {
        title: '版本',
        dataIndex: 'version',
        width: 90,
        render: (value: number) => (
            <Tag color={isPublished(value) ? 'green' : 'orange'}>{value}</Tag>
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
        width: 260,
        render: (_, record) => (
            <Space size={4}>
                <Button
                    type="link"
                    onClick={() => {
                        deps.setters.setSelectedSetId(record.id);
                        deps.setters.setDetailTab('items');
                    }}
                >
                    查看详情
                </Button>
                <Popconfirm
                    title="确认发布该参数包?"
                    onConfirm={() => deps.actions.handlePublishSet(record)}
                    disabled={!record.isActive || isPublished(record.version)}
                >
                    <Button
                        type="link"
                        disabled={!record.isActive || isPublished(record.version)}
                        loading={
                            deps.mutations.publishSetMutation.isPending &&
                            deps.state.publishingSetId === record.id
                        }
                    >
                        {isPublished(record.version) ? '已发布' : '发布'}
                    </Button>
                </Popconfirm>
                <Popconfirm
                    title="确认停用该参数包?"
                    onConfirm={async () => {
                        await deps.mutations.deleteSetMutation.mutateAsync(record.id);
                    }}
                    disabled={!record.isActive}
                >
                    <Button type="link" danger disabled={!record.isActive}>
                        停用
                    </Button>
                </Popconfirm>
            </Space>
        ),
    },
];

// =============================================
// 参数项列定义
// =============================================

interface ItemColumnsDeps {
    actions: {
        openEditItem: (record: ParameterItemDto) => void;
        handleResetItem: (id: string) => void;
    };
}

export const buildItemColumns = (deps: ItemColumnsDeps): ColumnsType<ParameterItemDto> => [
    { title: '名称', dataIndex: 'paramName', width: 180 },
    { title: '类型', dataIndex: 'paramType', width: 90 },
    {
        title: '作用域',
        dataIndex: 'scopeLevel',
        width: 140,
        render: (value: string) => (
            <Tag color={scopeColorMap[value] || 'default'}>{getScopeLabel(value)}</Tag>
        ),
    },
    { title: '作用域值', dataIndex: 'scopeValue', width: 100, render: (v?: string) => v || '-' },
    {
        title: '当前值',
        dataIndex: 'value',
        width: 120,
        render: (value: unknown) => formatValue(value),
    },
    {
        title: '默认值',
        dataIndex: 'defaultValue',
        width: 120,
        render: (value: unknown) => formatValue(value),
    },
    {
        title: '继承状态',
        key: 'inheritStatus',
        width: 120,
        render: (_, record) => {
            const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
            return (
                <ParameterInheritanceStatus
                    defaultValue={record.defaultValue}
                    currentValue={record.value}
                    hasDefault={hasDefault}
                />
            );
        },
    },
    {
        title: '状态',
        dataIndex: 'isActive',
        width: 80,
        render: (value: boolean) => (
            <Tag color={value ? 'green' : 'red'}>{getActiveStatusLabel(value)}</Tag>
        ),
    },
    {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_, record) => {
            const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
            const isOverridden =
                hasDefault &&
                record.value !== null &&
                record.value !== undefined &&
                JSON.stringify(record.value) !== JSON.stringify(record.defaultValue);
            return (
                <Space size={4}>
                    <Button type="link" size="small" onClick={() => deps.actions.openEditItem(record)}>
                        编辑
                    </Button>
                    <Popconfirm
                        title="确认重置到默认值?"
                        onConfirm={() => deps.actions.handleResetItem(record.id)}
                        disabled={!isOverridden}
                    >
                        <Button type="link" size="small" disabled={!isOverridden}>
                            重置
                        </Button>
                    </Popconfirm>
                </Space>
            );
        },
    },
];

// =============================================
// 覆盖对比列定义
// =============================================

export const buildDiffColumns = (
    colorWarning: string,
): ColumnsType<ParameterOverrideDiffItemDto> => [
        { title: '名称', dataIndex: 'paramName', width: 180 },
        {
            title: '作用域',
            dataIndex: 'scopeLevel',
            width: 130,
            render: (value: string) => (
                <Tag color={scopeColorMap[value] || 'default'}>{getScopeLabel(value)}</Tag>
            ),
        },
        {
            title: '模板默认值',
            dataIndex: 'templateDefault',
            width: 150,
            render: (value: unknown) => formatValue(value),
        },
        {
            title: '当前值',
            dataIndex: 'currentValue',
            width: 150,
            render: (value: unknown, record: Record<string, unknown>) => (
                <span
                    style={{
                        color: record.isOverridden ? colorWarning : undefined,
                        fontWeight: record.isOverridden ? 600 : undefined,
                    }}
                >
                    {formatValue(value)}
                </span>
            ),
        },
        {
            title: '覆盖状态',
            dataIndex: 'isOverridden',
            width: 100,
            render: (value: boolean) => (
                <Tag color={value ? 'orange' : 'green'}>{value ? '已覆盖' : '继承'}</Tag>
            ),
        },
        {
            title: '覆盖来源',
            dataIndex: 'overrideSource',
            width: 120,
            render: (value?: string) => value || '-',
        },
    ];

// =============================================
// 变更审计列定义
// =============================================

export const buildAuditColumns = (): ColumnsType<ParameterChangeLogDto> => [
    {
        title: '操作',
        dataIndex: 'operation',
        width: 130,
        render: (value: string) => <Tag color={operationColorMap[value] || 'default'}>{value}</Tag>,
    },
    { title: '字段', dataIndex: 'fieldPath', width: 120, render: (v?: string) => v || '-' },
    {
        title: '旧值',
        dataIndex: 'oldValue',
        width: 150,
        render: (value: unknown) => formatValue(value),
    },
    {
        title: '新值',
        dataIndex: 'newValue',
        width: 150,
        render: (value: unknown) => formatValue(value),
    },
    {
        title: '变更原因',
        dataIndex: 'changeReason',
        ellipsis: true,
        render: (v?: string) => v || '-',
    },
    { title: '操作人', dataIndex: 'changedByUserId', width: 120 },
    {
        title: '时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
];

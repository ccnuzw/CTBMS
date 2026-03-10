import React from 'react';
import type { ProColumns } from '@ant-design/pro-components';
import { Space, Tag, Tooltip, Typography } from 'antd';
import { ApiOutlined, CheckCircleFilled } from '@ant-design/icons';
import type { AIModelConfig } from '../types';

const { Text } = Typography;

// =============================================
// 模板选项与预设映射
// =============================================

export const templateOptions = [
    { label: 'OpenAI 官方', value: 'openai_official' },
    { label: 'OpenAI 兼容中转', value: 'openai_proxy' },
    { label: 'Sub2API (Codex)', value: 'sub2api_default' },
    { label: 'Gemini 官方', value: 'gemini_official' },
    { label: 'Gemini 代理/中转', value: 'gemini_proxy' },
];

export const templateMap: Record<string, Partial<AIModelConfig> & { wireApi?: string }> = {
    openai_official: {
        provider: 'openai',
        apiUrl: 'https://api.openai.com/v1',
        authType: 'bearer',
        modelFetchMode: 'official',
        allowUrlProbe: true,
        wireApi: '',
    },
    openai_proxy: {
        provider: 'openai',
        apiUrl: 'https://your-proxy.example.com/v1',
        authType: 'bearer',
        modelFetchMode: 'official',
        allowUrlProbe: true,
        wireApi: '',
    },
    sub2api_default: {
        provider: 'sub2api',
        apiUrl: 'https://sub2api.526566.xyz/v1',
        authType: 'bearer',
        modelFetchMode: 'official',
        allowUrlProbe: false,
        wireApi: 'responses',
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

// =============================================
// JSON 字段工具函数
// =============================================

export const formatJsonField = (value?: Record<string, string> | string) => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
};

// =============================================
// ProTable 列定义
// =============================================

interface ColumnDeps {
    token: { colorTextSecondary: string; colorError: string };
    blurActiveElement: () => void;
    handleTestConnection: (record: AIModelConfig) => void;
    handleEdit: (record: AIModelConfig) => void;
    handleDelete: (key: string) => void;
}

export const buildColumns = (deps: ColumnDeps): ProColumns<AIModelConfig>[] => [
    {
        title: '配置标识 (Key)',
        dataIndex: 'configKey',
        width: 160,
        fixed: 'left',
        render: (text, record) => (
            <Space>
                <Text strong copyable>
                    {text}
                </Text>
                {record.isDefault && (
                    <Tooltip title="当前默认使用的模型配置">
                        <Tag color="blue" icon={<CheckCircleFilled />}>
                            默认
                        </Tag>
                    </Tooltip>
                )}
            </Space>
        ),
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
            <Tag color={isActive ? 'green' : 'default'}>{isActive ? '已启用' : '已禁用'}</Tag>
        ),
    },
    {
        title: '参数',
        key: 'params',
        search: false,
        width: 120,
        render: (_, record) => (
            <Space
                direction="vertical"
                size={0}
                style={{ fontSize: 12, color: deps.token.colorTextSecondary }}
            >
                <span>Temp: {record.temperature}</span>
                <span>Tokens: {record.maxTokens}</span>
            </Space>
        ),
    },
    {
        title: 'API 地址',
        dataIndex: 'apiUrl',
        valueType: 'text',
        width: 260,
        ellipsis: true,
        render: (text) => text || <Text type="secondary">默认</Text>,
    },
    {
        title: '操作',
        valueType: 'option',
        width: 200,
        fixed: 'right',
        render: (_, record) => [
            <a
                key="test"
                onClick={(event) => {
                    event.preventDefault();
                    deps.blurActiveElement();
                    deps.handleTestConnection(record);
                }}
            >
                <ApiOutlined /> 测试
            </a>,
            <a
                key="edit"
                onClick={(event) => {
                    event.preventDefault();
                    deps.blurActiveElement();
                    deps.handleEdit(record);
                }}
            >
                编辑
            </a>,
            record.configKey !== 'DEFAULT' && (
                <a
                    key="delete"
                    style={{ color: deps.token.colorError }}
                    onClick={(event) => {
                        event.preventDefault();
                        deps.blurActiveElement();
                        deps.handleDelete(record.configKey);
                    }}
                >
                    删除
                </a>
            ),
        ],
    },
];

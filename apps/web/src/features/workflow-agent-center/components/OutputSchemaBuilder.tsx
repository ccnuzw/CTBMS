import React, { useState, useEffect } from 'react';
import { Button, Card, Col, Form, Input, Row, Select, Space, Table, Typography, Switch, Tooltip, theme } from 'antd';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined, TableOutlined, CodeOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

interface OutputSchemaBuilderProps {
    value?: string; // JSON string of the schema
    onChange?: (value: string) => void;
}

interface SchemaField {
    name: string;
    type: string;
    description: string;
    required: boolean;
}

const FIELD_TYPES = [
    { label: '文本 (String)', value: 'string' },
    { label: '数字 (Number)', value: 'number' },
    { label: '布尔 (Boolean)', value: 'boolean' },
    { label: '数组 (Array<String>)', value: 'array-string' },
];

export const OutputSchemaBuilder: React.FC<OutputSchemaBuilderProps> = ({ value, onChange }) => {
    const [isVisualMode, setIsVisualMode] = useState(true);
    const { token } = theme.useToken();
    const [fields, setFields] = useState<SchemaField[]>([]);
    const [jsonError, setJsonError] = useState<string | null>(null);

    // Initialize from value
    useEffect(() => {
        if (!value) {
            setFields([]);
            return;
        }
        try {
            const schema = JSON.parse(value);
            if (schema.type === 'object' && schema.properties) {
                const newFields: SchemaField[] = [];
                const required = Array.isArray(schema.required) ? schema.required : [];
                Object.keys(schema.properties).forEach(key => {
                    const prop = schema.properties[key];
                    let type = prop.type;
                    if (type === 'array' && prop.items?.type === 'string') {
                        type = 'array-string';
                    }
                    newFields.push({
                        name: key,
                        type: type,
                        description: prop.description || '',
                        required: required.includes(key),
                    });
                });
                setFields(newFields);
                setIsVisualMode(true);
            } else {
                // Complex schema, fallback to code mode
                setIsVisualMode(false);
            }
        } catch (e) {
            // Invalid JSON, fallback to code mode
            setIsVisualMode(false);
        }
    }, []);

    const updateSchemaFromFields = (currentFields: SchemaField[]) => {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        currentFields.forEach(field => {
            if (!field.name) return;

            const propSchema: Record<string, unknown> = { description: field.description };
            if (field.type === 'array-string') {
                propSchema.type = 'array';
                propSchema.items = { type: 'string' };
            } else {
                propSchema.type = field.type;
            }

            properties[field.name] = propSchema;
            if (field.required) {
                required.push(field.name);
            }
        });

        const schema = {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
        };

        onChange?.(JSON.stringify(schema, null, 2));
    };

    const handleFieldChange = (index: number, key: keyof SchemaField, val: unknown) => {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], [key]: val };
        setFields(newFields);
        updateSchemaFromFields(newFields);
    };

    const addField = () => {
        const newFields = [...fields, { name: '', type: 'string', description: '', required: true }];
        setFields(newFields);
        updateSchemaFromFields(newFields);
    };

    const removeField = (index: number) => {
        const newFields = [...fields];
        newFields.splice(index, 1);
        setFields(newFields);
        updateSchemaFromFields(newFields);
    };

    const columns = [
        {
            title: '字段名',
            dataIndex: 'name',
            width: '30%',
            render: (text: string, record: SchemaField, index: number) => (
                <Input
                    value={text}
                    placeholder="如 reasoning"
                    onChange={e => handleFieldChange(index, 'name', e.target.value)}
                />
            )
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: '25%',
            render: (text: string, record: SchemaField, index: number) => (
                <Select
                    value={text}
                    style={{ width: '100%' }}
                    options={FIELD_TYPES}
                    onChange={val => handleFieldChange(index, 'type', val)}
                />
            )
        },
        {
            title: '描述',
            dataIndex: 'description',
            width: '35%',
            render: (text: string, record: SchemaField, index: number) => (
                <Input
                    value={text}
                    placeholder="字段含义描述"
                    onChange={e => handleFieldChange(index, 'description', e.target.value)}
                />
            )
        },
        {
            title: 'required',
            dataIndex: 'required',
            width: 60,
            render: (checked: boolean, record: SchemaField, index: number) => (
                <Switch
                    size="small"
                    checked={checked}
                    onChange={val => handleFieldChange(index, 'required', val)}
                />
            )
        },
        {
            title: '',
            width: 40,
            render: (_: unknown, __: unknown, index: number) => (
                <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeField(index)}
                />
            )
        }
    ];

    return (
        <Card
            size="small"
            title={
                <Space>
                    {isVisualMode ? <TableOutlined /> : <CodeOutlined />}
                    <span>输出结构定义</span>
                    <Tooltip title="定义 Agent 输出的 JSON 结构">
                        <QuestionCircleOutlined style={{ color: token.colorTextSecondary }} />
                    </Tooltip>
                </Space>
            }
            extra={
                <Switch
                    checkedChildren="可视化"
                    unCheckedChildren="代码"
                    checked={isVisualMode}
                    onChange={(checked) => setIsVisualMode(checked)}
                />
            }
            bodyStyle={{ padding: isVisualMode ? 16 : 0 }}
        >
            {isVisualMode ? (
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Table
                        dataSource={fields}
                        columns={columns}
                        pagination={false}
                        size="small"
                        rowKey={(r, i) => i?.toString() || ''}
                        locale={{ emptyText: '暂无字段，请添加' }}
                    />
                    <Button type="dashed" block icon={<PlusOutlined />} onClick={addField}>
                        添加字段
                    </Button>
                </Space>
            ) : (
                <TextArea
                    value={value}
                    onChange={(e) => {
                        onChange?.(e.target.value);
                        try {
                            JSON.parse(e.target.value);
                            setJsonError(null);
                        } catch (err) {
                            setJsonError('Invalid JSON');
                        }
                    }}
                    rows={12}
                    style={{ border: 'none', borderRadius: 0, fontFamily: 'monospace' }}
                    placeholder="{ type: 'object', ... }"
                />
            )}
            {!isVisualMode && jsonError && <Text type="danger" style={{ padding: 8 }}>{jsonError}</Text>}
        </Card>
    );
};

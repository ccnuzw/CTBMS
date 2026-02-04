import { Button, App, Popconfirm, Tag, Space, Modal, Typography, Divider, Descriptions, Switch } from 'antd';
import { useMemo, useState, useRef } from 'react';
import { ActionType, ProColumns, ProTable, ModalForm, ProFormText, ProFormSelect, ProFormDigit, ProFormSwitch, ProFormDependency } from '@ant-design/pro-components';
import { useMappingRules, useCreateMappingRule, useUpdateMappingRule, useDeleteMappingRule, useDictionaryDomains } from '../api';
import { BusinessMappingRule } from '../types';
import { PlusOutlined, EditOutlined, DeleteOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useDictionaries } from '@/hooks/useDictionaries';

const { Title, Paragraph, Text } = Typography;

// Define Mappings
const DOMAIN_FALLBACK = {
    PRICE_SOURCE_TYPE: { text: '价格来源 (Source)', status: 'Processing', color: 'geekblue' },
    PRICE_SUB_TYPE: { text: '价格类型 (SubType)', status: 'Default', color: 'geekblue' },
    SENTIMENT: { text: '情感倾向 (Sentiment)', status: 'Success', color: 'green' },
    GEO_LEVEL: { text: '地理层级 (Geo)', status: 'Warning', color: 'orange' },
};

const MATCH_MODE_ENUM = {
    CONTAINS: { text: '包含 (Contains)', color: 'cyan' },
    EXACT: { text: '精确 (Exact)', color: 'purple' },
    REGEX: { text: '正则 (Regex)', color: 'red' },
};

// Target Options Definition
const TARGET_OPTIONS_FALLBACK: Record<string, Record<string, string>> = {
    PRICE_SOURCE_TYPE: {
        ENTERPRISE: '企业 (ENTERPRISE)',
        REGIONAL: '区域 (REGIONAL)',
        PORT: '港口 (PORT)',
        STATION: '站台 (STATION)',
        MARKET: '市场 (MARKET)',
    },
    PRICE_SUB_TYPE: {
        LISTED: '挂牌价 (LISTED)',
        TRANSACTION: '成交价 (TRANSACTION)',
        ARRIVAL: '到港价 (ARRIVAL)',
        FOB: '平舱价 (FOB)',
        STATION_ORIGIN: '站台-产区 (STATION_ORIGIN)',
        STATION_DEST: '站台-销区 (STATION_DEST)',
        PURCHASE: '收购价 (PURCHASE)',
        WHOLESALE: '批发价 (WHOLESALE)',
    },
    SENTIMENT: {
        positive: '积极/看涨 (positive)',
        negative: '消极/看跌 (negative)',
        neutral: '中性/持平 (neutral)',
    },
    GEO_LEVEL: {
        COUNTRY: '国家 (COUNTRY)',
        REGION: '大区 (REGION)',
        PROVINCE: '省级 (PROVINCE)',
        CITY: '市级 (CITY)',
        DISTRICT: '区县 (DISTRICT)',
        PORT: '港口 (PORT)',
        STATION: '站台 (STATION)',
        ENTERPRISE: '企业 (ENTERPRISE)',
    },
};

export const LogicRulesPage = () => {
    const { message } = App.useApp();
    const actionRef = useRef<ActionType>();
    const { data: rules, isLoading, refetch } = useMappingRules();
    const { data: dictionaryDomains } = useDictionaryDomains(false);
    const domainCodes = useMemo(() => (dictionaryDomains || []).map((domain) => domain.code), [dictionaryDomains]);
    const { data: dictionaries } = useDictionaries(domainCodes);
    const createMutation = useCreateMappingRule();
    const updateMutation = useUpdateMappingRule();
    const deleteMutation = useDeleteMappingRule();

    // State for Modal
    const [modalVisible, setModalVisible] = useState(false);
    const [helpVisible, setHelpVisible] = useState(false);
    const [currentRow, setCurrentRow] = useState<BusinessMappingRule | null>(null);

    const domainValueEnum = useMemo(() => {
        if (!dictionaryDomains || dictionaryDomains.length === 0) {
            return Object.entries(DOMAIN_FALLBACK).reduce<Record<string, string>>((acc, [code, meta]) => {
                acc[code] = meta.text;
                return acc;
            }, {});
        }
        return dictionaryDomains.reduce<Record<string, string>>((acc, domain) => {
            acc[domain.code] = `${domain.name} (${domain.code})`;
            return acc;
        }, {});
    }, [dictionaryDomains]);

    const domainLabelMap = useMemo(() => {
        if (!dictionaryDomains || dictionaryDomains.length === 0) {
            return Object.entries(DOMAIN_FALLBACK).reduce<Record<string, string>>((acc, [code, meta]) => {
                acc[code] = meta.text;
                return acc;
            }, {});
        }
        return dictionaryDomains.reduce<Record<string, string>>((acc, domain) => {
            acc[domain.code] = domain.name;
            return acc;
        }, {});
    }, [dictionaryDomains]);

    const domainColorMap = useMemo(() => {
        return Object.entries(DOMAIN_FALLBACK).reduce<Record<string, string>>((acc, [code, meta]) => {
            acc[code] = meta.color;
            return acc;
        }, {});
    }, []);

    const targetLabelMap = useMemo(() => {
        if (!domainCodes.length || !dictionaries) return TARGET_OPTIONS_FALLBACK;
        return domainCodes.reduce<Record<string, Record<string, string>>>((acc, code) => {
            const items = dictionaries[code] || [];
            acc[code] = items.reduce<Record<string, string>>((itemAcc, item) => {
                itemAcc[item.code] = item.label;
                return itemAcc;
            }, {});
            return acc;
        }, {});
    }, [domainCodes, dictionaries]);

    const handleEdit = (record: BusinessMappingRule) => {
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

    const handleToggleStatus = async (id: string, checked: boolean) => {
        try {
            await updateMutation.mutateAsync({ id, data: { isActive: checked } });
            message.success(checked ? '规则已启用' : '规则已禁用');
            refetch();
        } catch (error) {
            message.error('状态更新失败');
        }
    };

    const columns: ProColumns<BusinessMappingRule>[] = [
        {
            title: '业务域 (Domain)',
            dataIndex: 'domain',
            width: 180,
            render: (_, record) => {
                const label = domainLabelMap[record.domain] || record.domain;
                const color = domainColorMap[record.domain] || 'default';
                return <Tag color={color}>{label}</Tag>;
            },
        },
        {
            title: '匹配模式',
            dataIndex: 'matchMode',
            width: 120,
            render: (_, record) => {
                const map = MATCH_MODE_ENUM[record.matchMode as keyof typeof MATCH_MODE_ENUM];
                return <Tag color={map?.color}>{map?.text || record.matchMode}</Tag>;
            },
        },
        {
            title: '匹配范式 (Pattern)',
            dataIndex: 'pattern',
            copyable: true,
            render: (_, record) => <span style={{ fontWeight: 600 }}>{record.pattern}</span>,
        },
        {
            title: '目标值 (Target)',
            dataIndex: 'targetValue',
            width: 250,
            render: (_, record) => {
                const domainOptions = targetLabelMap[record.domain] || {};
                const friendly = domainOptions[record.targetValue];
                return (
                    <Space>
                        <Tag color="blue">{record.targetValue}</Tag>
                        {friendly && <span style={{ color: '#666', fontSize: 13 }}>{friendly}</span>}
                    </Space>
                );
            },
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            width: 80,
            render: (_, record) => record.priority,
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 100,
            render: (_, record) => (
                <Switch
                    checked={record.isActive}
                    checkedChildren="启用"
                    unCheckedChildren="禁用"
                    onChange={(checked) => handleToggleStatus(record.id, checked)}
                    loading={updateMutation.isPending && currentRow?.id === record.id} // Optional loading state
                />
            ),
        },
        {
            title: '操作',
            width: 200,
            key: 'option',
            valueType: 'option',
            render: (_, record) => [
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
                    title="确定删除此规则?"
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
            <ProTable<BusinessMappingRule>
                headerTitle="业务逻辑映射规则 (Business Rules)"
                actionRef={actionRef}
                rowKey="id"
                loading={isLoading}
                dataSource={rules || []}
                columns={columns}
                search={false}
                options={{
                    reload: () => refetch(),
                    density: true,
                    fullScreen: true,
                    setting: true,
                }}
                pagination={{
                    pageSize: 20,
                }}
                toolBarRender={() => [
                    <Button
                        key="button"
                        icon={<PlusOutlined />}
                        type="primary"
                        onClick={handleCreate}
                    >
                        新建规则
                    </Button>,
                    <Button
                        key="help"
                        icon={<QuestionCircleOutlined />}
                        onClick={() => setHelpVisible(true)}
                    >
                        使用说明
                    </Button>,
                ]}
            />

            <ModalForm
                title={currentRow ? "编辑规则" : "新建规则"}
                open={modalVisible}
                onOpenChange={setModalVisible}
                onFinish={handleFinish}
                initialValues={currentRow || {
                    priority: 0,
                    isActive: true,
                    matchMode: 'CONTAINS'
                }}
                modalProps={{
                    destroyOnClose: true
                }}
            >
                <ProFormSelect
                    name="domain"
                    label="业务域 (Domain)"
                    tooltip="决定规则适用的场景。例如：解析价格类型请选'PriceSubType'，分析情感请选'Sentiment'。"
                    placeholder="请选择业务场景"
                    valueEnum={Object.keys(domainValueEnum).length ? domainValueEnum : undefined}
                    rules={[{ required: true }]}
                />

                <ProFormSelect
                    name="matchMode"
                    label="匹配模式"
                    valueEnum={{
                        CONTAINS: '包含 (Contains)',
                        EXACT: '精确 (Exact)',
                        REGEX: '正则 (Regex)',
                    }}
                    rules={[{ required: true }]}
                />

                <ProFormText
                    name="pattern"
                    label="匹配范式 (Pattern)"
                    tooltip="需要匹配的关键词或正则表达式"
                    rules={[{ required: true }]}
                />



                <ProFormDependency name={['domain']}>
                    {({ domain }) => {
                        const options = targetLabelMap[domain] || {};
                        const isKnownDomain = Object.keys(options).length > 0;

                        if (!isKnownDomain) {
                            return (
                                <ProFormText
                                    name="targetValue"
                                    label="目标值 (Target)"
                                    placeholder="请先选择业务域，系统将自动加载标准词库"
                                    disabled
                                    rules={[{ required: true }]}
                                />
                            );
                        }

                        return (
                            <ProFormSelect
                                name="targetValue"
                                label="目标值 (Target)"
                                tooltip="请选择系统预定义的标准代码，确保下游统计准确。"
                                placeholder="请选择标准代码"
                                valueEnum={options}
                                rules={[{ required: true }]}
                            />
                        );
                    }}
                </ProFormDependency>



                <ProFormDigit
                    name="priority"
                    label="优先级"
                    tooltip="数值越大优先级越高"
                    min={0}
                    max={100}
                />

                <ProFormSwitch
                    name="isActive"
                    label="启用状态"
                />

            </ModalForm>

            <Modal
                title="业务规则配置指南"
                open={helpVisible}
                onCancel={() => setHelpVisible(false)}
                footer={null}
                width={800}
            >
                <Typography>
                    <Paragraph>
                        业务映射规则用于将非结构化的市场信息（如“平舱价”、“看涨”）转换为系统标准代码。规则修改后即时生效。
                    </Paragraph>

                    <Divider orientation="left">1. 业务域说明 (Business Domains)</Divider>
                    <Paragraph>
                        <ul>
                            <li>
                                <Text strong>价格来源 (PRICE_SOURCE_TYPE)</Text>: 识别价格是谁报出的。
                                <br />示例: "港务" &rarr; <Tag>PORT</Tag>, "生物/化工/淀粉" &rarr; <Tag>ENTERPRISE</Tag>
                            </li>
                            <li>
                                <Text strong>价格类型 (PRICE_SUB_TYPE)</Text>: 识别价格的交易属性。
                                <br />示例: "平舱" &rarr; <Tag>FOB</Tag>, "到港/挂牌" &rarr; <Tag>ARRIVAL</Tag>
                            </li>
                            <li>
                                <Text strong>情感倾向 (SENTIMENT)</Text>: 分析市场情绪（用于AI分析报告）。
                                <br />示例: "坚挺/上行" &rarr; <Tag>positive</Tag>, "疲软/回落" &rarr; <Tag>negative</Tag>, "震荡/企稳" &rarr; <Tag>neutral</Tag>
                            </li>
                            <li>
                                <Text strong>地理层级 (GEO_LEVEL)</Text>: 识别地名级别（用于地理标准化）。
                                <br />示例: "市" &rarr; <Tag>CITY</Tag>, "港" &rarr; <Tag>PORT</Tag>
                            </li>
                        </ul>
                    </Paragraph>

                    <Divider orientation="left">2. 匹配模式说明</Divider>
                    <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label={<Tag color="cyan">包含 (CONTAINS)</Tag>}>
                            目标文本中只要包含关键词即触发。例如 Pattern="平舱"，则 "鲅鱼圈平舱价" 会命中。是最常用的模式。
                        </Descriptions.Item>
                        <Descriptions.Item label={<Tag color="purple">精确 (EXACT)</Tag>}>
                            目标文本必须完全等于关键词。例如 Pattern="FOB"，则 "FOB" 命中，但 "FOB价" 不命中。
                        </Descriptions.Item>
                        <Descriptions.Item label={<Tag color="red">正则 (REGEX)</Tag>}>
                            高级模式，支持 JavaScript 正则表达式。例如 `\d{4}年` 匹配年份。请谨慎使用，错误的正则可能导致解析失败。
                        </Descriptions.Item>
                    </Descriptions>

                    <Divider orientation="left">3. 常见问题</Divider>
                    <Paragraph>
                        <ul>
                            <li><Text strong>优先级:</Text> 如果多个规则同时命中（例如“FOB”和“平舱”同时出现在一句话中），系统优先采用数字更大的规则。</li>
                            <li><Text strong>目标值:</Text> 系统会自动根据业务域提供标准代码（如 FOB, ARRIVAL）及对应的中文说明，请在下拉菜单中直接选择。</li>
                        </ul>
                    </Paragraph>
                </Typography>
            </Modal>
        </div>
    );
};

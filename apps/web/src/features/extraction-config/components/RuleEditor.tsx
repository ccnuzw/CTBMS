import React, { useState, useEffect } from 'react';
import {
    Card,
    Form,
    Input,
    Select,
    Button,
    Space,
    Divider,
    Tag,
    Typography,
    Row,
    Col,
    Switch,
    InputNumber,
    Alert,
    Flex,
    theme,
    Tooltip,
    App,
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    PlayCircleOutlined,
    SaveOutlined,
    ArrowRightOutlined,
    ThunderboltOutlined,
    QuestionCircleOutlined,
} from '@ant-design/icons';
import {
    useEventTypes,
    useInsightTypes,
    useCreateExtractionRule,
    useUpdateExtractionRule,
    useTestConditions,
    RuleCondition,
    ExtractionRule,
} from '../api/hooks';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 条件类型选项
const CONDITION_TYPE_OPTIONS = [
    { label: '采集点名称', value: 'COLLECTION_POINT', color: '#1890ff' },
    { label: '关键词', value: 'KEYWORD', color: '#52c41a' },
    { label: '数字+单位', value: 'NUMBER', color: '#faad14' },
    { label: '日期', value: 'DATE', color: '#722ed1' },
    { label: '区域名称', value: 'REGION', color: '#13c2c2' },
    { label: '品种名称', value: 'COMMODITY', color: '#eb2f96' },
];

// 连接词选项
const CONNECTOR_OPTIONS = [
    { label: '后面紧跟', value: 'FOLLOWED_BY', desc: '紧邻出现' },
    { label: '后面包含', value: 'FOLLOWED_CONTAINS', desc: '50字内包含' },
    { label: '前面包含', value: 'PRECEDED_BY', desc: '前50字内包含' },
    { label: '同句出现', value: 'SAME_SENTENCE', desc: '同一句子内' },
    { label: '同段出现', value: 'SAME_PARAGRAPH', desc: '同一段落内' },
];

// 提取字段选项
const EXTRACT_FIELD_OPTIONS = [
    { label: '作为主体', value: 'subject' },
    { label: '作为动作', value: 'action' },
    { label: '作为数值', value: 'value' },
];

interface RuleEditorProps {
    rule?: ExtractionRule | null;
    onSave?: () => void;
    onCancel?: () => void;
    autoFocusProps?: any;
}

export const RuleEditor: React.FC<RuleEditorProps> = ({ rule, onSave, onCancel, autoFocusProps }) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [conditions, setConditions] = useState<RuleCondition[]>([]);
    const [testText, setTestText] = useState('');
    const [testResults, setTestResults] = useState<any[]>([]);
    const [targetType, setTargetType] = useState<'EVENT' | 'INSIGHT'>('EVENT');

    const { data: eventTypes } = useEventTypes();
    const { data: insightTypes } = useInsightTypes();
    const createMutation = useCreateExtractionRule();
    const updateMutation = useUpdateExtractionRule();
    const testMutation = useTestConditions();

    // 初始化编辑模式
    useEffect(() => {
        if (rule) {
            form.setFieldsValue({
                name: rule.name,
                description: rule.description,
                targetType: rule.targetType,
                eventTypeId: rule.eventTypeId,
                insightTypeId: rule.insightTypeId,
                priority: rule.priority,
                isActive: rule.isActive,
            });
            setTargetType(rule.targetType as 'EVENT' | 'INSIGHT');
            setConditions(rule.conditions || []);
        } else {
            // 新建时添加一个空条件
            setConditions([createEmptyCondition()]);
        }
    }, [rule, form]);

    const createEmptyCondition = (): RuleCondition => ({
        id: Date.now().toString(),
        leftType: 'KEYWORD',
        leftValue: [],
        connector: 'FOLLOWED_BY',
        rightType: 'KEYWORD',
        rightValue: [],
    });

    const addCondition = () => {
        setConditions([...conditions, createEmptyCondition()]);
    };

    const removeCondition = (id: string) => {
        if (conditions.length > 1) {
            setConditions(conditions.filter((c) => c.id !== id));
        }
    };

    const updateCondition = (id: string, field: string, value: any) => {
        setConditions(
            conditions.map((c) => (c.id === id ? { ...c, [field]: value } : c))
        );
    };

    const handleTest = async () => {
        if (!testText.trim()) {
            message.warning('请输入测试文本');
            return;
        }
        try {
            const results = await testMutation.mutateAsync({ conditions, text: testText });
            setTestResults(results);
            if (results.length === 0) {
                message.info('未匹配到任何结果');
            } else {
                message.success(`匹配到 ${results.length} 条结果`);
            }
        } catch (error) {
            message.error('测试失败');
        }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            if (conditions.length === 0) {
                message.warning('请至少添加一个条件');
                return;
            }

            const data = {
                ...values,
                conditions,
                outputConfig: {},
            };

            if (rule) {
                await updateMutation.mutateAsync({ id: rule.id, ...data });
                message.success('规则更新成功');
            } else {
                await createMutation.mutateAsync(data);
                message.success('规则创建成功');
            }
            onSave?.();
        } catch (error) {
            message.error('保存失败');
        }
    };

    const renderConditionItem = (condition: RuleCondition, index: number) => {
        const leftTypeOption = CONDITION_TYPE_OPTIONS.find((o) => o.value === condition.leftType);
        const rightTypeOption = CONDITION_TYPE_OPTIONS.find((o) => o.value === condition.rightType);

        return (
            <Card
                key={condition.id}
                size="small"
                style={{
                    marginBottom: 12,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: token.borderRadiusLG,
                }}
            >
                <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
                    <Tag color={token.colorPrimary}>条件 {index + 1}</Tag>
                    {conditions.length > 1 && (
                        <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => removeCondition(condition.id)}
                        />
                    )}
                </Flex>

                <Row gutter={[12, 12]}>
                    {/* 左侧条件 */}
                    <Col span={24}>
                        <Flex align="center" gap={8} wrap="wrap">
                            <Text type="secondary">当</Text>
                            <Select
                                value={condition.leftType}
                                onChange={(v) => updateCondition(condition.id, 'leftType', v)}
                                style={{ width: 120 }}
                                size="small"
                                options={CONDITION_TYPE_OPTIONS}
                            />
                            {condition.leftType === 'KEYWORD' && (
                                <Select
                                    mode="tags"
                                    value={condition.leftValue}
                                    onChange={(v) => updateCondition(condition.id, 'leftValue', v)}
                                    style={{ minWidth: 200, flex: 1 }}
                                    size="small"
                                    placeholder="输入关键词后回车"
                                    tokenSeparators={[',']}
                                />
                            )}
                            {condition.leftType === 'COLLECTION_POINT' && (
                                <Tag color={leftTypeOption?.color}>自动匹配采集点库</Tag>
                            )}
                            {condition.leftType === 'NUMBER' && (
                                <Tag color={leftTypeOption?.color}>自动匹配数字+单位</Tag>
                            )}
                            {condition.leftType === 'REGION' && (
                                <Tag color={leftTypeOption?.color}>自动匹配区域名</Tag>
                            )}
                            {condition.leftType === 'COMMODITY' && (
                                <Tag color={leftTypeOption?.color}>自动匹配品种名</Tag>
                            )}
                        </Flex>
                    </Col>

                    {/* 连接词 */}
                    <Col span={24}>
                        <Flex align="center" gap={8}>
                            <ArrowRightOutlined style={{ color: token.colorTextSecondary }} />
                            <Select
                                value={condition.connector}
                                onChange={(v) => updateCondition(condition.id, 'connector', v)}
                                style={{ width: 140 }}
                                size="small"
                            >
                                {CONNECTOR_OPTIONS.map((opt) => (
                                    <Select.Option key={opt.value} value={opt.value}>
                                        <Flex align="center" gap={4}>
                                            <span>{opt.label}</span>
                                            <Text type="secondary" style={{ fontSize: 10 }}>
                                                ({opt.desc})
                                            </Text>
                                        </Flex>
                                    </Select.Option>
                                ))}
                            </Select>
                        </Flex>
                    </Col>

                    {/* 右侧条件 */}
                    <Col span={24}>
                        <Flex align="center" gap={8} wrap="wrap">
                            <Text type="secondary">出现</Text>
                            <Select
                                value={condition.rightType}
                                onChange={(v) => updateCondition(condition.id, 'rightType', v)}
                                style={{ width: 120 }}
                                size="small"
                                options={CONDITION_TYPE_OPTIONS}
                            />
                            {condition.rightType === 'KEYWORD' && (
                                <Select
                                    mode="tags"
                                    value={condition.rightValue}
                                    onChange={(v) => updateCondition(condition.id, 'rightValue', v)}
                                    style={{ minWidth: 200, flex: 1 }}
                                    size="small"
                                    placeholder="输入关键词后回车"
                                    tokenSeparators={[',']}
                                />
                            )}
                            {condition.rightType === 'COLLECTION_POINT' && (
                                <Tag color={rightTypeOption?.color}>自动匹配采集点库</Tag>
                            )}
                            {condition.rightType === 'NUMBER' && (
                                <Tag color={rightTypeOption?.color}>自动匹配数字+单位</Tag>
                            )}
                            {condition.rightType === 'REGION' && (
                                <Tag color={rightTypeOption?.color}>自动匹配区域名</Tag>
                            )}
                            {condition.rightType === 'COMMODITY' && (
                                <Tag color={rightTypeOption?.color}>自动匹配品种名</Tag>
                            )}
                            <Text type="secondary">时，则触发此规则</Text>
                        </Flex>
                    </Col>

                    {/* 提取字段配置 */}
                    <Col span={24}>
                        <Flex align="center" gap={8}>
                            <Text type="secondary" style={{ fontSize: 12 }}>提取：</Text>
                            <Select
                                mode="multiple"
                                value={
                                    condition.extractFields
                                        ? Object.entries(condition.extractFields)
                                            .filter(([_, v]) => v === 'LEFT')
                                            .map(([k]) => `left_${k}`)
                                            .concat(
                                                Object.entries(condition.extractFields)
                                                    .filter(([_, v]) => v === 'RIGHT')
                                                    .map(([k]) => `right_${k}`)
                                            )
                                        : []
                                }
                                onChange={(values: string[]) => {
                                    const extractFields: any = {};
                                    values.forEach((v) => {
                                        const [side, field] = v.split('_');
                                        extractFields[field] = side.toUpperCase();
                                    });
                                    updateCondition(condition.id, 'extractFields', extractFields);
                                }}
                                style={{ minWidth: 200 }}
                                size="small"
                                placeholder="选择要提取的字段"
                            >
                                <Select.Option value="left_subject">左侧 → 主体</Select.Option>
                                <Select.Option value="left_action">左侧 → 动作</Select.Option>
                                <Select.Option value="right_subject">右侧 → 主体</Select.Option>
                                <Select.Option value="right_action">右侧 → 动作</Select.Option>
                                <Select.Option value="right_value">右侧 → 数值</Select.Option>
                            </Select>
                        </Flex>
                    </Col>
                </Row>
            </Card>
        );
    };

    return (
        <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
            {/* 基本信息 */}
            <Card size="small" title="基本信息">
                <Form form={form} layout="vertical" initialValues={{ isActive: true, priority: 0 }}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="name"
                                label="规则名称"
                                rules={[{ required: true, message: '请输入规则名称' }]}
                            >
                                <Input placeholder="如：企业停收检测" {...autoFocusProps} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="targetType"
                                label="规则类型"
                                rules={[{ required: true, message: '请选择类型' }]}
                            >
                                <Select
                                    value={targetType}
                                    onChange={(v) => {
                                        setTargetType(v);
                                        form.setFieldsValue({ eventTypeId: undefined, insightTypeId: undefined });
                                    }}
                                >
                                    <Select.Option value="EVENT">事件提取</Select.Option>
                                    <Select.Option value="INSIGHT">洞察提取</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            {targetType === 'EVENT' ? (
                                <Form.Item
                                    name="eventTypeId"
                                    label="事件类型"
                                    rules={[{ required: true, message: '请选择事件类型' }]}
                                >
                                    <Select placeholder="选择事件类型">
                                        {eventTypes?.map((et) => (
                                            <Select.Option key={et.id} value={et.id}>
                                                <Flex align="center" gap={8}>
                                                    <span
                                                        style={{
                                                            width: 10,
                                                            height: 10,
                                                            borderRadius: 2,
                                                            backgroundColor: et.color || token.colorPrimary,
                                                        }}
                                                    />
                                                    {et.name}
                                                </Flex>
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            ) : (
                                <Form.Item
                                    name="insightTypeId"
                                    label="洞察类型"
                                    rules={[{ required: true, message: '请选择洞察类型' }]}
                                >
                                    <Select placeholder="选择洞察类型">
                                        {insightTypes?.map((it) => (
                                            <Select.Option key={it.id} value={it.id}>
                                                <Flex align="center" gap={8}>
                                                    <span
                                                        style={{
                                                            width: 10,
                                                            height: 10,
                                                            borderRadius: 2,
                                                            backgroundColor: it.color || token.colorPrimary,
                                                        }}
                                                    />
                                                    {it.name}
                                                </Flex>
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            )}
                        </Col>
                        <Col span={6}>
                            <Form.Item name="priority" label="优先级">
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="isActive" label="启用" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item name="description" label="规则描述">
                                <Input.TextArea placeholder="描述此规则的用途" rows={2} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Card>

            {/* 条件编辑器 */}
            <Card
                size="small"
                title={
                    <Flex align="center" gap={8}>
                        <ThunderboltOutlined style={{ color: token.colorWarning }} />
                        <span>匹配条件</span>
                        <Tooltip title="当所有条件都满足时，规则被触发">
                            <QuestionCircleOutlined style={{ color: token.colorTextSecondary }} />
                        </Tooltip>
                    </Flex>
                }
                extra={
                    <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addCondition}>
                        添加条件
                    </Button>
                }
            >
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="条件说明"
                    description={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            配置"当 X 后面紧跟/包含 Y 时"的匹配规则。X 和 Y 可以是关键词、采集点名称、数字等。
                            多个条件之间是 AND 关系。
                        </Text>
                    }
                />
                {conditions.map((condition, index) => renderConditionItem(condition, index))}
            </Card>

            {/* 测试面板 */}
            <Card
                size="small"
                title={
                    <Flex align="center" gap={8}>
                        <PlayCircleOutlined style={{ color: token.colorSuccess }} />
                        <span>规则测试</span>
                    </Flex>
                }
            >
                <TextArea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="粘贴日报内容进行测试..."
                    rows={4}
                    style={{ marginBottom: 12 }}
                />
                <Flex justify="space-between" align="center">
                    <Button
                        icon={<PlayCircleOutlined />}
                        onClick={handleTest}
                        loading={testMutation.isPending}
                    >
                        测试匹配
                    </Button>
                    {testResults.length > 0 && (
                        <Tag color="green">{testResults.length} 条匹配结果</Tag>
                    )}
                </Flex>
                {testResults.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        {testResults.map((result, i) => (
                            <Card
                                key={i}
                                size="small"
                                style={{ marginBottom: 8, background: token.colorSuccessBg }}
                            >
                                <Text strong>匹配文本：</Text>
                                <Paragraph
                                    style={{
                                        margin: '4px 0',
                                        padding: 8,
                                        background: token.colorBgContainer,
                                        borderRadius: 4,
                                    }}
                                >
                                    {result.sourceText}
                                </Paragraph>
                                {result.extractedData && (
                                    <Flex gap={8}>
                                        {result.extractedData.subject && (
                                            <Tag>主体: {result.extractedData.subject}</Tag>
                                        )}
                                        {result.extractedData.action && (
                                            <Tag>动作: {result.extractedData.action}</Tag>
                                        )}
                                    </Flex>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </Card>

            {/* 操作按钮 */}
            <Flex justify="flex-end" gap={12}>
                {onCancel && <Button onClick={onCancel}>取消</Button>}
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    loading={createMutation.isPending || updateMutation.isPending}
                >
                    {rule ? '保存修改' : '创建规则'}
                </Button>
            </Flex>
        </div>
    );
};

export default RuleEditor;

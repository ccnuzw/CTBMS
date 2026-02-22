import React, { useState, useEffect } from 'react';
import { Card, Form, Radio, Space, Switch, Typography, Divider, Input, Button, Row, Col, Tooltip, theme } from 'antd';
import { SafetyCertificateOutlined, PlusOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface GuardrailsConfig {
    requireEvidence?: boolean;
    noHallucination?: boolean;
    blockPii?: boolean;
    blockToxicity?: boolean;
    blockCompetitors?: boolean;
    customRules?: { key: string; description: string; enabled: boolean }[];
}

interface VisualGuardrailsBuilderProps {
    value?: GuardrailsConfig;
    onChange?: (value: GuardrailsConfig) => void;
}

const PRESETS = {
    LOOSE: {
        requireEvidence: false,
        noHallucination: true,
        blockPii: false,
        blockToxicity: true,
        blockCompetitors: false,
    },
    MODERATE: {
        requireEvidence: true,
        noHallucination: true,
        blockPii: true,
        blockToxicity: true,
        blockCompetitors: false,
    },
    STRICT: {
        requireEvidence: true,
        noHallucination: true,
        blockPii: true,
        blockToxicity: true,
        blockCompetitors: true,
    },
};

export const VisualGuardrailsBuilder: React.FC<VisualGuardrailsBuilderProps> = ({ value = {}, onChange }) => {
    const { token } = theme.useToken();
    const [preset, setPreset] = useState<'LOOSE' | 'MODERATE' | 'STRICT' | 'CUSTOM'>('CUSTOM');

    // Detect preset on mount or value change
    useEffect(() => {
        if (!value) return;

        // Simple deep equality check for presets (ignoring customRules for preset detection)
        const currentConfigWithoutCustom = {
            requireEvidence: !!value.requireEvidence,
            noHallucination: !!value.noHallucination,
            blockPii: !!value.blockPii,
            blockToxicity: !!value.blockToxicity,
            blockCompetitors: !!value.blockCompetitors,
        };

        const isLoose = JSON.stringify(currentConfigWithoutCustom) === JSON.stringify(PRESETS.LOOSE);
        const isModerate = JSON.stringify(currentConfigWithoutCustom) === JSON.stringify(PRESETS.MODERATE);
        const isStrict = JSON.stringify(currentConfigWithoutCustom) === JSON.stringify(PRESETS.STRICT);

        if (isLoose) setPreset('LOOSE');
        else if (isModerate) setPreset('MODERATE');
        else if (isStrict) setPreset('STRICT');
        else setPreset('CUSTOM');
    }, [value]);

    const handlePresetChange = (e: any) => {
        const newPreset = e.target.value;
        setPreset(newPreset);
        if (newPreset !== 'CUSTOM') {
            const presetConfig = PRESETS[newPreset as keyof typeof PRESETS];
            onChange?.({
                ...value,
                ...presetConfig,
            });
        }
    };

    const handleSwitchChange = (key: keyof GuardrailsConfig, checked: boolean) => {
        setPreset('CUSTOM'); // Switching manual toggles makes it custom
        onChange?.({
            ...value,
            [key]: checked,
        });
    };

    const addCustomRule = () => {
        const newRules = [...(value.customRules || []), { key: '', description: '', enabled: true }];
        onChange?.({ ...value, customRules: newRules });
    };

    const updateCustomRule = (index: number, field: string, val: any) => {
        const newRules = [...(value.customRules || [])];
        newRules[index] = { ...newRules[index], [field]: val };
        onChange?.({ ...value, customRules: newRules });
    };

    const removeCustomRule = (index: number) => {
        const newRules = [...(value.customRules || [])];
        newRules.splice(index, 1);
        onChange?.({ ...value, customRules: newRules });
    };

    return (
        <Card
            size="small"
            title={
                <Space>
                    <SafetyCertificateOutlined style={{ color: token.colorSuccess }} />
                    <span>安全防护规则 (Guardrails)</span>
                </Space>
            }
        >
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                {/* Preset Selection */}
                <div>
                    <Text strong>安全级别预设</Text>
                    <div style={{ marginTop: 8 }}>
                        <Radio.Group value={preset} onChange={handlePresetChange} optionType="button" buttonStyle="solid">
                            <Radio.Button value="LOOSE">宽松 (Loose)</Radio.Button>
                            <Radio.Button value="MODERATE">标准 (Moderate)</Radio.Button>
                            <Radio.Button value="STRICT">严格 (Strict)</Radio.Button>
                            <Radio.Button value="CUSTOM">自定义</Radio.Button>
                        </Radio.Group>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        {preset === 'LOOSE' && '仅开启基本的防幻觉和毒性检测，允许最大的创意空间。'}
                        {preset === 'MODERATE' && '标准企业级防护，平衡了安全性与灵活性，开启 PII 保护。'}
                        {preset === 'STRICT' && '最高安全等级，强制证据引用，屏蔽竞品提及，严格过滤敏感信息。'}
                        {preset === 'CUSTOM' && '手动配置每一项防护规则。'}
                    </Text>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                {/* Detailed Toggles */}
                <Row gutter={[16, 16]}>
                    <Col span={12}>
                        <Space direction="vertical" size={2}>
                            <Space>
                                <Text>防幻觉增强</Text>
                                <Tooltip title="强制模型进行自我反思，减少捏造事实">
                                    <InfoCircleOutlined style={{ color: token.colorTextSecondary }} />
                                </Tooltip>
                            </Space>
                            <Switch
                                checked={!!value.noHallucination}
                                onChange={(c) => handleSwitchChange('noHallucination', c)}
                                checkedChildren="开启"
                                unCheckedChildren="关闭"
                            />
                        </Space>
                    </Col>
                    <Col span={12}>
                        <Space direction="vertical" size={2}>
                            <Space>
                                <Text>强制证据引用</Text>
                                <Tooltip title="要求回答必须引用上下文中的具体片段">
                                    <InfoCircleOutlined style={{ color: token.colorTextSecondary }} />
                                </Tooltip>
                            </Space>
                            <Switch
                                checked={!!value.requireEvidence}
                                onChange={(c) => handleSwitchChange('requireEvidence', c)}
                                checkedChildren="开启"
                                unCheckedChildren="关闭"
                            />
                        </Space>
                    </Col>
                    <Col span={12}>
                        <Space direction="vertical" size={2}>
                            <Space>
                                <Text>PII 敏感信息过滤</Text>
                                <Tooltip title="自动掩盖手机号、邮箱、身份证等个人信息">
                                    <InfoCircleOutlined style={{ color: token.colorTextSecondary }} />
                                </Tooltip>
                            </Space>
                            <Switch
                                checked={!!value.blockPii}
                                onChange={(c) => handleSwitchChange('blockPii', c)}
                                checkedChildren="开启"
                                unCheckedChildren="关闭"
                            />
                        </Space>
                    </Col>
                    <Col span={12}>
                        <Space direction="vertical" size={2}>
                            <Space>
                                <Text>毒性/辱骂检测</Text>
                                <Tooltip title="拦截不文明用语和攻击性言论">
                                    <InfoCircleOutlined style={{ color: token.colorTextSecondary }} />
                                </Tooltip>
                            </Space>
                            <Switch
                                checked={!!value.blockToxicity}
                                onChange={(c) => handleSwitchChange('blockToxicity', c)}
                                checkedChildren="开启"
                                unCheckedChildren="关闭"
                            />
                        </Space>
                    </Col>
                    <Col span={12}>
                        <Space direction="vertical" size={2}>
                            <Space>
                                <Text>竞品提及屏蔽</Text>
                                <Tooltip title="禁止在回答中提及竞争对手名称">
                                    <InfoCircleOutlined style={{ color: token.colorTextSecondary }} />
                                </Tooltip>
                            </Space>
                            <Switch
                                checked={!!value.blockCompetitors}
                                onChange={(c) => handleSwitchChange('blockCompetitors', c)}
                                checkedChildren="开启"
                                unCheckedChildren="关闭"
                            />
                        </Space>
                    </Col>
                </Row>

                <Divider style={{ margin: '8px 0' }} />

                {/* Custom Rules */}
                <div>
                    <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
                        <Text strong>自定义规则 (Custom Rules)</Text>
                        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addCustomRule}>
                            添加规则
                        </Button>
                    </Space>

                    {(value.customRules || []).map((rule, index) => (
                        <Row key={index} gutter={8} style={{ marginBottom: 8 }} align="middle">
                            <Col span={1}>
                                <Switch
                                    size="small"
                                    checked={rule.enabled}
                                    onChange={(c) => updateCustomRule(index, 'enabled', c)}
                                />
                            </Col>
                            <Col span={7}>
                                <Input
                                    placeholder="规则Key (e.g. no_political)"
                                    value={rule.key}
                                    onChange={(e) => updateCustomRule(index, 'key', e.target.value)}
                                    size="small"
                                />
                            </Col>
                            <Col span={14}>
                                <Input
                                    placeholder="规则描述 (e.g. 禁止讨论政治话题)"
                                    value={rule.description}
                                    onChange={(e) => updateCustomRule(index, 'description', e.target.value)}
                                    size="small"
                                />
                            </Col>
                            <Col span={2}>
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => removeCustomRule(index)}
                                    size="small"
                                />
                            </Col>
                        </Row>
                    ))}
                    {(value.customRules || []).length === 0 && (
                        <div style={{ textAlign: 'center', color: token.colorTextQuaternary, padding: '8px 0' }}>
                            暂无自定义规则
                        </div>
                    )}
                </div>

            </Space>
        </Card>
    );
};

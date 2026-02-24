import React, { useState, useMemo } from 'react';
import {
    ProForm,
    ProFormText,
    ProFormSelect,
    ProFormSwitch,
    ProFormDigit,
    ProFormTextArea,
} from '@ant-design/pro-components';
import { Button, Space, Tag, Typography, Input, theme } from 'antd';
import { CreateMappingRuleDTO, UpdateMappingRuleDTO } from '../types';

interface MappingRuleFormProps {
    initialValues?: Partial<CreateMappingRuleDTO> | UpdateMappingRuleDTO;
    mode: 'create' | 'edit';
}

/**
 * 常用正则模板
 */
const REGEX_TEMPLATES = [
    { label: '邮箱', pattern: '[\\w.-]+@[\\w.-]+\\.\\w+' },
    { label: '数字', pattern: '\\d+(\\.\\d+)?' },
    { label: '中文词组', pattern: '[\\u4e00-\\u9fa5]+' },
    { label: '日期 (YYYY-MM-DD)', pattern: '\\d{4}-\\d{2}-\\d{2}' },
    { label: 'URL', pattern: 'https?://[\\w\\-._~:/?#\\[\\]@!$&\'()*+,;=%]+' },
    { label: '手机号', pattern: '1[3-9]\\d{9}' },
];

/**
 * 正则实时测试器组件
 */
const RegexTester: React.FC<{ pattern?: string }> = ({ pattern }) => {
    const { token } = theme.useToken();
    const [testText, setTestText] = useState('');

    const testResult = useMemo(() => {
        if (!pattern?.trim() || !testText.trim()) {
            return { status: 'empty' as const, segments: [] as React.ReactNode[] };
        }
        try {
            const regex = new RegExp(pattern, 'g');
            const matches: { start: number; end: number }[] = [];
            let match: RegExpExecArray | null;
            while ((match = regex.exec(testText)) !== null) {
                matches.push({ start: match.index, end: match.index + match[0].length });
                if (match[0].length === 0) break; // prevent infinite loop on zero-length matches
            }

            if (matches.length === 0) {
                return { status: 'no_match' as const, segments: [testText] };
            }

            // Build highlighted segments
            const segments: React.ReactNode[] = [];
            let lastEnd = 0;
            matches.forEach((m, i) => {
                if (m.start > lastEnd) {
                    segments.push(testText.slice(lastEnd, m.start));
                }
                segments.push(
                    <span
                        key={i}
                        style={{
                            backgroundColor: token.colorSuccessBg,
                            border: `1px solid ${token.colorSuccessBorder}`,
                            borderRadius: 2,
                            padding: '0 2px',
                        }}
                    >
                        {testText.slice(m.start, m.end)}
                    </span>,
                );
                lastEnd = m.end;
            });
            if (lastEnd < testText.length) {
                segments.push(testText.slice(lastEnd));
            }

            return { status: 'matched' as const, count: matches.length, segments };
        } catch {
            return { status: 'error' as const, segments: [] };
        }
    }, [pattern, testText, token]);

    return (
        <div
            style={{
                backgroundColor: token.colorFillAlter,
                padding: '12px 16px',
                borderRadius: 8,
                marginTop: 8,
                marginBottom: 16,
            }}
        >
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Space>
                    <Typography.Text strong style={{ fontSize: 13 }}>
                        🧪 正则实时测试
                    </Typography.Text>
                    {testResult.status === 'matched' && (
                        <Tag color="success">✅ 命中 {testResult.count} 处</Tag>
                    )}
                    {testResult.status === 'no_match' && <Tag color="warning">❌ 未命中</Tag>}
                    {testResult.status === 'error' && <Tag color="error">⚠️ 表达式语法错误</Tag>}
                    {testResult.status === 'empty' && (
                        <Tag color="default">输入测试文本以验证</Tag>
                    )}
                </Space>
                <Input.TextArea
                    rows={2}
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="在此粘贴待匹配的测试文本，实时查看高亮结果..."
                    style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
                {testResult.segments.length > 0 && testText.trim() && (
                    <div
                        style={{
                            background: token.colorBgContainer,
                            padding: '8px 12px',
                            borderRadius: 6,
                            fontFamily: 'monospace',
                            fontSize: 13,
                            lineHeight: 1.8,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            border: `1px solid ${token.colorBorderSecondary}`,
                        }}
                    >
                        {testResult.segments}
                    </div>
                )}
            </Space>
        </div>
    );
};

export const MappingRuleForm: React.FC<MappingRuleFormProps> = ({ initialValues, mode }) => {
    const { token } = theme.useToken();
    const [currentMatchMode, setCurrentMatchMode] = useState(initialValues?.matchMode || 'CONTAINS');
    const [currentPattern, setCurrentPattern] = useState(
        (initialValues as Record<string, unknown>)?.pattern as string || '',
    );

    const isRegex = currentMatchMode === 'REGEX';

    return (
        <ProForm
            submitter={false}
            layout="vertical"
            initialValues={{
                isActive: true,
                priority: 1,
                matchMode: 'CONTAINS',
                ...initialValues,
            }}
            onValuesChange={(changed) => {
                if (changed.matchMode) {
                    setCurrentMatchMode(changed.matchMode);
                }
                if (changed.pattern !== undefined) {
                    setCurrentPattern(changed.pattern);
                }
            }}
        >
            <ProFormSelect
                name="domain"
                label="业务域 (Domain)"
                placeholder="请选择或输入业务域"
                rules={[{ required: true, message: '业务域是必填项' }]}
                allowClear
                fieldProps={{
                    showSearch: true,
                }}
                options={[
                    { label: 'SENTIMENT (情感分析)', value: 'SENTIMENT' },
                    { label: 'PRICE_SOURCE_TYPE (价格来源类型)', value: 'PRICE_SOURCE_TYPE' },
                    { label: 'PRICE_SUB_TYPE (价格细分类型)', value: 'PRICE_SUB_TYPE' },
                    { label: 'GEO_LEVEL (地理层级)', value: 'GEO_LEVEL' },
                    { label: 'CUSTOM (自定义...)', value: 'CUSTOM' },
                ]}
                tooltip="可以下拉选择系统内置字典，也可以手动输入新域。"
            />

            <ProFormSelect
                name="matchMode"
                label="匹配模式 (Match Mode)"
                placeholder="请选择匹配模式"
                rules={[{ required: true, message: '匹配模式必须选择' }]}
                options={[
                    { label: '包含匹配 (CONTAINS)', value: 'CONTAINS' },
                    { label: '精确匹配 (EXACT)', value: 'EXACT' },
                    { label: '正则表达式 (REGEX)', value: 'REGEX' },
                ]}
                tooltip="推荐使用 CONTAINS（如：文本包含'暴涨'则判定为积极）"
            />

            <ProFormText
                name="pattern"
                label="匹配规则 / 关键词 (Pattern)"
                placeholder={isRegex ? '输入正则表达式，如：(?i)increase|暴涨' : '例如：暴涨、大跌'}
                rules={[{ required: true, message: '匹配规则不能为空' }]}
                tooltip={isRegex ? '使用 JavaScript 正则语法' : '需要匹配的目标文本片段'}
            />

            {isRegex && (
                <>
                    <div style={{ marginTop: -8, marginBottom: 8 }}>
                        <Space size={4} wrap>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                常用模板：
                            </Typography.Text>
                            {REGEX_TEMPLATES.map((tpl) => (
                                <Tag
                                    key={tpl.label}
                                    color="blue"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => {
                                        setCurrentPattern(tpl.pattern);
                                        // ProForm uses form instance internally; we trigger via hidden mechanism
                                        const patternInput = document.querySelector(
                                            'input[id$="pattern"]',
                                        ) as HTMLInputElement | null;
                                        if (patternInput) {
                                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                                window.HTMLInputElement.prototype,
                                                'value',
                                            )?.set;
                                            nativeInputValueSetter?.call(patternInput, tpl.pattern);
                                            patternInput.dispatchEvent(new Event('input', { bubbles: true }));
                                        }
                                    }}
                                >
                                    {tpl.label}
                                </Tag>
                            ))}
                        </Space>
                    </div>
                    <RegexTester pattern={currentPattern} />
                </>
            )}

            <ProFormText
                name="targetValue"
                label="目标映射值 (Target Value)"
                placeholder="例如：positive, negative"
                rules={[{ required: true, message: '目标映射值不能为空' }]}
                tooltip="匹配成功后系统实际采用的标准值"
            />

            <ProFormDigit
                name="priority"
                label="执行优先级 (Priority)"
                placeholder="优先级，数字越大越优先"
                rules={[{ required: true, message: '优先级不能为空' }]}
                min={1}
                max={100}
                tooltip="当一条文本可能命中多条规则时，数字大的规则先生效"
            />

            <ProFormSwitch
                name="isActive"
                label="状态"
                checkedChildren="启用"
                unCheckedChildren="禁用"
            />

            <ProFormTextArea
                name="description"
                label="内部备注 (Description)"
                placeholder="选填，关于这条规则的补充说明"
            />
        </ProForm>
    );
};

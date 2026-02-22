import React, { useState, useEffect } from 'react';
import { Input, Card, Space, Typography, Switch, Button, Tooltip, theme } from 'antd';
import { QuestionCircleOutlined, BuildOutlined, EditOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

interface StructuredPromptBuilderProps {
    value?: string;
    onChange?: (value: string) => void;
}

const SECTION_HEADERS = {
    role: '# 角色设定',
    task: '# 核心任务',
    constraints: '# 约束条件',
    examples: '# 示例',
};

export const StructuredPromptBuilder: React.FC<StructuredPromptBuilderProps> = ({ value = '', onChange }) => {
    const [isStructured, setIsStructured] = useState(false);
    const { token } = theme.useToken();
    const [sections, setSections] = useState({
        role: '',
        task: '',
        constraints: '',
        examples: '',
    });

    // Initialize state based on value
    useEffect(() => {
        if (!value) {
            setIsStructured(true);
            return;
        }

        // Check if the value follows our structure
        const hasRole = value.includes(SECTION_HEADERS.role);
        const hasTask = value.includes(SECTION_HEADERS.task);

        if (hasRole && hasTask) {
            setIsStructured(true);
            // Basic parsing
            const parts = value.split('# ');
            const newSections = { ...sections };
            parts.forEach(part => {
                if (part.startsWith('角色设定')) newSections.role = part.replace('角色设定', '').trim();
                if (part.startsWith('核心任务')) newSections.task = part.replace('核心任务', '').trim();
                if (part.startsWith('约束条件')) newSections.constraints = part.replace('约束条件', '').trim();
                if (part.startsWith('示例')) newSections.examples = part.replace('示例', '').trim();
            });
            setSections(newSections);
        } else {
            // If it doesn't look structured, default to raw mode
            setIsStructured(false);
        }
    }, []); // Only run on mount to detect initial structure

    const updateSection = (key: keyof typeof sections, val: string) => {
        const newSections = { ...sections, [key]: val };
        setSections(newSections);
        composeAndEmit(newSections);
    };

    const composeAndEmit = (currentSections: typeof sections) => {
        const parts = [];
        if (currentSections.role) parts.push(`${SECTION_HEADERS.role}\n${currentSections.role}`);
        if (currentSections.task) parts.push(`${SECTION_HEADERS.task}\n${currentSections.task}`);
        if (currentSections.constraints) parts.push(`${SECTION_HEADERS.constraints}\n${currentSections.constraints}`);
        if (currentSections.examples) parts.push(`${SECTION_HEADERS.examples}\n${currentSections.examples}`);

        const composed = parts.join('\n\n');
        onChange?.(composed);
    };

    return (
        <Card
            size="small"
            title={
                <Space>
                    {isStructured ? <BuildOutlined /> : <EditOutlined />}
                    <span>系统提示词</span>
                    <Tooltip title="结构化模式可以帮助你更好地组织提示词逻辑">
                        <QuestionCircleOutlined style={{ color: token.colorTextSecondary }} />
                    </Tooltip>
                </Space>
            }
            extra={
                <Switch
                    checkedChildren="结构化"
                    unCheckedChildren="纯文本"
                    checked={isStructured}
                    onChange={(checked) => {
                        setIsStructured(checked);
                        if (checked && value && !value.includes(SECTION_HEADERS.role)) {
                            // Try to put everything in Task if switching from raw to structured
                            updateSection('task', value);
                        }
                    }}
                />
            }
            style={{ marginBottom: 16 }}
            bodyStyle={{ padding: isStructured ? 16 : 0 }}
        >
            {isStructured ? (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>🧙‍♂️ 角色设定 (Role)</Text>
                        <TextArea
                            placeholder="你是一个经验丰富的金融分析师，擅长宏观经济分析..."
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            value={sections.role}
                            onChange={(e) => updateSection('role', e.target.value)}
                            style={{ marginTop: 4 }}
                        />
                    </div>
                    <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>🎯 核心任务 (Task)</Text>
                        <TextArea
                            placeholder="你需要阅读提供的新闻材料，提炼出关键的市场影响因子..."
                            autoSize={{ minRows: 3, maxRows: 8 }}
                            value={sections.task}
                            onChange={(e) => updateSection('task', e.target.value)}
                            style={{ marginTop: 4 }}
                        />
                    </div>
                    <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>🚫 约束条件 (Constraints)</Text>
                        <TextArea
                            placeholder="不要输出任何解释性文字，仅输出 JSON..."
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            value={sections.constraints}
                            onChange={(e) => updateSection('constraints', e.target.value)}
                            style={{ marginTop: 4 }}
                        />
                    </div>
                    <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>🌰 示例 (Few-Shot Examples)</Text>
                        <TextArea
                            placeholder="用户输入: ... 助手输出: ..."
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            value={sections.examples}
                            onChange={(e) => updateSection('examples', e.target.value)}
                            style={{ marginTop: 4 }}
                        />
                    </div>
                </Space>
            ) : (
                <TextArea
                    value={value}
                    onChange={(e) => {
                        onChange?.(e.target.value);
                        // Only simple sync back to sections to avoid data loss if toggled back
                        if (!e.target.value.includes(SECTION_HEADERS.role)) {
                            setSections(s => ({ ...s, task: e.target.value }));
                        }
                    }}
                    rows={12}
                    style={{ border: 'none', borderRadius: 0 }}
                    placeholder="请输入系统提示词..."
                />
            )}
        </Card>
    );
};

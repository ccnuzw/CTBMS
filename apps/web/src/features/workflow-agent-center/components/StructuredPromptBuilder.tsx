import React, { useState, useEffect } from 'react';
import { Input, Card, Space, Typography, Switch, Button, Tooltip, theme, Tag, Dropdown } from 'antd';
import { QuestionCircleOutlined, BuildOutlined, EditOutlined, ThunderboltOutlined } from '@ant-design/icons';

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

const QUICK_TEMPLATES = [
    {
        label: '数据分析师',
        role: '你是一个资深的数据分析师，精通宏观经济和商品市场逻辑。',
        task: '你的任务是分析提供的市场数据和新闻，提取关键指标，并给出趋势判断。',
        constraints: '1. 始终保持客观中立\n2. 结论必须有数据支撑\n3. 仅输出最终的分析结构，禁止输出思考过程',
    },
    {
        label: '风控审查员',
        role: '你是一个严格合规的风险控制专家，负责审查所有即将发出的交易指令。',
        task: '核对各项操作是否违规，包括但不限于资金限额、价格偏移报警、黑名单等。',
        constraints: '1. 任何命中高危名单的操作直接拒绝\n2. 输出判断必须明确 YES 或 NO',
    },
    {
        label: '会议总结助手',
        role: '你是一个专业的会议记录秘书。',
        task: '阅读提供的会议转录文本，提取：会议结论、待办事项(To-Do)、遗留问题。',
        constraints: '1. 总结要精炼，不超过300字\n2. 使用 Markdown 无序列表输出',
    },
];

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
                <Space>
                    {isStructured && (
                        <Dropdown
                            menu={{
                                items: QUICK_TEMPLATES.map((tpl, i) => ({
                                    key: String(i),
                                    label: tpl.label,
                                    onClick: () => {
                                        const newSections = {
                                            ...sections,
                                            role: tpl.role,
                                            task: tpl.task,
                                            constraints: tpl.constraints,
                                        };
                                        setSections(newSections);
                                        composeAndEmit(newSections);
                                    }
                                })),
                            }}
                        >
                            <Button size="small" type="dashed" icon={<ThunderboltOutlined />}>快捷模板</Button>
                        </Dropdown>
                    )}
                    <Switch
                        checkedChildren="结构化"
                        unCheckedChildren="纯文本"
                        checked={isStructured}
                        onChange={(checked) => {
                            setIsStructured(checked);
                            if (checked && value && !value.includes(SECTION_HEADERS.role)) {
                                updateSection('task', value);
                            }
                        }}
                    />
                </Space>
            }
            style={{ marginBottom: 16 }}
            bodyStyle={{ padding: isStructured ? 16 : 0 }}
        >
            {isStructured ? (
                <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <div>
                        <Space style={{ marginBottom: 4 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>🧙‍♂️ 角色设定 (Role)</Text>
                            <Tag bordered={false} style={{ fontSize: 10, cursor: 'pointer' }} onClick={() => updateSection('role', sections.role + '你是一个资深的金融分析专家。')}>+ 分析专家</Tag>
                        </Space>
                        <TextArea
                            placeholder="你是一个经验丰富的金融分析师，擅长宏观经济分析..."
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            value={sections.role}
                            onChange={(e) => updateSection('role', e.target.value)}
                        />
                    </div>
                    <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>🎯 核心任务 (Task)</Text>
                        <TextArea
                            placeholder="你需要阅读提供的新闻材料，提炼出关键的市场影响因子..."
                            autoSize={{ minRows: 3, maxRows: 8 }}
                            value={sections.task}
                            onChange={(e) => updateSection('task', e.target.value)}
                        />
                    </div>
                    <div>
                        <Space style={{ marginBottom: 4 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>🚫 约束条件 (Constraints)</Text>
                            <Tag bordered={false} style={{ fontSize: 10, cursor: 'pointer' }} onClick={() => updateSection('constraints', sections.constraints + (sections.constraints ? '\n' : '') + '1. 严格使用 JSON 格式输出，不要包含 markdown 标记。')}>+ 严格 JSON</Tag>
                        </Space>
                        <TextArea
                            placeholder="不要输出任何解释性文字，仅输出 JSON..."
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            value={sections.constraints}
                            onChange={(e) => updateSection('constraints', e.target.value)}
                        />
                    </div>
                    <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>🌰 示例 (Few-Shot Examples)</Text>
                        <TextArea
                            placeholder="用户输入: ... 助手输出: ..."
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            value={sections.examples}
                            onChange={(e) => updateSection('examples', e.target.value)}
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

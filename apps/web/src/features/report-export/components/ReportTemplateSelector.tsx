import React, { useState, useMemo } from 'react';
import {
    Card,
    Col,
    Drawer,
    Flex,
    Input,
    Row,
    Space,
    Tag,
    Typography,
    theme,
    Badge,
    Button,
    Divider,
} from 'antd';
import {
    FileTextOutlined,
    AlertOutlined,
    CalendarOutlined,
    AimOutlined,
    ExperimentOutlined,
    SwapOutlined,
    SafetyCertificateOutlined,
    TeamOutlined,
    SearchOutlined,
    FilePdfOutlined,
    FileWordOutlined,
} from '@ant-design/icons';
import {
    REPORT_TEMPLATES,
    getTemplatesByCategory,
    type ReportTemplate,
} from '../reportTemplates';

const { Text, Paragraph } = Typography;

// 图标映射
const iconMap: Record<string, React.ReactNode> = {
    FileTextOutlined: <FileTextOutlined />,
    AlertOutlined: <AlertOutlined />,
    CalendarOutlined: <CalendarOutlined />,
    AimOutlined: <AimOutlined />,
    ExperimentOutlined: <ExperimentOutlined />,
    SwapOutlined: <SwapOutlined />,
    SafetyCertificateOutlined: <SafetyCertificateOutlined />,
    TeamOutlined: <TeamOutlined />,
};

const formatIcon: Record<string, React.ReactNode> = {
    PDF: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
    WORD: <FileWordOutlined style={{ color: '#1890ff' }} />,
};

const sectionLabels: Record<string, string> = {
    CONCLUSION: '结论',
    EVIDENCE: '证据',
    DEBATE_PROCESS: '讨论过程',
    RISK_ASSESSMENT: '风险评估',
};

interface ReportTemplateSelectorProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (template: ReportTemplate) => void;
}

/**
 * 报告模板选择器
 *
 * 以卡片网格展示所有报告模板，按分类分组，支持搜索。
 * 每个卡片显示模板名称、描述、格式、包含章节和预计页数。
 */
export const ReportTemplateSelector: React.FC<ReportTemplateSelectorProps> = ({
    visible,
    onClose,
    onSelect,
}) => {
    const { token } = theme.useToken();
    const [searchText, setSearchText] = useState('');

    const categories = useMemo(() => getTemplatesByCategory(), []);

    const filteredCategories = useMemo(() => {
        if (!searchText.trim()) return categories;
        const keyword = searchText.trim().toLowerCase();
        return categories
            .map((cat) => ({
                ...cat,
                templates: cat.templates.filter(
                    (t) =>
                        t.name.toLowerCase().includes(keyword) ||
                        t.description.toLowerCase().includes(keyword),
                ),
            }))
            .filter((cat) => cat.templates.length > 0);
    }, [categories, searchText]);

    return (
        <Drawer
            title="选择报告模板"
            open={visible}
            onClose={onClose}
            width={720}
            placement="right"
        >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索报告模板..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                />

                {filteredCategories.map((cat) => (
                    <div key={cat.category}>
                        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                            <Text strong style={{ fontSize: 15 }}>{cat.categoryName}</Text>
                            <Badge count={cat.templates.length} style={{ backgroundColor: token.colorTextQuaternary }} />
                        </Flex>

                        <Row gutter={[12, 12]}>
                            {cat.templates.map((template) => (
                                <Col key={template.templateId} xs={24} sm={12}>
                                    <Card
                                        hoverable
                                        size="small"
                                        onClick={() => onSelect(template)}
                                        style={{
                                            borderLeft: `3px solid ${template.color}`,
                                            cursor: 'pointer',
                                        }}
                                        bodyStyle={{ padding: '12px 16px' }}
                                    >
                                        <Flex gap={10} align="flex-start">
                                            <div
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: token.borderRadius,
                                                    background: `${template.color}15`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 18,
                                                    color: template.color,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {iconMap[template.icon] ?? <FileTextOutlined />}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Flex justify="space-between" align="center">
                                                    <Text strong style={{ fontSize: 14 }}>{template.name}</Text>
                                                    <Space size={4}>
                                                        {formatIcon[template.defaultFormat]}
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            ~{template.estimatedPages}页
                                                        </Text>
                                                    </Space>
                                                </Flex>
                                                <Paragraph
                                                    type="secondary"
                                                    style={{ fontSize: 12, margin: '4px 0 8px', lineHeight: 1.5 }}
                                                    ellipsis={{ rows: 2 }}
                                                >
                                                    {template.description}
                                                </Paragraph>
                                                <Flex gap={4} wrap="wrap">
                                                    {template.sections.map((s) => (
                                                        <Tag key={s} style={{ fontSize: 10, margin: 0, padding: '0 6px' }}>
                                                            {sectionLabels[s] ?? s}
                                                        </Tag>
                                                    ))}
                                                </Flex>
                                            </div>
                                        </Flex>
                                    </Card>
                                </Col>
                            ))}
                        </Row>

                        <Divider style={{ margin: '16px 0' }} />
                    </div>
                ))}
            </Space>
        </Drawer>
    );
};

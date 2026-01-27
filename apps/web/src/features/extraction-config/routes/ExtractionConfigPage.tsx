import React, { useState } from 'react';
import { Typography, Flex, Tabs, theme, Button, Modal, Divider, Alert, Space, Card } from 'antd';
import {
    SettingOutlined,
    ThunderboltOutlined,
    TagsOutlined,
    QuestionCircleOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import { EventTypeManager } from '../components/EventTypeManager';
import { InsightTypeManager } from '../components/InsightTypeManager';
import { RuleManager } from '../components/RuleManager';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Title, Text, Paragraph } = Typography;

export const ExtractionConfigPage: React.FC = () => {
    const { token } = theme.useToken();
    const [helpVisible, setHelpVisible] = useState(false);
    const { containerRef, modalProps, focusRef } = useModalAutoFocus();

    return (
        <Flex vertical gap={16} style={{ padding: 24 }}>
            <Flex justify="space-between" align="center">
                <Title level={3} style={{ margin: 0 }}>
                    <SettingOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                    配置中心
                </Title>
                <Button
                    type="text"
                    icon={<QuestionCircleOutlined />}
                    onClick={() => setHelpVisible(true)}
                >
                    使用说明
                </Button>
            </Flex>

            <Tabs
                defaultActiveKey="rules"
                items={[
                    {
                        key: 'rules',
                        label: (
                            <Flex align="center" gap={6}>
                                <ThunderboltOutlined />
                                提取规则
                            </Flex>
                        ),
                        children: <RuleManager />,
                    },
                    {
                        key: 'event-types',
                        label: (
                            <Flex align="center" gap={6}>
                                <TagsOutlined />
                                事件类型
                            </Flex>
                        ),
                        children: <EventTypeManager />,
                    },
                    {
                        key: 'insight-types',
                        label: (
                            <Flex align="center" gap={6}>
                                <TagsOutlined />
                                洞察类型
                            </Flex>
                        ),
                        children: <InsightTypeManager />,
                    },
                ]}
            />

            {/* 使用说明 Modal */}
            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <QuestionCircleOutlined style={{ color: token.colorPrimary }} />
                        配置中心使用说明
                    </Flex>
                }
                open={helpVisible}
                onCancel={() => setHelpVisible(false)}
                footer={
                    <Button type="primary" onClick={() => setHelpVisible(false)} ref={focusRef}>
                        我知道了
                    </Button>
                }
                width={700}
                afterOpenChange={modalProps.afterOpenChange}
            >
                <div ref={containerRef} tabIndex={-1} style={{ outline: 'none' }}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Alert
                            type="info"
                            showIcon
                            message="配置中心用于管理日报智能分析的提取规则，从原始日报中自动识别和提取市场事件与洞察信息。"
                        />

                        <Card size="small" title={<><ThunderboltOutlined /> 提取规则</>}>
                            <Paragraph>
                                <Text strong>功能说明：</Text>定义从日报中提取信息的匹配规则
                            </Paragraph>
                            <Paragraph style={{ marginBottom: 0 }}>
                                <Text strong>操作步骤：</Text>
                            </Paragraph>
                            <ol style={{ marginTop: 8, paddingLeft: 20 }}>
                                <li>点击<Text code>新建规则</Text>按钮创建规则</li>
                                <li>填写规则名称，选择规则类型（事件/洞察）</li>
                                <li>配置匹配条件：
                                    <ul>
                                        <li><Text type="secondary">当 X 后面紧跟/包含 Y 时触发</Text></li>
                                        <li><Text type="secondary">X/Y 可以是：关键词、采集点名称、数字、区域等</Text></li>
                                    </ul>
                                </li>
                                <li>使用测试功能粘贴日报内容验证规则效果</li>
                                <li>保存规则并启用</li>
                            </ol>
                        </Card>

                        <Card size="small" title={<><TagsOutlined /> 事件类型</>}>
                            <Paragraph>
                                <Text strong>功能说明：</Text>管理可识别的市场事件类型
                            </Paragraph>
                            <Paragraph style={{ marginBottom: 0 }}>
                                <Text strong>预置类型：</Text>
                            </Paragraph>
                            <Flex wrap="wrap" gap={8} style={{ marginTop: 8 }}>
                                <Text code>企业动态</Text>
                                <Text code>供给变化</Text>
                                <Text code>需求变化</Text>
                                <Text code>库存变化</Text>
                                <Text code>政策消息</Text>
                                <Text code>天气影响</Text>
                                <Text code>市场情绪</Text>
                            </Flex>
                        </Card>

                        <Card size="small" title={<><TagsOutlined /> 洞察类型</>}>
                            <Paragraph>
                                <Text strong>功能说明：</Text>管理可识别的市场洞察类型
                            </Paragraph>
                            <Paragraph style={{ marginBottom: 0 }}>
                                <Text strong>预置类型：</Text>
                            </Paragraph>
                            <Flex wrap="wrap" gap={8} style={{ marginTop: 8 }}>
                                <Text code>后市预判</Text>
                                <Text code>分析观点</Text>
                                <Text code>趋势总结</Text>
                                <Text code>关键因素</Text>
                                <Text code>数据引用</Text>
                                <Text code>市场逻辑</Text>
                            </Flex>
                        </Card>

                        <Divider style={{ margin: '8px 0' }} />

                        <Flex align="center" gap={8}>
                            <CheckCircleOutlined style={{ color: token.colorSuccess }} />
                            <Text type="secondary">配置完成后，系统会自动应用规则分析新上报的日报内容</Text>
                        </Flex>
                    </Space>
                </div>
            </Modal>
        </Flex>
    );
};

export default ExtractionConfigPage;



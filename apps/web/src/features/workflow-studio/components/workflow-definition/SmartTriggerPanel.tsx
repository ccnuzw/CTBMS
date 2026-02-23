import React, { useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Flex,
    Input,
    Space,
    Steps,
    Tag,
    Tooltip,
    Typography,
    theme,
} from 'antd';
import {
    BulbOutlined,
    CheckCircleOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    LoadingOutlined,
    RobotOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { useSmartParseParams } from '../../api/workflow-definitions';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface SmartTriggerPanelProps {
    /** The workflow definition ID for the smart-parse-params call */
    workflowDefinitionId: string;
    /** Optional param schema (keys + descriptions) to guide the AI */
    paramSchema?: Record<string, unknown>;
    /** Called when AI successfully parses and user clicks "Use These Params" */
    onParamsFilled: (params: Record<string, unknown>) => void;
    /** Switch back to manual fill mode */
    onSwitchToManual?: () => void;
}

const EXAMPLE_HINTS = [
    '帮我生成今日大豆价格分析报告',
    '分析近一周玉米期货走势',
    '生成一份竞品价格对比简报',
    '今天豆粕的市场风险预警报告',
];

export const SmartTriggerPanel: React.FC<SmartTriggerPanelProps> = ({
    workflowDefinitionId,
    paramSchema,
    onParamsFilled,
    onSwitchToManual,
}) => {
    const { token } = theme.useToken();
    const smartParse = useSmartParseParams();

    const [userInput, setUserInput] = useState('');
    const [parsedResult, setParsedResult] = useState<{
        params: Record<string, unknown>;
        confidence: string;
        reasoning: string;
    } | null>(null);

    const confidenceColor: Record<string, string> = {
        high: token.colorSuccess,
        medium: token.colorWarning,
        low: token.colorError,
    };
    const confidenceLabel: Record<string, string> = {
        high: '高置信度',
        medium: '中置信度',
        low: '低置信度',
    };

    const handleParse = async () => {
        if (!userInput.trim()) return;
        setParsedResult(null);
        try {
            const result = await smartParse.mutateAsync({
                workflowDefinitionId,
                userInput,
                paramSchema,
            });
            setParsedResult(result);
        } catch {
            // error handled via smartParse.error
        }
    };

    const handleUse = () => {
        if (parsedResult) {
            onParamsFilled(parsedResult.params);
        }
    };

    const currentStep = !parsedResult ? 0 : 1;

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Header */}
            <Flex align="center" gap={8}>
                <RobotOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
                <Text strong style={{ fontSize: 15 }}>智能填参</Text>
                <Tag color="blue">AI 驱动</Tag>
                {onSwitchToManual && (
                    <Tooltip title="切换到手动填写模式">
                        <Button
                            type="link"
                            size="small"
                            icon={<EditOutlined />}
                            style={{ marginLeft: 'auto', color: token.colorTextTertiary }}
                            onClick={onSwitchToManual}
                        >
                            手动填写
                        </Button>
                    </Tooltip>
                )}
            </Flex>

            {/* Steps indicator */}
            <Steps
                size="small"
                current={currentStep}
                items={[
                    { title: '描述需求', icon: currentStep === 0 && smartParse.isPending ? <LoadingOutlined /> : undefined },
                    { title: '确认参数' },
                ]}
            />

            {/* Input area */}
            {currentStep === 0 && (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <TextArea
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="用一句话描述您的需求，例如：帮我生成今日大豆价格分析报告"
                        autoSize={{ minRows: 3, maxRows: 5 }}
                        onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); handleParse(); } }}
                        disabled={smartParse.isPending}
                    />

                    {/* Quick hint chips */}
                    <Flex gap={8} wrap="wrap">
                        {EXAMPLE_HINTS.map((hint) => (
                            <Tag
                                key={hint}
                                style={{ cursor: 'pointer', fontSize: 11 }}
                                onClick={() => setUserInput(hint)}
                            >
                                {hint}
                            </Tag>
                        ))}
                    </Flex>

                    {smartParse.isError && (
                        <Alert
                            type="error"
                            showIcon
                            icon={<ExclamationCircleOutlined />}
                            message="解析失败"
                            description={(smartParse.error as any)?.message ?? 'AI 服务暂时不可用，请尝试手动填写'}
                        />
                    )}

                    <Button
                        type="primary"
                        icon={smartParse.isPending ? <LoadingOutlined /> : <SendOutlined />}
                        loading={smartParse.isPending}
                        disabled={!userInput.trim()}
                        block
                        onClick={handleParse}
                    >
                        {smartParse.isPending ? 'AI 解析中...' : 'AI 解析'}
                    </Button>
                </Space>
            )}

            {/* Result area */}
            {parsedResult && (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {/* Confidence banner */}
                    <Alert
                        type={parsedResult.confidence === 'high' ? 'success' : parsedResult.confidence === 'medium' ? 'warning' : 'info'}
                        showIcon
                        icon={<CheckCircleOutlined />}
                        message={
                            <Flex justify="space-between" align="center">
                                <Text>解析完成</Text>
                                <Tag
                                    color={parsedResult.confidence === 'high' ? 'success' : parsedResult.confidence === 'medium' ? 'warning' : 'default'}
                                    style={{ margin: 0 }}
                                >
                                    {confidenceLabel[parsedResult.confidence] ?? parsedResult.confidence}
                                </Tag>
                            </Flex>
                        }
                        description={
                            parsedResult.reasoning ? (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    <BulbOutlined /> {parsedResult.reasoning}
                                </Text>
                            ) : undefined
                        }
                    />

                    {/* Parsed params preview */}
                    <Card
                        size="small"
                        title={<Text style={{ fontSize: 12 }}>解析到的参数</Text>}
                        style={{ background: token.colorFillAlter }}
                    >
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            {Object.entries(parsedResult.params).map(([key, val]) => (
                                <Flex key={key} justify="space-between" align="center">
                                    <Text code style={{ fontSize: 12 }}>{key}</Text>
                                    <Text style={{ fontSize: 12, maxWidth: 200 }} ellipsis={{ tooltip: String(val) }}>
                                        {String(val)}
                                    </Text>
                                </Flex>
                            ))}
                            {Object.keys(parsedResult.params).length === 0 && (
                                <Text type="secondary" style={{ fontSize: 12 }}>未能提取到参数，请尝试重新描述</Text>
                            )}
                        </Space>
                    </Card>

                    {/* Actions */}
                    <Flex gap={8}>
                        <Button
                            size="small"
                            onClick={() => { setParsedResult(null); }}
                        >
                            重新描述
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            icon={<CheckCircleOutlined />}
                            disabled={Object.keys(parsedResult.params).length === 0}
                            onClick={handleUse}
                            style={{ flex: 1 }}
                        >
                            使用这些参数
                        </Button>
                    </Flex>
                </Space>
            )}
        </Space>
    );
};

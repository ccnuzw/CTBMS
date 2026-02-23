import React, { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Descriptions,
    Empty,
    Flex,
    Space,
    Spin,
    Tag,
    Tooltip,
    Typography,
    message,
    theme,
} from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    CopyOutlined,
    DownloadOutlined,
    FileTextOutlined,
    LoadingOutlined,
    RobotOutlined,
} from '@ant-design/icons';
import type { NodeExecutionDto } from '@packages/types';

const { Title, Text, Paragraph } = Typography;

/**
 * 从节点执行数组中提取最终输出节点。
 * 优先取 COMPLETED 状态且 outputSnapshot 含有文本内容的节点。
 * 顺序：最后一个 agent-call or output or response 节点优先，其次任意完成节点。
 */
function extractFinalOutput(nodeExecutions: NodeExecutionDto[]): {
    text: string | null;
    structured: Record<string, unknown> | null;
    nodeId: string;
    nodeType: string;
} | null {
    const candidates = nodeExecutions.filter(
        (n) => n.status === 'SUCCESS' && n.outputSnapshot,
    );

    // Priority: agent-call > end/output/response > others
    const priorityOrder = ['agent-call', 'output', 'response', 'end'];
    let best: NodeExecutionDto | null = null;
    for (const pType of priorityOrder) {
        const found = [...candidates].reverse().find((n) => n.nodeType?.toLowerCase().includes(pType));
        if (found) { best = found; break; }
    }
    if (!best) best = candidates[candidates.length - 1] ?? null;
    if (!best) return null;

    const snap = best.outputSnapshot as Record<string, unknown>;
    // Extract text content
    const text =
        (snap.content as string | undefined) ||
        (snap.text as string | undefined) ||
        (snap.response as string | undefined) ||
        (snap.output as string | undefined) ||
        null;

    // If no text, treat whole snapshot as structured
    const structured = text ? null : snap;

    return {
        text,
        structured,
        nodeId: best.nodeId,
        nodeType: best.nodeType ?? '',
    };
}

interface ExecutionOutputViewProps {
    nodeExecutions: NodeExecutionDto[];
    executionStatus?: string;
    errorMessage?: string | null;
}

export const ExecutionOutputView: React.FC<ExecutionOutputViewProps> = ({
    nodeExecutions,
    executionStatus,
    errorMessage,
}) => {
    const { token } = theme.useToken();
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const output = useMemo(() => extractFinalOutput(nodeExecutions), [nodeExecutions]);

    // Helper: copy text to clipboard
    const handleCopy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            message.success('已复制到剪贴板');
            setTimeout(() => setCopiedKey(null), 2000);
        } catch {
            message.error('复制失败，请手动选中文本复制');
        }
    };

    // Helper: download as .md file
    const handleDownload = (text: string, filename = 'output.md') => {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    // === Running state ===
    if (executionStatus === 'RUNNING' || executionStatus === 'PENDING') {
        return (
            <Card
                style={{ borderColor: token.colorInfoBorder, background: token.colorInfoBg }}
                bordered
            >
                <Flex align="center" gap={16} style={{ padding: '16px 0' }}>
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 36, color: token.colorInfo }} spin />} />
                    <Space direction="vertical" size={2}>
                        <Text strong>AI 正在处理您的请求...</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            处理过程可能需要几秒到数分钟，请稍候
                        </Text>
                    </Space>
                </Flex>
            </Card>
        );
    }

    // === Failed state ===
    if (executionStatus === 'FAILED') {
        return (
            <Alert
                type="error"
                showIcon
                icon={<CloseCircleOutlined />}
                message="任务执行失败"
                description={
                    <Space direction="vertical" size={4}>
                        <Text>{errorMessage || '执行过程中遇到了错误，请联系管理员或重试'}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            您可以在"节点执行"标签中查看技术细节
                        </Text>
                    </Space>
                }
            />
        );
    }

    // === No output yet ===
    if (!output) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                    <Space direction="vertical" size={4} style={{ textAlign: 'center' }}>
                        <Text>暂无输出结果</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {executionStatus === 'SUCCESS'
                                ? '任务已完成，但未找到可读的输出内容'
                                : '等待任务完成后此处将展示结果'}
                        </Text>
                    </Space>
                }
            />
        );
    }

    // === Text output ===
    if (output.text) {
        return (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {/* result meta */}
                <Flex align="center" justify="space-between">
                    <Space size={8}>
                        <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 16 }} />
                        <Text strong>运行结果</Text>
                        <Tag color="default" style={{ fontSize: 11 }}>来源节点: {output.nodeId}</Tag>
                    </Space>
                    <Space>
                        <Tooltip title="复制全文">
                            <Button
                                size="small"
                                icon={<CopyOutlined />}
                                type={copiedKey === 'main' ? 'primary' : 'default'}
                                onClick={() => handleCopy(output.text!, 'main')}
                            >
                                {copiedKey === 'main' ? '已复制' : '复制'}
                            </Button>
                        </Tooltip>
                        <Tooltip title="下载为 Markdown 文件">
                            <Button
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={() => handleDownload(output.text!)}
                            >
                                导出
                            </Button>
                        </Tooltip>
                    </Space>
                </Flex>

                {/* Rendered output */}
                <Card
                    size="small"
                    style={{ background: token.colorFillAlter, borderColor: token.colorBorder }}
                >
                    <div
                        style={{
                            maxHeight: 500,
                            overflowY: 'auto',
                            padding: '4px 0',
                        }}
                    >
                        <Paragraph
                            style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 13 }}
                        >
                            {output.text}
                        </Paragraph>
                    </div>
                </Card>
            </Space>
        );
    }

    // === Structured output ===
    if (output.structured) {
        const entries = Object.entries(output.structured);
        return (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Flex align="center" justify="space-between">
                    <Space size={8}>
                        <FileTextOutlined style={{ color: token.colorPrimary, fontSize: 16 }} />
                        <Text strong>结构化结果</Text>
                        <Tag color="blue" style={{ fontSize: 11 }}>{entries.length} 个字段</Tag>
                    </Space>
                    <Tooltip title="复制为 JSON">
                        <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => handleCopy(JSON.stringify(output.structured, null, 2), 'json')}
                        >
                            复制 JSON
                        </Button>
                    </Tooltip>
                </Flex>

                <Descriptions
                    column={1}
                    bordered
                    size="small"
                    items={entries.map(([key, val]) => ({
                        key,
                        label: key,
                        children: typeof val === 'string' ? val : JSON.stringify(val),
                    }))}
                />
            </Space>
        );
    }

    return null;
};

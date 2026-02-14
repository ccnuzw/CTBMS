import React, { useEffect, useRef } from 'react';
import { Badge, Button, Empty, List, Space, Tag, theme, Typography, Tabs } from 'antd';
import {
    CodeOutlined,
    DownOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    UpOutlined,
    CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useWorkflowExecutionTimeline } from '../../workflow-runtime/api/workflow-executions';
import type { WorkflowRuntimeEventDto, WorkflowRuntimeEventLevel } from '@packages/types';
import { VariableWatcher } from './VariableWatcher';

const { Text } = Typography;

interface RunLogPanelProps {
    executionId?: string;
    height?: number;
    onHeightChange?: (height: number) => void;
    onClose?: () => void;
}

const LEVEL_COLORS: Record<WorkflowRuntimeEventLevel, string> = {
    INFO: 'blue',
    WARN: 'orange',
    ERROR: 'red',
};

export const RunLogPanel: React.FC<RunLogPanelProps> = ({
    executionId,
    height = 300,
    onHeightChange,
    onClose,
}) => {
    const { token } = theme.useToken();
    const listRef = useRef<HTMLDivElement>(null);

    // 如果有 executionId，则轮询获取日志
    // 实际项目中可能需要更复杂的轮询控制（如结束时停止）
    const { data: timelineData, isLoading, refetch } = useWorkflowExecutionTimeline(
        executionId,
        { page: 1, pageSize: 100 },
    );

    // 自动滚动到底部
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [timelineData]);

    // 简单的轮询效果(仅当有executionId时)
    useEffect(() => {
        if (!executionId) return;
        const timer = setInterval(() => {
            refetch();
        }, 2000);
        return () => clearInterval(timer);
    }, [executionId, refetch]);

    const events = timelineData?.data ?? [];

    return (
        <div
            style={{
                height,
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
                display: 'flex',
                flexDirection: 'column',
                transition: 'height 0.2s',
            }}
        >
            {/* Header */}
            <div
                style={{
                    height: 40,
                    padding: '0 16px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: token.colorBgLayout,
                }}
            >
                <Space>
                    <CodeOutlined />
                    <Text strong>运行日志</Text>
                    {executionId && <Tag color="green">{executionId}</Tag>}
                </Space>
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={height > 40 ? <DownOutlined /> : <UpOutlined />}
                        onClick={() => onHeightChange?.(height > 40 ? 40 : 300)}
                    />
                    <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />
                </Space>
            </div>

            {/* Content */}
            {height > 40 && (
                <Tabs
                    defaultActiveKey="logs"
                    size="small"
                    tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
                    items={[
                        {
                            key: 'logs',
                            label: '运行日志',
                            children: (
                                <div
                                    ref={listRef}
                                    style={{
                                        height: height - 86, // Approx header + tab bar height
                                        overflow: 'auto',
                                        padding: '8px 16px',
                                        scrollBehavior: 'smooth',
                                    }}
                                >
                                    {!executionId ? (
                                        <div style={{ padding: 40, textAlign: 'center' }}>
                                            <Empty description="暂无运行数据，请点击调试运行" />
                                        </div>
                                    ) : (
                                        <List
                                            size="small"
                                            dataSource={events}
                                            loading={isLoading}
                                            renderItem={(item: WorkflowRuntimeEventDto) => (
                                                <List.Item style={{ padding: '8px 0', border: 'none' }}>
                                                    <Space align="start" style={{ width: '100%' }}>
                                                        <Text type="secondary" style={{ fontSize: 12, minWidth: 140 }}>
                                                            {dayjs(item.occurredAt).format('YYYY-MM-DD HH:mm:ss.SSS')}
                                                        </Text>
                                                        <Tag color={LEVEL_COLORS[item.level] || 'default'} style={{ marginRight: 8, minWidth: 50, textAlign: 'center' }}>
                                                            {item.level}
                                                        </Tag>
                                                        <Text style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                                            {item.message}
                                                        </Text>
                                                    </Space>
                                                </List.Item>
                                            )}
                                        />
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: 'variables',
                            label: '变量观察',
                            children: (
                                <div style={{ height: height - 86, overflow: 'hidden' }}>
                                    <VariableWatcher executionId={executionId} />
                                </div>
                            ),
                        },
                    ]}
                />
            )}
        </div>
    );
};

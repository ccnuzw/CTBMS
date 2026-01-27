import React, { useState, useRef, useEffect } from 'react';
import { Card, Button, Typography, Space, Alert, Popconfirm, message } from 'antd';
import { PlayCircleOutlined, LoadingOutlined, CheckCircleOutlined, ConsoleSqlOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export const DataSeeding: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<Array<{ type: 'stdout' | 'stderr', message: string }>>([]);
    const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const bottomRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        // Auto-scroll to bottom
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    const handleClear = async () => {
        try {
            setLoading(true);
            setLogs(prev => [...prev, { type: 'stdout', message: '🧹 Initiating data cleanup...' }]);

            const res = await fetch('/api/init/clear', { method: 'POST' });
            if (!res.ok) throw new Error('Clear failed');

            const data = await res.json();
            setLogs(prev => [...prev, { type: 'stdout', message: '✅ ' + data.message }]);
            message.success('数据清理完成，请重新初始化');
        } catch (error) {
            console.error(error);
            setLogs(prev => [...prev, { type: 'stderr', message: '❌ Data cleanup failed.' }]);
            message.error('清理失败');
        } finally {
            setLoading(false);
        }
    };

    const startSeeding = () => {
        setLoading(true);
        setStatus('running');
        setLogs([]); // Clear previous logs

        // Connect to SSE endpoint
        // Assuming /api proxy is set up correctly in vite.config.ts or Nginx
        const es = new EventSource('/api/init/seed');
        eventSourceRef.current = es;

        es.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload && payload.type && payload.message) {
                    setLogs(prev => [...prev, payload]);

                    if (payload.message.includes('Seeding completed successfully')) {
                        setStatus('completed');
                        setLoading(false);
                        es.close();
                    }
                    if (payload.message.includes('Spawn error') || payload.message.includes('Seeding failed')) {
                        setStatus('error');
                        setLoading(false);
                        es.close();
                    }
                }
            } catch (e) {
                console.error('Failed to parse log message', e);
            }
        };

        es.onerror = (err) => {
            console.error('EventSource failed:', err);
            // If it was already completed, this might be just the connection closing
            if (status !== 'completed') {
                // Check if it was a normal closure (readyState 2 = CLOSED)
                if (es.readyState === EventSource.CLOSED) {
                    // Normal closure
                } else {
                    setLogs(prev => [...prev, { type: 'stderr', message: '⚠️ Connection lost. (Check console for details)' }]);
                    setStatus('error');
                }
            }
            setLoading(false);
            es.close();
        };
    };

    return (
        <Card
            title={
                <Space>
                    <ConsoleSqlOutlined />
                    <span>系统数据初始化 (Data Seeding)</span>
                </Space>
            }
            extra={
                <Space>
                    <Popconfirm
                        title="确定清空业务数据?"
                        description="这将删除所有行情、情报、客商、采集点和配置规则数据（包含用户和组织架构）。此操作不可逆！"
                        onConfirm={handleClear}
                        okText="确定删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Button danger disabled={loading}>
                            一键清空旧数据
                        </Button>
                    </Popconfirm>
                    <Button
                        type="primary"
                        icon={loading ? <LoadingOutlined /> : <PlayCircleOutlined />}
                        onClick={startSeeding}
                        loading={loading}
                    >
                        {loading ? '正在初始化...' : '开始重新初始化数据库'}
                    </Button>
                </Space>
            }
        >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                    message="警告：此操作将重新写入基础数据"
                    description="虽然脚本设计为避免重复插入，但建议仅在系统初次部署或需要修复核心配置时执行。请确保数据库已备份。"
                    type="warning"
                    showIcon
                />

                {/* Status Indicator */}
                {status === 'completed' && (
                    <Alert message="初始化成功！" type="success" showIcon icon={<CheckCircleOutlined />} />
                )}
                {status === 'error' && (
                    <Alert message="初始化过程中发生错误，请检查下方日志。" type="error" showIcon />
                )}

                {/* Terminal View */}
                <div style={{
                    backgroundColor: '#1e1e1e',
                    color: '#00ff00',
                    fontFamily: "'Fira Code', 'Courier New', monospace",
                    fontSize: '13px',
                    padding: '16px',
                    borderRadius: '8px',
                    height: '500px',
                    overflowY: 'auto',
                    border: '1px solid #333',
                    lineHeight: '1.5'
                }}>
                    {logs.length === 0 && <div style={{ color: '#666' }}>等待操作... 点击"开始初始化"执行种子数据脚本</div>}
                    {logs.map((log, index) => (
                        <div key={index} style={{
                            color: log.type === 'stderr' ? '#ff4d4f' : '#52c41a',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                        }}>
                            <span style={{ opacity: 0.5, marginRight: 8 }}>[{new Date().toLocaleTimeString()}]</span>
                            {log.message}
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            </Space>
        </Card>
    );
};

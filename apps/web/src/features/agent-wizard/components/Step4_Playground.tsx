
import React, { useState, useRef, useEffect } from 'react';
import { Input, Button, List, Typography, Avatar, Space, message, Card } from 'antd';
import { UserOutlined, RobotOutlined, SendOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useMutation } from '@tanstack/react-query';

const { Title, Text } = Typography;

interface Step4Props {
    sessionId: string;
    onReset: () => void;
}

interface ChatMessage {
    role: 'user' | 'agent';
    content: string;
    timestamp: Date;
}

export const Step4_Playground = ({ sessionId, onReset }: Step4Props) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'agent', content: 'Hello! I am your new agent. How can I help you today?', timestamp: new Date() }
    ]);
    const [agentId, setAgentId] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Finalize Agent (Effectively creating it on first load or explicit action?)
    // In this flow, let's say we create the agent immediately upon entering this step 
    // OR we create a temporary "playground" session. 
    // Plan: Create Agent Profile on entering this step if not exists?
    // Actually, let's treat "finalize" as "Publish". 
    // For Playground, we might need a temporary agent ID?
    // For MVP, let's just create the agent on mount.

    const createAgentMutation = useMutation(async () => {
        const res = await axios.post(`/api/wizard/session/${sessionId}/finalize`);
        return res.data; // Agent Profile
    }, {
        onSuccess: (data) => {
            setAgentId(data.id);
            message.success('Agent Created Successfully! You can now chat.');
        }
    });

    useEffect(() => {
        if (!agentId) {
            createAgentMutation.mutate();
        }
    }, []);

    const sendMessageMutation = useMutation(async (msg: string) => {
        if (!agentId) return;
        const res = await axios.post('/api/agent/chat', {
            agentId,
            message: msg
        });
        return res.data;
    });

    const handleSend = () => {
        if (!input.trim() || !agentId) return;

        const userMsg: ChatMessage = { role: 'user', content: input, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');

        sendMessageMutation.mutate(input, {
            onSuccess: (data) => {
                const agentMsg: ChatMessage = {
                    role: 'agent',
                    content: data.response,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, agentMsg]);
            }
        });
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', height: '600px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <Title level={2}>Agent Playground</Title>
                <Text type="secondary">Test your agent before publishing.</Text>
            </div>

            <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>

                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    <List
                        dataSource={messages}
                        renderItem={item => (
                            <List.Item style={{ border: 'none', justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: item.role === 'user' ? 'row-reverse' : 'row',
                                    maxWidth: '80%',
                                    gap: 10
                                }}>
                                    <Avatar icon={item.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                                        style={{ backgroundColor: item.role === 'user' ? '#87d068' : '#1890ff' }} />
                                    <div style={{
                                        background: item.role === 'user' ? '#e6f7ff' : '#f0f0f0',
                                        padding: '10px 16px',
                                        borderRadius: 12,
                                        borderTopLeftRadius: item.role === 'agent' ? 2 : 12,
                                        borderTopRightRadius: item.role === 'user' ? 2 : 12,
                                    }}>
                                        <Text>{item.content}</Text>
                                    </div>
                                </div>
                            </List.Item>
                        )}
                    />
                    {sendMessageMutation.isLoading && <div style={{ padding: '0 50px', color: '#999' }}>Agent is typing...</div>}
                </div>

                <div style={{ padding: 20, borderTop: '1px solid #f0f0f0', background: '#fff' }}>
                    <Space.Compact style={{ width: '100%' }}>
                        <Input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onPressEnter={handleSend}
                            placeholder="Type a message..."
                            size="large"
                            disabled={!agentId}
                        />
                        <Button type="primary" size="large" icon={<SendOutlined />} onClick={handleSend} loading={sendMessageMutation.isLoading} disabled={!agentId}>Send</Button>
                    </Space.Compact>
                </div>
            </Card>

            <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Space>
                    <Button onClick={onReset}>Start Over</Button>
                    <Button type="primary" size="large" icon={<CheckCircleOutlined />} href="/workflow/agents" >Done & Publish</Button>
                </Space>
            </div>
        </div>
    );
};

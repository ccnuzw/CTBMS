
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Input, List, Typography, Space, Tag, message, theme } from 'antd';
import { ApiOutlined, CheckCircleFilled, KeyOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

interface Connector {
    meta: {
        id: string;
        name: string;
        description: string;
        icon: string;
        auth: {
            type: 'NONE' | 'API_KEY';
            param?: string;
        };
    };
}

interface Step2Props {
    onSubmit: (keys: Record<string, string>) => void;
    onBack: () => void;
    currentKeys: Record<string, string>;
    selectedPersona: Record<string, any> | null;
}

export const Step2_CredentialBinding = ({ onSubmit, onBack, currentKeys, selectedPersona }: Step2Props) => {
    const [keys, setKeys] = useState<Record<string, string>>(currentKeys || {});
    const { token } = theme.useToken();

    // Fetch all connectors
    const { data: connectors, isLoading } = useQuery(['connectors'], async () => {
        const res = await axios.get<Connector[]>('/api/connectors');
        return res.data;
    });

    // Filter connectors based on persona tools
    // If persona has no tools defined, show all or none? Let's show all for now or recommended.
    // For MVP, if persona.defaultConfig.tools includes the connector ID, we show it.
    const recommendedConnectors = connectors?.filter(c =>
        selectedPersona?.defaultConfig?.tools?.includes(c.meta.id)
    ) || [];

    const handleKeyChange = (id: string, value: string) => {
        setKeys(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = () => {
        // Validate if needed
        onSubmit(keys);
        message.success('Credentials saved successfully');
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <Title level={2}>Connect Data Sources</Title>
                <Paragraph type="secondary">
                    Based on your role <strong>{selectedPersona?.name}</strong>, we recommend connecting these tools.
                </Paragraph>
            </div>

            <List
                grid={{ gutter: 16, column: 1 }}
                dataSource={recommendedConnectors}
                renderItem={item => {
                    const needsAuth = item.meta.auth.type === 'API_KEY';
                    const isConnected = !!keys[item.meta.id];

                    return (
                        <List.Item>
                            <Card>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Space size="large">
                                        <div style={{
                                            width: 48, height: 48, borderRadius: 8,
                                            background: token.colorPrimaryBg, color: token.colorPrimary,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
                                        }}>
                                            <ApiOutlined />
                                        </div>
                                        <div>
                                            <Text strong style={{ fontSize: 16 }}>{item.meta.name}</Text>
                                            <div style={{ color: token.colorTextTertiary }}>{item.meta.description}</div>
                                            {needsAuth && <Tag icon={<LockOutlined />} color="warning" style={{ marginTop: 8 }}>Requires API Key</Tag>}
                                            {!needsAuth && <Tag color="success" style={{ marginTop: 8 }}>Public Access</Tag>}
                                        </div>
                                    </Space>

                                    {needsAuth ? (
                                        <Input.Password
                                            placeholder="Enter API Key"
                                            prefix={<KeyOutlined />}
                                            value={keys[item.meta.id] || ''}
                                            onChange={e => handleKeyChange(item.meta.id, e.target.value)}
                                            style={{ width: 300 }}
                                        />
                                    ) : (
                                        <Button type="text" icon={<CheckCircleFilled style={{ color: token.colorSuccess }} />}>Auto-Connected</Button>
                                    )}
                                </div>
                            </Card>
                        </List.Item>
                    );
                }}
            />

            <div style={{ marginTop: 40, textAlign: 'center' }}>
                <Space>
                    <Button onClick={onBack}>Back</Button>
                    <Button type="primary" size="large" onClick={handleSave} style={{ width: 120 }}>Next</Button>
                </Space>
            </div>
        </div>
    );
};

import React from 'react';
import { Card, Typography, Space, Tag , theme } from 'antd';
import { AgentPersona } from '../registry/AgentPersonaRegistry';

const { Title, Paragraph } = Typography;

interface AgentPersonaCardProps {
    persona: AgentPersona;
    selected?: boolean;
    onClick?: () => void;
}

export const AgentPersonaCard: React.FC<AgentPersonaCardProps> = ({ persona, selected, onClick }) => {
  const { token } = theme.useToken();
    return (
        <Card
            hoverable
            onClick={onClick}
            style={{
                height: '100%',
                borderColor: selected ? token.colorPrimary : undefined,
                backgroundColor: selected ? token.colorPrimaryBg : undefined,
                borderWidth: selected ? 2 : 1,
                transition: 'all 0.3s',
            }}
            bodyStyle={{ padding: 16 }}
        >
            <Space direction="vertical" align="center" style={{ width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>{persona.icon}</div>
                <Title level={5} style={{ margin: 0, fontSize: 16 }}>
                    {persona.name}
                </Title>
                <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 12, height: 44, fontSize: 13 }}>
                    {persona.description}
                </Paragraph>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                    {persona.key !== 'CUSTOM' && (
                        <>
                            <Tag color="blue">{persona.defaultConfig.tools.length} 工具</Tag>
                            <Tag color={persona.defaultConfig.temperature > 0.6 ? 'orange' : 'cyan'}>
                                {persona.defaultConfig.temperature > 0.6 ? '高创意' : '严谨'}
                            </Tag>
                        </>
                    )}
                </div>
            </Space>
        </Card>
    );
};

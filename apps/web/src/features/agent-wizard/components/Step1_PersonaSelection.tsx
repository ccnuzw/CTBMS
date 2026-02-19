
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Typography, Space, Spin, Button, theme } from 'antd';
import { CheckCircleFilled, UserOutlined, RobotOutlined, EditOutlined, BarChartOutlined, SearchOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Paragraph } = Typography;

interface Persona {
    personaCode: string;
    name: string;
    description: string;
    icon: string;
    roleType: string;
}

export const Step1_PersonaSelection = ({ onSelect, selectedId, isLoading }: { onSelect: (id: string) => void, selectedId: string | null, isLoading?: boolean }) => {
    const { token } = theme.useToken();

    const { data: personas, isLoading: isPersonasLoading } = useQuery(['agent-personas'], async () => {
        const res = await axios.get<Persona[]>('/api/agent-personas');
        return res.data;
    });

    const getIcon = (iconName: string) => {
        // Simple mapping for POC/MVP
        switch (iconName) {
            case 'BarChartOutlined': return <BarChartOutlined style={{ fontSize: 24 }} />;
            case 'SearchOutlined': return <SearchOutlined style={{ fontSize: 24 }} />;
            case 'EditOutlined': return <EditOutlined style={{ fontSize: 24 }} />;
            default: return <RobotOutlined style={{ fontSize: 24 }} />;
        }
    };

    if (isPersonasLoading) return <div style={{ textAlign: 'center', padding: 50 }}><Spin size="large" /></div>;

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <Title level={2}>Choose Your Agent Persona</Title>
                <Paragraph type="secondary" style={{ fontSize: 16 }}>
                    Select a role that best fits your needs. Each persona comes with pre-configured tools and prompts.
                </Paragraph>
            </div>

            <Row gutter={[24, 24]}>
                {isLoading && <div style={{ width: '100%', textAlign: 'center', padding: 20 }}><Spin tip="Creating Session..." /></div>}
                {!isLoading && personas?.map(persona => {
                    const isSelected = selectedId === persona.personaCode;
                    return (
                        <Col xs={24} sm={12} md={8} key={persona.personaCode}>
                            <Card
                                hoverable
                                onClick={() => onSelect(persona.personaCode)}
                                style={{
                                    height: '100%',
                                    borderColor: isSelected ? token.colorPrimary : undefined,
                                    borderWidth: isSelected ? 2 : 1,
                                    background: isSelected ? token.colorPrimaryBg : undefined
                                }}
                            >
                                <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
                                    <div style={{
                                        width: 64, height: 64, borderRadius: '50%',
                                        background: isSelected ? token.colorPrimary : token.colorFillSecondary,
                                        color: isSelected ? '#fff' : token.colorTextSecondary,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto'
                                    }}>
                                        {getIcon(persona.icon)}
                                    </div>
                                    <div>
                                        <Title level={4} style={{ marginBottom: 8 }}>{persona.name}</Title>
                                        <Paragraph type="secondary" style={{ minHeight: 44 }}>{persona.description}</Paragraph>
                                    </div>
                                    {isSelected && <div style={{ color: token.colorPrimary }}><CheckCircleFilled /> Selected</div>}
                                </Space>
                            </Card>
                        </Col>
                    );
                })}
            </Row>
        </div>
    );
};

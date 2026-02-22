import React from 'react';
import { Card, Space, Typography, Tag, Radio, Tooltip } from 'antd';
import { RocketOutlined, SafetyCertificateOutlined, SafetyOutlined, SettingOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

export type RuntimePresetType = 'FAST' | 'BALANCED' | 'ROBUST' | 'CUSTOM';

interface RuntimePresetCardProps {
    value: RuntimePresetType;
    onChange: (value: RuntimePresetType) => void;
    currentTimeout: number;
    currentRetry: number;
}

const PRESETS: Record<string, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
    FAST: {
        label: '低延迟 (Fast)',
        desc: '超时短，不重试，适合实时性要求高的场景。',
        icon: <RocketOutlined />,
        color: 'orange',
    },
    BALANCED: {
        label: '标准 (Balanced)',
        desc: '平衡时效与稳定性，推荐默认使用。',
        icon: <SafetyCertificateOutlined />,
        color: 'blue',
    },
    ROBUST: {
        label: '高可靠 (Robust)',
        desc: '高容错，多次重试，适合关键且不稳定的服务。',
        icon: <SafetyOutlined />,
        color: 'green',
    },
    CUSTOM: {
        label: '自定义 (Custom)',
        desc: '根据具体需求手动调整运行参数。',
        icon: <SettingOutlined />,
        color: 'default',
    },
};

export const RuntimePresetCard: React.FC<RuntimePresetCardProps> = ({
    value,
    onChange,
    currentTimeout,
    currentRetry,
}) => {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {Object.entries(PRESETS).map(([key, config]) => {
                const isSelected = value === key;
                return (
                    <div
                        key={key}
                        onClick={() => onChange(key as RuntimePresetType)}
                        style={{
                            cursor: 'pointer',
                            border: `1px solid ${isSelected ? config.color : '#f0f0f0'}`,
                            borderRadius: 8,
                            padding: 12,
                            background: isSelected ? `${config.color}08` : '#fff',
                            transition: 'all 0.2s',
                        }}
                    >
                        <Space align="start">
                            <div style={{ color: isSelected ? config.color : '#8c8c8c', fontSize: 16 }}>
                                {config.icon}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <Text strong style={{ fontSize: 13, color: isSelected ? config.color : undefined }}>
                                    {config.label}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    {config.desc}
                                </Text>
                            </div>
                        </Space>
                    </div>
                );
            })}
        </div>
    );
};

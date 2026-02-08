import React from 'react';
import { Card, Statistic, Space, theme } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

interface StatCardProps {
    title: string;
    value: number | string;
    icon: React.ReactNode;
    color: string;
    suffix?: string;
    trend?: number;
    loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    icon,
    color,
    suffix,
    trend,
    loading
}) => {
    const { token } = theme.useToken();

    return (
        <Card bordered={false} bodyStyle={{ padding: 24 }}>
            <Statistic
                title={
                    <Space>
                        <span style={{
                            backgroundColor: `${color}15`,
                            padding: 8,
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 4
                        }}>
                            {React.cloneElement(icon as React.ReactElement, { style: { color } })}
                        </span>
                        <span>{title}</span>
                    </Space>
                }
                value={value}
                suffix={suffix}
                valueStyle={{ fontWeight: 'bold' }}
                loading={loading}
            />
            {trend !== undefined && (
                <div style={{ marginTop: 8, color: trend >= 0 ? token.colorSuccess : token.colorError, fontSize: 12 }}>
                    <Space size={4}>
                        {trend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        <span>{Math.abs(trend)}%</span>
                        <span style={{ color: token.colorTextSecondary }}>较上期</span>
                    </Space>
                </div>
            )}
        </Card>
    );
};

import React from 'react';
import { Card, Flex, Statistic, Space, Tag, Divider, theme } from 'antd';
import {
    FileTextOutlined,
    RiseOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import { IntelFilterState } from '../types';

interface StatsBarProps {
    filterState: IntelFilterState;
}

export const StatsBar: React.FC<StatsBarProps> = ({ filterState }) => {
    const { token } = theme.useToken();

    // 模拟统计数据
    const stats = {
        total: 156,
        dailyReport: 89,
        researchReport: 43,
        policyDoc: 24,
        highValue: 42,
        pending: 18,
        confirmed: 138,
    };

    return (
        <Card
            style={{
                borderRadius: 0,
                borderTop: `1px solid ${token.colorBorderSecondary}`,
            }}
            bodyStyle={{ padding: '8px 16px' }}
        >
            <Flex justify="space-between" align="center">
                {/* 左侧: 筛选结果统计 */}
                <Flex align="center" gap={24}>
                    <Flex align="center" gap={8}>
                        <FileTextOutlined style={{ color: token.colorPrimary }} />
                        <span>共 <strong style={{ color: token.colorPrimary }}>{stats.total}</strong> 条结果</span>
                    </Flex>

                    <Divider type="vertical" />

                    <Space size={16}>
                        <Tag icon={<FileTextOutlined />} color="blue">
                            日报 {stats.dailyReport}
                        </Tag>
                        <Tag icon={<FileTextOutlined />} color="green">
                            研报 {stats.researchReport}
                        </Tag>
                        <Tag icon={<FileTextOutlined />} color="purple">
                            政策 {stats.policyDoc}
                        </Tag>
                    </Space>
                </Flex>

                {/* 右侧: 关键指标 */}
                <Flex align="center" gap={24}>
                    <Flex align="center" gap={6}>
                        <RiseOutlined style={{ color: '#faad14' }} />
                        <span>高价值 <strong>{stats.highValue}</strong></span>
                    </Flex>

                    <Flex align="center" gap={6}>
                        <ClockCircleOutlined style={{ color: '#fa8c16' }} />
                        <span>待处理 <strong>{stats.pending}</strong></span>
                    </Flex>

                    <Flex align="center" gap={6}>
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        <span>已确认 <strong>{stats.confirmed}</strong></span>
                    </Flex>
                </Flex>
            </Flex>
        </Card>
    );
};

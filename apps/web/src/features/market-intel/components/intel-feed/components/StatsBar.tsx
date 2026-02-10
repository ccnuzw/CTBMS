import React, { useMemo } from 'react';
import { Card, Flex, Space, Tag, Divider, theme } from 'antd';
import {
    FileTextOutlined,
    RiseOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import { IntelItem } from '../types';
import { ContentType } from '../../../types';

interface StatsBarProps {
    items: IntelItem[];
}

export const StatsBar: React.FC<StatsBarProps> = ({ items }) => {
    const { token } = theme.useToken();

    // 实时统计数据
    const stats = useMemo(() => {
        const result = {
            total: items.length,
            dailyReport: 0,
            researchReport: 0,
            highValue: 0,
            pending: 0,
            confirmed: 0,
        };

        items.forEach(item => {
            // 内容类型
            if (item.contentType === ContentType.DAILY_REPORT) result.dailyReport++;
            else if (item.contentType === ContentType.RESEARCH_REPORT) result.researchReport++;

            // 高价值 (质量高或可信度高)
            if ((item.qualityScore || 0) >= 80 || (item.confidence || 0) >= 90) {
                result.highValue++;
            }

            // 状态
            if (item.status === 'pending') result.pending++;
            else if (item.status === 'confirmed') result.confirmed++;
        });

        return result;
    }, [items]);

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

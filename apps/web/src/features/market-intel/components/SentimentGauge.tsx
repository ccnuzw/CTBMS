import React from 'react';
import { Flex, Typography, theme, Tooltip } from 'antd';
import { RiseOutlined, FallOutlined, MinusOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface SentimentGaugeProps {
    positive: number;
    negative: number;
    neutral: number;
    total?: number;
}

export const SentimentGauge: React.FC<SentimentGaugeProps> = ({
    positive,
    negative,
    neutral,
    total: propTotal,
}) => {
    const { token } = theme.useToken();

    const total = propTotal || (positive + negative + neutral);
    const posPercent = total > 0 ? (positive / total) * 100 : 0;
    const negPercent = total > 0 ? (negative / total) * 100 : 0;
    const neuPercent = total > 0 ? (neutral / total) * 100 : 0;

    // 简单判断市场情绪倾向
    let mood = 'neutral';
    let moodText = '市场情绪平衡';
    let moodColor = token.colorTextSecondary;

    if (posPercent > 50) {
        mood = 'positive';
        moodText = '市场情绪高涨';
        moodColor = token.colorSuccess;
    } else if (negPercent > 50) {
        mood = 'negative';
        moodText = '市场情绪低迷';
        moodColor = token.colorError;
    } else if (posPercent > negPercent + 10) {
        mood = 'slightly_positive';
        moodText = '情绪偏暖';
        moodColor = token.colorSuccess;
    } else if (negPercent > posPercent + 10) {
        mood = 'slightly_negative';
        moodText = '情绪偏冷';
        moodColor = token.colorError;
    }

    return (
        <Flex vertical gap={8} style={{ width: '100%' }}>
            <Flex justify="space-between" align="baseline">
                <Text strong style={{ color: moodColor }}>{moodText}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>基于 {total} 条数据</Text>
            </Flex>

            {/* 堆叠条形图 */}
            <div style={{
                height: 12,
                width: '100%',
                background: token.colorBgLayout,
                borderRadius: 6,
                overflow: 'hidden',
                display: 'flex'
            }}>
                {posPercent > 0 && (
                    <Tooltip title={`利好: ${positive} (${posPercent.toFixed(1)}%)`}>
                        <div style={{ width: `${posPercent}%`, background: token.colorSuccess, transition: 'width 0.3s' }} />
                    </Tooltip>
                )}
                {neuPercent > 0 && (
                    <Tooltip title={`中性: ${neutral} (${neuPercent.toFixed(1)}%)`}>
                        <div style={{ width: `${neuPercent}%`, background: token.colorTextQuaternary, transition: 'width 0.3s' }} />
                    </Tooltip>
                )}
                {negPercent > 0 && (
                    <Tooltip title={`利空: ${negative} (${negPercent.toFixed(1)}%)`}>
                        <div style={{ width: `${negPercent}%`, background: token.colorError, transition: 'width 0.3s' }} />
                    </Tooltip>
                )}
            </div>

            {/* 图例数据 */}
            <Flex justify="space-between" align="center" style={{ fontSize: 12 }}>
                <Flex align="center" gap={4}>
                    <RiseOutlined style={{ color: token.colorSuccess }} />
                    <Text type="secondary">利好 {posPercent.toFixed(0)}%</Text>
                </Flex>
                <Flex align="center" gap={4}>
                    <MinusOutlined style={{ color: token.colorTextQuaternary }} />
                    <Text type="secondary">中性 {neuPercent.toFixed(0)}%</Text>
                </Flex>
                <Flex align="center" gap={4}>
                    <FallOutlined style={{ color: token.colorError }} />
                    <Text type="secondary">利空 {negPercent.toFixed(0)}%</Text>
                </Flex>
            </Flex>
        </Flex>
    );
};

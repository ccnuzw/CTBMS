import React, { useEffect, useState } from 'react';
import { Card, Button, Typography, Space, App, Skeleton } from 'antd';
import { RobotOutlined, ReloadOutlined, BulbOutlined } from '@ant-design/icons';
import { useIntelSmartBriefing, IntelligenceFeedQuery } from '../../../api/hooks';
import { IntelFilterState } from '../types';

const { Paragraph, Text } = Typography;

interface SmartBriefingCardProps {
    filterState: IntelFilterState;
    startDate?: Date;
    endDate?: Date;
}

export const SmartBriefingCard: React.FC<SmartBriefingCardProps> = ({ filterState, startDate, endDate }) => {
    const { message } = App.useApp();
    const { mutate: generateBriefing, isPending } = useIntelSmartBriefing();
    const [summary, setSummary] = useState<string | null>(null);

    // Filter to Query mapping
    const getQuery = (): Partial<IntelligenceFeedQuery> => ({
        startDate,
        endDate,
        sourceTypes: filterState.sourceTypes.length ? filterState.sourceTypes.map(String) : undefined,
        regionCodes: filterState.regions,
        commodities: filterState.commodities,
        keyword: filterState.keyword,
        processingStatus: filterState.status,
    });

    const handleGenerate = () => {
        generateBriefing(getQuery(), {
            onSuccess: (data: any) => {
                setSummary(data.summary);
                // message.success('简报生成成功');
            },
            onError: () => {
                message.error('生成简报失败');
            }
        });
    };

    return (
        <Card
            size="small"
            style={{ marginBottom: 16, background: 'linear-gradient(to right, #f6ffed, #ffffff)', borderColor: '#b7eb8f' }}
            bodyStyle={{ padding: '12px 16px' }}
        >
            <Space direction="vertical" style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                        <RobotOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                        <Text strong style={{ color: '#389e0d' }}>AI 智能市场简报</Text>
                        <BulbOutlined style={{ color: '#faad14' }} />
                    </Space>
                    <Button
                        type="link"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={handleGenerate}
                        loading={isPending}
                    >
                        {summary ? '刷新简报' : '生成简报'}
                    </Button>
                </Space>

                {isPending ? (
                    <Skeleton active paragraph={{ rows: 2 }} title={false} />
                ) : summary ? (
                    <div style={{ background: 'rgba(255,255,255,0.6)', padding: 12, borderRadius: 8 }}>
                        <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                            {summary.split('\n').map((line, i) => (
                                <span key={i}>
                                    {line}
                                    <br />
                                </span>
                            ))}
                        </Paragraph>
                    </div>
                ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        点击生成按钮，AI 将为您提炼当前筛选范围内的核心市场动态与趋势。
                    </Text>
                )}
            </Space>
        </Card>
    );
};

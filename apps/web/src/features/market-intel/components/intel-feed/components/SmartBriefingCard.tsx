import React, { useState } from 'react';
import { Card, Button, Typography, Space, App, Skeleton, Spin, theme } from 'antd';
import { RobotOutlined, ReloadOutlined, BulbOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';
import { useIntelSmartBriefing, IntelligenceFeedQuery } from '../../../api/hooks';
import { IntelFilterState } from '../types';

const { Text } = Typography;

interface SmartBriefingCardProps {
    filterState: IntelFilterState;
    startDate?: Date;
    endDate?: Date;
}

export const SmartBriefingCard: React.FC<SmartBriefingCardProps> = ({ filterState, startDate, endDate }) => {
    const { token } = theme.useToken();
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
            },
            onError: () => {
                message.error('生成简报失败');
            }
        });
    };

    return (
        <Card
            size="small"
            style={{
                marginBottom: 16,
                background: token.colorSuccessBg, // Use token for background
                borderColor: token.colorSuccessBorder
            }}
            bodyStyle={{ padding: '12px 16px' }}
        >
            <Space direction="vertical" style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                        <RobotOutlined style={{ color: token.colorSuccess, fontSize: 18 }} />
                        <Text strong style={{ color: token.colorSuccessTextActive }}>AI 智能市场简报</Text>
                        <BulbOutlined style={{ color: token.colorWarning }} />
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
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <Spin tip="AI 正在分析市场数据...">
                            <div style={{ padding: '20px' }} />
                        </Spin>
                    </div>
                ) : summary ? (
                    <div style={{ background: token.colorBgContainer, padding: 12, borderRadius: 8, maxHeight: 400, overflowY: 'auto' }}>
                        <Markdown components={{
                            h1: ({ node, ...props }) => <h3 style={{ marginTop: 10, marginBottom: 5, fontSize: '16px', color: token.colorTextHeading }} {...props} />,
                            h2: ({ node, ...props }) => <h4 style={{ marginTop: 8, marginBottom: 4, fontSize: '14px', color: token.colorTextHeading }} {...props} />,
                            p: ({ node, ...props }) => <p style={{ marginBottom: 8, fontSize: '13px', lineHeight: 1.6, color: token.colorText }} {...props} />,
                            ul: ({ node, ...props }) => <ul style={{ paddingLeft: 18, marginBottom: 8, color: token.colorText }} {...props} />,
                            li: ({ node, ...props }) => <li style={{ marginBottom: 4, fontSize: '13px', color: token.colorText }} {...props} />,
                        }}>
                            {summary}
                        </Markdown>
                    </div>
                ) : (
                    <div style={{ padding: '8px 0' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            点击生成按钮，AI 将为您提炼当前筛选范围内的核心市场动态与趋势。
                        </Text>
                    </div>
                )}
            </Space>
        </Card>
    );
};

import React from 'react';
import { Card, Typography, Flex, theme, Empty, Tag, Space, Button } from 'antd';
import { EnvironmentOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { IntelFilterState, IntelItem } from '../../types';

const { Text, Title } = Typography;

interface MapViewProps {
    filterState: IntelFilterState;
    onIntelSelect: (intel: IntelItem | null) => void;
    selectedIntelId?: string;
}

// 模拟区域数据
const REGION_STATS = [
    { region: '辽宁省', count: 45, hotspots: ['锦州港', '大连港', '营口港'] },
    { region: '吉林省', count: 38, hotspots: ['长春', '四平', '公主岭'] },
    { region: '黑龙江省', count: 52, hotspots: ['哈尔滨', '绥化', '齐齐哈尔'] },
    { region: '山东省', count: 28, hotspots: ['青岛港', '日照港', '潍坊'] },
    { region: '河南省', count: 22, hotspots: ['郑州', '周口', '商丘'] },
    { region: '河北省', count: 18, hotspots: ['石家庄', '邯郸', '秦皇岛港'] },
];

export const MapView: React.FC<MapViewProps> = ({
    filterState,
    onIntelSelect,
    selectedIntelId,
}) => {
    const { token } = theme.useToken();

    return (
        <div style={{ padding: 16 }}>
            {/* 提示卡片 */}
            <Card
                style={{ marginBottom: 16 }}
                bodyStyle={{ padding: '12px 16px' }}
            >
                <Flex align="center" gap={8}>
                    <InfoCircleOutlined style={{ color: token.colorPrimary }} />
                    <Text type="secondary">
                        地图视图正在开发中，将支持情报地理分布热力图展示。以下为区域统计数据：
                    </Text>
                </Flex>
            </Card>

            {/* 区域统计卡片 */}
            <Flex wrap="wrap" gap={16}>
                {REGION_STATS.map(item => (
                    <Card
                        key={item.region}
                        hoverable
                        style={{ width: 280 }}
                        bodyStyle={{ padding: 16 }}
                    >
                        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                            <Flex align="center" gap={8}>
                                <EnvironmentOutlined style={{ color: token.colorPrimary, fontSize: 20 }} />
                                <Title level={5} style={{ margin: 0 }}>{item.region}</Title>
                            </Flex>
                            <Tag color="blue">{item.count} 条</Tag>
                        </Flex>

                        <Text type="secondary" style={{ fontSize: 12 }}>热点区域：</Text>
                        <Space wrap style={{ marginTop: 8 }}>
                            {item.hotspots.map(spot => (
                                <Tag key={spot} bordered={false}>{spot}</Tag>
                            ))}
                        </Space>

                        <Flex justify="flex-end" style={{ marginTop: 12 }}>
                            <Button type="link" size="small" style={{ padding: 0 }}>
                                查看详情
                            </Button>
                        </Flex>
                    </Card>
                ))}
            </Flex>

            {/* 地图占位区域 */}
            <Card style={{ marginTop: 24, minHeight: 400 }}>
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <Space direction="vertical" align="center">
                            <Text>地图可视化功能开发中</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                将支持：情报热力图 · 采集点标注 · 区域钻取 · 实时更新
                            </Text>
                        </Space>
                    }
                />
            </Card>
        </div>
    );
};

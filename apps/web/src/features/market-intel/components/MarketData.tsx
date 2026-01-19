import React, { useState } from 'react';
import {
    Typography,
    Flex,
    Tabs,
    Button,
    Space,
    theme,
    Modal,
    Divider,
    List,
    Tag,
} from 'antd';
import {
    LineChartOutlined,
    BarChartOutlined,
    TableOutlined,
    ReloadOutlined,
    QuestionCircleOutlined,
    CheckCircleOutlined,
    BulbOutlined,
    FilterOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { FilterPanel, TrendChart, ComparisonPanel, DataGrid, InsightCards } from './market-data';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Title, Text, Paragraph } = Typography;

type TabKey = 'trend' | 'comparison' | 'data';

export const MarketData: React.FC = () => {
    const { token } = theme.useToken();
    const queryClient = useQueryClient();

    // 筛选状态
    const [commodity, setCommodity] = useState('玉米');
    const [days, setDays] = useState(30);
    const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
    const [selectedProvince, setSelectedProvince] = useState<string | undefined>();
    const [pointTypeFilter, setPointTypeFilter] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<TabKey>('trend');
    const [helpVisible, setHelpVisible] = useState(false);
    const { containerRef, modalProps, focusRef } = useModalAutoFocus();

    // 刷新数据
    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['price-data'] });
        queryClient.invalidateQueries({ queryKey: ['multi-point-compare'] });
        queryClient.invalidateQueries({ queryKey: ['price-by-collection-point'] });
        queryClient.invalidateQueries({ queryKey: ['price-by-region'] });
    };

    const tabItems = [
        {
            key: 'trend',
            label: (
                <Flex align="center" gap={6}>
                    <LineChartOutlined />
                    趋势分析
                </Flex>
            ),
            children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    {/* 智能洞察 */}
                    <InsightCards
                        commodity={commodity}
                        days={days}
                        selectedPointIds={selectedPointIds}
                    />
                    {/* 趋势图表 */}
                    <TrendChart
                        commodity={commodity}
                        days={days}
                        selectedPointIds={selectedPointIds}
                        selectedRegionCode={selectedProvince}
                    />
                </Space>
            ),
        },
        {
            key: 'comparison',
            label: (
                <Flex align="center" gap={6}>
                    <BarChartOutlined />
                    对比分析
                </Flex>
            ),
            children: (
                <ComparisonPanel
                    commodity={commodity}
                    days={days}
                    selectedPointIds={selectedPointIds}
                />
            ),
        },
        {
            key: 'data',
            label: (
                <Flex align="center" gap={6}>
                    <TableOutlined />
                    数据明细
                </Flex>
            ),
            children: (
                <DataGrid
                    commodity={commodity}
                    days={days}
                    selectedPointIds={selectedPointIds}
                    selectedProvince={selectedProvince}
                />
            ),
        },
    ];

    // 使用说明内容
    const helpSteps = [
        {
            title: '1. 选择品种和时间范围',
            description: '在左侧筛选器中选择您关注的品种（玉米、大豆等）和分析时间范围（7天~1年）。',
        },
        {
            title: '2. 筛选采集点',
            description: '可按类型（港口、企业、市场）过滤采集点，也可搜索特定采集点。勾选您想对比的采集点。',
        },
        {
            title: '3. 查看趋势分析',
            description: '在"趋势分析"标签页查看多采集点价格走势对比图，系统会自动生成智能洞察提示。',
        },
        {
            title: '4. 对比分析',
            description: '切换到"对比分析"标签页，查看价格排行、涨跌幅排行和类型均价对比。',
        },
        {
            title: '5. 数据明细',
            description: '在"数据明细"标签页查看详细数据表格，支持筛选、排序和导出 CSV。',
        },
    ];

    const features = [
        { icon: <BulbOutlined />, text: '智能洞察：自动检测价格异常、连续涨跌、价差套利机会' },
        { icon: <LineChartOutlined />, text: '趋势图表：多采集点折线叠加，支持切换面积图' },
        { icon: <BarChartOutlined />, text: '对比分析：价格排行、涨跌榜、类型均价对比' },
        { icon: <TableOutlined />, text: '数据导出：支持 CSV 格式导出，便于进一步分析' },
    ];

    return (
        <Flex style={{ height: '100%', overflow: 'hidden' }}>
            {/* 左侧筛选器 */}
            <FilterPanel
                commodity={commodity}
                onCommodityChange={setCommodity}
                days={days}
                onDaysChange={setDays}
                selectedPointIds={selectedPointIds}
                onSelectedPointIdsChange={setSelectedPointIds}
                selectedProvince={selectedProvince}
                onSelectedProvinceChange={setSelectedProvince}
                pointTypeFilter={pointTypeFilter}
                onPointTypeFilterChange={setPointTypeFilter}
            />

            {/* 主内容区 */}
            <Flex vertical style={{ flex: 1, overflow: 'hidden' }}>
                {/* 顶部标题栏 */}
                <Flex
                    justify="space-between"
                    align="center"
                    style={{
                        padding: '12px 24px',
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        background: token.colorBgContainer,
                    }}
                >
                    <Title level={4} style={{ margin: 0 }}>
                        <LineChartOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                        A类行情分析
                    </Title>
                    <Space>
                        <Button
                            icon={<QuestionCircleOutlined />}
                            onClick={() => setHelpVisible(true)}
                        >
                            使用说明
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={handleRefresh}
                        >
                            刷新
                        </Button>
                    </Space>
                </Flex>

                {/* Tab 内容 */}
                <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                    <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as TabKey)}
                        items={tabItems}
                        size="large"
                    />
                </div>
            </Flex>

            {/* 使用说明弹窗 */}
            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <QuestionCircleOutlined style={{ color: token.colorPrimary }} />
                        <span>A类行情分析 - 使用说明</span>
                    </Flex>
                }
                open={helpVisible}
                onCancel={() => setHelpVisible(false)}
                footer={
                    <Button type="primary" onClick={() => setHelpVisible(false)} ref={focusRef}>
                        我知道了
                    </Button>
                }
                width={680}
                afterOpenChange={modalProps.afterOpenChange}
            >
                <div ref={containerRef} tabIndex={-1} style={{ outline: 'none' }}>
                    <Divider orientation="left">
                        <FilterOutlined /> 操作步骤
                    </Divider>
                    <List
                        itemLayout="horizontal"
                        dataSource={helpSteps}
                        renderItem={(item) => (
                            <List.Item>
                                <List.Item.Meta
                                    avatar={<CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 20 }} />}
                                    title={<Text strong>{item.title}</Text>}
                                    description={item.description}
                                />
                            </List.Item>
                        )}
                    />

                    <Divider orientation="left">
                        <BulbOutlined /> 功能亮点
                    </Divider>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {features.map((feature, index) => (
                            <Flex key={index} align="center" gap={12}>
                                <span style={{ color: token.colorPrimary, fontSize: 16 }}>{feature.icon}</span>
                                <Text>{feature.text}</Text>
                            </Flex>
                        ))}
                    </Space>

                    <Divider orientation="left">
                        <Tag color="blue">小贴士</Tag>
                    </Divider>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        • 选择多个采集点时，趋势图会用不同颜色区分各采集点<br />
                        • 智能洞察会自动检测价格异常（偏离均价超过5%）和连续涨跌趋势<br />
                        • 如果选择了省份筛选，趋势图会显示该区域的均价参考线<br />
                        • 数据明细支持按日期、价格等字段排序，便于快速定位
                    </Paragraph>
                </div>
            </Modal>
        </Flex >
    );
};



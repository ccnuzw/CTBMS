import React, { useMemo, useState } from 'react';
import { Card, Col, Empty, Input, Row, Space, Tag, Typography, theme } from 'antd';
import {
    SearchOutlined,
    FileTextOutlined,
    LineChartOutlined,
    SafetyOutlined,
    HistoryOutlined,
} from '@ant-design/icons';

import {
    SCENE_CATEGORY_LABELS,
    SCENE_CATEGORY_ORDER,
    getScenesByCategory,
    type SceneCategory,
    type SceneTemplate,
} from './sceneTemplates';

const { Title, Text, Paragraph } = Typography;

// ── 分类图标 & 颜色 ──────────────────────────────────────────────

const CATEGORY_ICON: Record<SceneCategory, React.ReactNode> = {
    DAILY_ANALYSIS: <LineChartOutlined />,
    SPECIAL_RESEARCH: <FileTextOutlined />,
    RISK_MONITOR: <SafetyOutlined />,
    STRATEGY_REVIEW: <HistoryOutlined />,
};

const CATEGORY_COLOR: Record<SceneCategory, string> = {
    DAILY_ANALYSIS: '#1677ff',
    SPECIAL_RESEARCH: '#722ed1',
    RISK_MONITOR: '#fa541c',
    STRATEGY_REVIEW: '#13c2c2',
};

// ── Props ────────────────────────────────────────────────────────

interface SceneSelectorProps {
    /** 用户选中场景后的回调 */
    onSelectScene: (scene: SceneTemplate) => void;
    /** 点击"自定义空白流程"的回调 */
    onCreateBlank?: () => void;
}

// ── 组件 ────────────────────────────────────────────────────────

export const SceneSelector = ({ onSelectScene, onCreateBlank }: SceneSelectorProps) => {
    const { token } = theme.useToken();
    const [searchKeyword, setSearchKeyword] = useState('');

    const scenesByCategory = useMemo(() => getScenesByCategory(), []);

    // 搜索过滤
    const filteredByCategory = useMemo(() => {
        if (!searchKeyword.trim()) return scenesByCategory;

        const keyword = searchKeyword.trim().toLowerCase();
        const result: Partial<Record<SceneCategory, SceneTemplate[]>> = {};

        SCENE_CATEGORY_ORDER.forEach((category) => {
            const filtered = scenesByCategory[category].filter(
                (scene) =>
                    scene.sceneName.toLowerCase().includes(keyword) ||
                    scene.description.toLowerCase().includes(keyword) ||
                    scene.outputTypes.some((t) => t.toLowerCase().includes(keyword)) ||
                    scene.applicableRoles.some((r) => r.toLowerCase().includes(keyword)),
            );
            if (filtered.length > 0) {
                result[category] = filtered;
            }
        });

        return result as Record<SceneCategory, SceneTemplate[]>;
    }, [scenesByCategory, searchKeyword]);

    const hasResults = Object.values(filteredByCategory).some((scenes) => scenes && scenes.length > 0);

    return (
        <div style={{ padding: token.paddingLG }}>
            {/* 标题区 */}
            <div style={{ marginBottom: token.marginLG }}>
                <Title level={3} style={{ marginBottom: token.marginXS }}>
                    选择业务场景
                </Title>
                <Paragraph type="secondary" style={{ marginBottom: token.marginMD }}>
                    选择一个场景，系统会自动为您创建对应的分析流程。您也可以在流程基础上进行调整。
                </Paragraph>

                {/* 搜索框 */}
                <Input
                    placeholder="搜索场景（如：日报、价差、风控…）"
                    prefix={<SearchOutlined />}
                    allowClear
                    size="large"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    style={{ maxWidth: 480 }}
                />
            </div>

            {/* 场景卡片分组 */}
            {hasResults ? (
                SCENE_CATEGORY_ORDER.map((category) => {
                    const scenes = filteredByCategory[category];
                    if (!scenes || scenes.length === 0) return null;

                    return (
                        <div key={category} style={{ marginBottom: token.marginXL }}>
                            {/* 分类标题 */}
                            <Space
                                align="center"
                                style={{
                                    marginBottom: token.marginMD,
                                    color: CATEGORY_COLOR[category],
                                }}
                            >
                                {CATEGORY_ICON[category]}
                                <Title level={5} style={{ margin: 0, color: CATEGORY_COLOR[category] }}>
                                    {SCENE_CATEGORY_LABELS[category]}
                                </Title>
                            </Space>

                            {/* 场景卡片 */}
                            <Row gutter={[16, 16]}>
                                {scenes.map((scene) => (
                                    <Col key={scene.sceneCode} xs={24} sm={12} md={8} xl={6}>
                                        <Card
                                            hoverable
                                            onClick={() => onSelectScene(scene)}
                                            style={{
                                                height: '100%',
                                                borderColor: token.colorBorderSecondary,
                                                transition: 'all 0.2s',
                                            }}
                                            bodyStyle={{
                                                padding: token.paddingMD,
                                                display: 'flex',
                                                flexDirection: 'column' as const,
                                                height: '100%',
                                            }}
                                        >
                                            {/* 场景名称 */}
                                            <Text strong style={{ fontSize: token.fontSizeLG, marginBottom: 4 }}>
                                                {scene.sceneName}
                                            </Text>

                                            {/* 描述 */}
                                            <Paragraph
                                                type="secondary"
                                                style={{
                                                    fontSize: token.fontSizeSM,
                                                    marginBottom: token.marginSM,
                                                    flex: 1,
                                                }}
                                                ellipsis={{ rows: 2 }}
                                            >
                                                {scene.description}
                                            </Paragraph>

                                            {/* 产出标签 */}
                                            <div style={{ marginBottom: token.marginXS }}>
                                                {scene.outputTypes.map((output) => (
                                                    <Tag
                                                        key={output}
                                                        color={CATEGORY_COLOR[category]}
                                                        style={{ marginBottom: 4 }}
                                                    >
                                                        {output}
                                                    </Tag>
                                                ))}
                                            </div>

                                            {/* 适用角色 */}
                                            <Text
                                                type="secondary"
                                                style={{ fontSize: token.fontSizeSM }}
                                            >
                                                适用：{scene.applicableRoles.join('、')}
                                            </Text>
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        </div>
                    );
                })
            ) : (
                <Empty description="没有匹配的场景" style={{ marginTop: 64 }} />
            )}

            {/* 自定义空白流程 */}
            {onCreateBlank && (
                <div
                    style={{
                        marginTop: token.marginXL,
                        paddingTop: token.paddingLG,
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Card
                        hoverable
                        onClick={onCreateBlank}
                        style={{
                            maxWidth: 360,
                            borderStyle: 'dashed',
                            textAlign: 'center',
                        }}
                        bodyStyle={{ padding: token.paddingLG }}
                    >
                        <Text type="secondary">
                            以上场景都不合适？
                        </Text>
                        <br />
                        <Text strong style={{ color: token.colorPrimary }}>
                            从空白画布开始自定义 →
                        </Text>
                    </Card>
                </div>
            )}
        </div>
    );
};

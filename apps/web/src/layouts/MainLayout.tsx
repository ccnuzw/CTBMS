import React, { useState } from 'react';
import { Layout, Menu, Input, theme as antTheme, Button, Typography, Badge, Grid, Drawer } from 'antd';
import {
    UserOutlined,
    DashboardOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    SearchOutlined,
    BellOutlined,
    CloudOutlined,
    SettingOutlined,
    QuestionCircleOutlined,
    ApartmentOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    BankOutlined,
    TagsOutlined,
    FileTextOutlined,
    AppstoreOutlined,
    ShopOutlined,
    GlobalOutlined,
    ScheduleOutlined,
    FormOutlined,
    AuditOutlined,
    NodeIndexOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { UserDropdown } from '../components/UserDropdown';
import { FullScreenButton } from '../components/FullScreenButton';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

export const MainLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { token } = antTheme.useToken();
    const { colorBgContainer, colorPrimary } = token;
    const navigate = useNavigate();
    const location = useLocation();
    const screens = Grid.useBreakpoint();
    const isMobile = Object.keys(screens).length > 0 && !screens.md;

    // Close drawer when route changes on mobile
    React.useEffect(() => {
        if (isMobile) {
            setCollapsed(true);
        }
    }, [location.pathname, isMobile]);

    const mainMenuItems = React.useMemo(() => [
        {
            key: '/dashboard',
            icon: <DashboardOutlined />,
            label: '仪表盘',
        },
        {
            key: 'intel-center',
            icon: <GlobalOutlined />,
            label: '商情中心',
            children: [
                {
                    key: 'intel-collection',
                    icon: <NodeIndexOutlined />,
                    label: '采集管理',
                    children: [
                        {
                            key: '/price-reporting',
                            icon: <FormOutlined />,
                            label: '填报工作台',
                        },
                        {
                            key: '/intel/tasks',
                            icon: <ScheduleOutlined />,
                            label: '任务分配',
                        },
                        {
                            key: '/intel/monitor',
                            icon: <AuditOutlined />,
                            label: '任务监控',
                        },
                        {
                            key: '/price-reporting/review',
                            icon: <AuditOutlined />,
                            label: '价格审核',
                        },
                        {
                            key: '/admin/task-allocation',
                            icon: <ScheduleOutlined />,
                            label: '任务分发工作台',
                        },
                        {
                            key: '/price-reporting/allocation',
                            icon: <NodeIndexOutlined />,
                            label: '采集点分配',
                        },
                    ]
                },
                {
                    key: '/intel',
                    icon: <DashboardOutlined />,
                    label: '全域驾驶舱',
                },
                {
                    key: '/intel/dashboard',
                    icon: <DashboardOutlined />,
                    label: '简版看板',
                },
                {
                    key: '/intel/workbench',
                    icon: <SettingOutlined />,
                    label: '业务工作台',
                },
                {
                    key: '/intel/search',
                    icon: <SearchOutlined />,
                    label: '全景检索',
                },
                {
                    key: '/intel/market-data',
                    icon: <FileTextOutlined />,
                    label: 'A类行情',
                },
                {
                    key: '/intel/feed',
                    icon: <FileTextOutlined />,
                    label: 'B类情报流',
                },
                {
                    key: '/intel/knowledge',
                    icon: <FileTextOutlined />,
                    label: '商情知识库',
                },
                {
                    key: '/intel/leaderboard',
                    icon: <TeamOutlined />,
                    label: '绩效排行',
                },
                {
                    key: '/intel/collection-points',
                    icon: <SettingOutlined />,
                    label: '采集点配置',
                },
                {
                    key: '/intel/extraction-config',
                    icon: <SettingOutlined />,
                    label: '配置中心',
                },
            ]
        },
        {
            key: 'collection',
            icon: <CloudOutlined />,
            label: '信息采集管理',
            children: [
                {
                    key: '/market/categories',
                    icon: <AppstoreOutlined />,
                    label: '信息分类',
                },
                {
                    key: '/market/info',
                    icon: <FileTextOutlined />,
                    label: '信息采集',
                },
                {
                    key: '/intel/entry',
                    icon: <CloudOutlined />,
                    label: '智能采集',
                },
            ]
        },
        {
            key: 'org',
            icon: <ApartmentOutlined />,
            label: '组织与权限',
            children: [
                {
                    key: '/organization/manage',
                    icon: <TeamOutlined />,
                    label: '统一管理',
                },
                {
                    key: '/organization',
                    icon: <BankOutlined />,
                    label: '组织管理',
                },
                {
                    key: '/organization/departments',
                    icon: <ApartmentOutlined />,
                    label: '部门管理',
                },
                {
                    key: '/users',
                    icon: <UserOutlined />,
                    label: '用户管理',
                },
                {
                    key: '/roles',
                    icon: <SafetyCertificateOutlined />,
                    label: '角色管理',
                }
            ]
        },
        {
            key: '/enterprise',
            icon: <ShopOutlined />,
            label: '客商管理',
        },
        {
            key: 'system',
            icon: <SettingOutlined />,
            label: '系统管理',
            children: [
                {
                    key: '/system/tags',
                    icon: <TagsOutlined />,
                    label: '全局标签',
                },
                {
                    key: '/system/tag-groups',
                    icon: <AppstoreOutlined />,
                    label: '标签组',
                },
                {
                    key: '/system/regions',
                    icon: <GlobalOutlined />,
                    label: '行政区划',
                },
                {
                    key: 'config-center',
                    icon: <AppstoreOutlined />,
                    label: '配置中心',
                    children: [
                        {
                            key: '/system/config/rules',
                            label: '业务规则',
                        },
                        {
                            key: '/system/config/ai-models',
                            label: 'AI 模型',
                        },
                        {
                            key: '/system/config/prompts',
                            label: '提示词库',
                        }
                    ]
                },
                {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: '设置中心',
                    children: [
                        {
                            key: '/settings/general',
                            label: '通用设置',
                        },
                        {
                            key: '/settings/security',
                            label: '安全设置',
                        },
                        {
                            key: '/system/config/seeding',
                            label: '数据初始化',
                        }
                    ]
                }
            ]
        },
    ], []);

    const bottomMenuItems = React.useMemo(() => [
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: '系统设置',
        },
        {
            key: 'help',
            icon: <QuestionCircleOutlined />,
            label: '帮助文档',
        },
    ], []);

    const findMenuLabel = (items: any[], key: string): string | undefined => {
        for (const item of items) {
            if (item.key === key) return item.label;
            if (item.children) {
                const found = findMenuLabel(item.children, key);
                if (found) return found;
            }
        }
        return undefined;
    };

    const getPageTitle = () => {
        const found = findMenuLabel(mainMenuItems, location.pathname) || findMenuLabel(bottomMenuItems, location.pathname);
        return found || 'CTBMS 系统管理';
    };

    return (
        <Layout style={{ height: '100vh', overflow: 'hidden' }}>
            <style>
                {`
                    body {
                        margin: 0;
                        padding: 0;
                        overflow: hidden; /* Prevent body scroll, let Layout handle it */
                    }
                `}
            </style>
            {!isMobile && (
                <Sider
                    trigger={null}
                    collapsible
                    collapsed={collapsed}
                    width={220}
                    style={{
                        background: colorBgContainer,
                        borderRight: `1px solid ${token.colorBorderSecondary}`,
                        // Flex column to ensure children fill the space
                        display: 'flex',
                        flexDirection: 'column',
                        // Ensure internal ANT layout dividers don't mess up
                        padding: 0,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{
                            padding: collapsed ? '24px 0' : '24px 16px 24px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            gap: 12,
                            flexShrink: 0
                        }}>
                            <div style={{
                                width: 40,
                                height: 40,
                                background: `${colorPrimary}1A`, // 10% opacity
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: colorPrimary,
                                flexShrink: 0
                            }}>
                                <CloudOutlined style={{ fontSize: 24 }} />
                            </div>
                            {!collapsed && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <Title level={5} style={{ margin: 0, lineHeight: 1 }}>CTBMS</Title>
                                    <Text type="secondary" style={{ fontSize: 12 }}>系统管理平台</Text>
                                </div>
                            )}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <Menu
                                mode="inline"
                                selectedKeys={[location.pathname]}
                                onClick={({ key }) => navigate(key)}
                                style={{ borderRight: 0, padding: '0 12px' }}
                                items={mainMenuItems}
                            />
                        </div>

                        <div style={{ padding: '0 0 12px 0', borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
                            <Menu
                                mode="inline"
                                selectable={false}
                                style={{ borderRight: 0 }}
                                items={bottomMenuItems}
                            />
                            <div
                                onClick={() => setCollapsed(!collapsed)}
                                style={{
                                    height: 40,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: token.colorTextSecondary,
                                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                                    marginTop: 4,
                                    fontSize: 16
                                }}
                            >
                                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            </div>
                        </div>
                    </div>
                </Sider>
            )
            }


            {/* Mobile Navigation Drawer */}
            <Drawer
                placement="left"
                onClose={() => setCollapsed(true)}
                open={!collapsed && isMobile}
                styles={{ body: { padding: 0 }, header: { display: 'none' } }}
                style={{ width: 220 }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ padding: '24px 16px 24px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                        <div style={{
                            width: 40,
                            height: 40,
                            background: `${colorPrimary}1A`, // 10% opacity
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: colorPrimary,
                            flexShrink: 0
                        }}>
                            <CloudOutlined style={{ fontSize: 24 }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <Title level={5} style={{ margin: 0, lineHeight: 1 }}>CTBMS</Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>系统管理平台</Text>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <Menu
                            mode="inline"
                            selectedKeys={[location.pathname]}
                            onClick={({ key }) => navigate(key)}
                            style={{ borderRight: 0, padding: '0 12px' }}
                            items={mainMenuItems}
                        />
                    </div>

                    <div style={{ padding: '0 0 12px 0', borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
                        <Menu
                            mode="inline"
                            selectable={false}
                            style={{ borderRight: 0 }}
                            items={bottomMenuItems}
                        />
                    </div>
                </div>
            </Drawer>
            <Layout style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Header style={{
                    padding: '0 24px',
                    background: colorBgContainer,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    height: 48,
                    flexShrink: 0,
                    zIndex: 99
                }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {isMobile && (
                            <div
                                onClick={() => setCollapsed(!collapsed)}
                                style={{
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: token.colorText
                                }}
                            >
                                {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            </div>
                        )}
                        <Title level={4} style={{ margin: 0, fontSize: isMobile ? '16px' : undefined }}>{getPageTitle()}</Title>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16 }}>
                        {!isMobile && (
                            <Input
                                prefix={<SearchOutlined style={{ color: token.colorTextPlaceholder }} />}
                                placeholder="搜索节点、规则..."
                                style={{ width: 200, borderRadius: 8, background: token.colorFillTertiary, border: 'none' }}
                                bordered={false}
                            />
                        )}
                        <Button
                            type="text"
                            shape="circle"
                            style={{ marginRight: isMobile ? 0 : 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            icon={
                                <Badge dot color="red">
                                    <BellOutlined style={{ fontSize: 20, color: token.colorTextSecondary }} />
                                </Badge>
                            }
                        />
                        <FullScreenButton style={{ marginRight: isMobile ? 0 : 8 }} />
                        <ThemeSwitcher />
                        <UserDropdown />
                    </div>
                </Header>
                <Content
                    style={{
                        padding: isMobile ? 0 : 24,
                        minHeight: 280,
                        overflowY: 'auto',
                        overflowX: 'hidden' // Ensure horizontal scroll doesn't happen
                    }}
                >
                    <Outlet />
                </Content>
            </Layout>
        </Layout >
    );
};

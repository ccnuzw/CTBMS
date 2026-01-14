import React, { useState } from 'react';
import { Layout, Menu, Input, Avatar, Space, theme as antTheme, Button, Typography, Badge, Dropdown, MenuProps, Grid, Drawer } from 'antd';
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
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ThemeSwitcher } from '../components/ThemeSwitcher';
import { UserDropdown } from '../components/UserDropdown';

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

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/dashboard':
                return '仪表盘概览';
            case '/users':
                return '用户管理';
            case '/market/categories':
                return '信息分类管理';
            case '/market/info':
                return '信息采集';
            case '/organization':
                return '组织管理';
            case '/organization/departments':
                return '部门管理';
            case '/enterprise':
                return '客商管理';
            case '/system/tags':
                return '全局标签管理';
            case '/system/tag-groups':
                return '标签组管理';
            default:
                return 'CTBMS 系统管理';
        }
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
                                items={[
                                    {
                                        key: '/dashboard',
                                        icon: <DashboardOutlined />,
                                        label: '仪表盘',
                                    },
                                    {
                                        key: 'market',
                                        icon: <CloudOutlined />,
                                        label: '信息采集',
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
                                            }
                                        ]
                                    },
                                    {
                                        key: 'org',
                                        icon: <ApartmentOutlined />,
                                        label: '组织架构',
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
                                                    }
                                                ]
                                            }
                                        ]
                                    },
                                ]}
                            />
                        </div>

                        <div style={{ padding: '0 0 12px 0', borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
                            <Menu
                                mode="inline"
                                selectable={false}
                                style={{ borderRight: 0 }}
                                items={[
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
                                ]}
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
                            items={[
                                {
                                    key: '/dashboard',
                                    icon: <DashboardOutlined />,
                                    label: '仪表盘',
                                },
                                {
                                    key: 'market',
                                    icon: <CloudOutlined />,
                                    label: '信息采集',
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
                                        }
                                    ]
                                },
                                {
                                    key: 'org',
                                    icon: <ApartmentOutlined />,
                                    label: '组织架构',
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
                                                }
                                            ]
                                        }
                                    ]
                                },
                            ]}
                        />
                    </div>

                    <div style={{ padding: '0 0 12px 0', borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
                        <Menu
                            mode="inline"
                            selectable={false}
                            style={{ borderRight: 0 }}
                            items={[
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
                            ]}
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

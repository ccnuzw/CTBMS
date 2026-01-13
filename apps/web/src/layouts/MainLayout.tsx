import React, { useState } from 'react';
import { Layout, Menu, Input, Avatar, Space, theme as antTheme, Button, Typography, Badge, Dropdown, MenuProps } from 'antd';
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

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/dashboard':
                return '仪表盘概览';
            case '/users':
                return '用户管理';
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
                                    key: 'system',
                                    icon: <SettingOutlined />,
                                    label: '系统管理',
                                    children: [
                                        {
                                            key: '/users',
                                            icon: <UserOutlined />,
                                            label: '用户管理',
                                        },
                                        {
                                            key: 'settings',
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
                        <Title level={4} style={{ margin: 0 }}>{getPageTitle()}</Title>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <Input
                            prefix={<SearchOutlined style={{ color: token.colorTextPlaceholder }} />}
                            placeholder="搜索节点、规则..."
                            style={{ width: 200, borderRadius: 8, background: token.colorFillTertiary, border: 'none' }}
                            variant="borderless"
                        />
                        <Badge dot color="red" style={{ marginRight: 8 }}>
                            <BellOutlined style={{ fontSize: 20, color: token.colorTextSecondary, cursor: 'pointer' }} />
                        </Badge>
                        <ThemeSwitcher />
                        <UserDropdown />
                    </div>
                </Header>
                <Content
                    style={{
                        padding: 24, // Use padding instead of margin to absorb negative margins
                        minHeight: 280,
                        overflowY: 'auto',
                        overflowX: 'hidden' // Ensure horizontal scroll doesn't happen
                    }}
                >
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
};

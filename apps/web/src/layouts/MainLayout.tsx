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
    LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

export const MainLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const {
        token: { colorBgContainer, borderRadiusLG, colorPrimary },
    } = antTheme.useToken();
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

    const userMenu: MenuProps['items'] = [
        {
            key: 'profile',
            label: '个人中心',
            icon: <UserOutlined />,
        },
        {
            key: 'settings',
            label: '系统设置',
            icon: <SettingOutlined />,
        },
        {
            type: 'divider',
        },
        {
            key: 'logout',
            label: '退出登录',
            icon: <LogoutOutlined />,
            danger: true,
        },
    ];

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
                    background: '#fff',
                    borderRight: '1px solid #f0f0f0',
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
                            theme="light"
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
                                    key: '/users',
                                    icon: <UserOutlined />,
                                    label: '用户管理',
                                },
                            ]}
                        />
                    </div>

                    <div style={{ padding: '0 0 12px 0', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                        <Menu
                            theme="light"
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
                                color: '#8c8c8c',
                                borderTop: '1px solid #f0f0f0',
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
                    borderBottom: '1px solid #f0f0f0',
                    height: 48,
                    flexShrink: 0,
                    zIndex: 99
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <Title level={4} style={{ margin: 0 }}>{getPageTitle()}</Title>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        <Input
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                            placeholder="搜索节点、规则..."
                            style={{ width: 280, borderRadius: 8, background: '#f5f5f5', border: 'none' }}
                            variant="borderless"
                        />
                        <Badge dot color="red">
                            <span style={{ display: 'flex', alignItems: 'center' }}>
                                <BellOutlined style={{ fontSize: 20, color: '#8c8c8c', cursor: 'pointer' }} />
                            </span>
                        </Badge>
                        <div style={{ height: 24, width: 1, background: '#f0f0f0' }} />
                        <Dropdown menu={{ items: userMenu }} placement="bottomRight" arrow>
                            <Space size="middle" style={{ cursor: 'pointer' }}>
                                <div style={{ textAlign: 'right', display: 'none', lineHeight: 1.2 }}>
                                    <div style={{ fontWeight: 500 }}>管理员</div>
                                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>系统操作员</div>
                                </div>
                                <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>管理员</div>
                                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>系统操作员</div>
                                </div>
                                <Avatar icon={<UserOutlined />} style={{ backgroundColor: colorPrimary }} />
                            </Space>
                        </Dropdown>
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

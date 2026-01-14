import React from 'react';
import { Dropdown, Avatar, Typography, MenuProps, theme, Space } from 'antd';
import { UserOutlined, SettingOutlined, LogoutOutlined, DownOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

export const UserDropdown: React.FC = () => {
    const { token } = theme.useToken();

    const menuStyle: React.CSSProperties = {
        boxShadow: token.boxShadowSecondary,
        borderRadius: token.borderRadiusLG,
        padding: 16,
        width: 280,
        backgroundColor: token.colorBgElevated,
    };

    const itemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        padding: '10px 12px',
        fontSize: 14,
        cursor: 'pointer',
        borderRadius: token.borderRadius,
        transition: 'background-color 0.2s',
        marginBottom: 4,
        color: token.colorText,
    };

    const dropdownContent = (
        <div style={menuStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '0 8px' }}>
                <Avatar
                    size={64}
                    style={{
                        backgroundColor: '#8b5cf6', // Purple color from image
                        fontSize: 24,
                        verticalAlign: 'middle',
                        border: `4px solid ${token.colorBgContainer}` // White border effect if on white bg
                    }}
                >
                    KU
                </Avatar>
                <div style={{ overflow: 'hidden' }}>
                    <Title level={5} style={{ margin: 0, marginBottom: 4 }}>kuaidao</Title>
                    <Text type="secondary" ellipsis style={{ fontSize: 13 }}>ccnuzw@gmail.com</Text>
                </div>
            </div>

            <div
                style={itemStyle}
                className="user-menu-item"
                onClick={() => console.log('Profile clicked')}
            >
                <UserOutlined style={{ marginRight: 12, fontSize: 16 }} />
                <span>个人资料</span>
            </div>

            <div
                style={itemStyle}
                className="user-menu-item"
                onClick={() => console.log('Settings clicked')}
            >
                <SettingOutlined style={{ marginRight: 12, fontSize: 16 }} />
                <span>设置</span>
            </div>

            <div
                style={{ ...itemStyle, color: token.colorError, marginTop: 12 }}
                className="user-menu-item-danger"
                onClick={() => console.log('Logout clicked')}
            >
                <LogoutOutlined style={{ marginRight: 12, fontSize: 16 }} />
                <span>退出登录</span>
            </div>

            <style>
                {`
                    .user-menu-item:hover {
                        background-color: ${token.colorFillTertiary};
                    }
                    .user-menu-item-danger:hover {
                        background-color: ${token.colorErrorBg};
                    }
                `}
            </style>
        </div>
    );

    return (
        <Dropdown
            dropdownRender={() => dropdownContent}
            placement="bottomRight"
            trigger={['click']}
        >
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 20,
                border: `1px solid ${token.colorBorder}`,
                backgroundColor: token.colorBgContainer,
                boxShadow: token.boxShadowTertiary, // Subtle shadow for the pill
            }}>
                <Avatar
                    size={32}
                    style={{
                        backgroundColor: '#8b5cf6', // Matching purple
                        fontSize: 14
                    }}
                >
                    KU
                </Avatar>
                <DownOutlined style={{ fontSize: 12, color: token.colorTextTertiary }} />
            </div>
        </Dropdown>
    );
};

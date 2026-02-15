import React from 'react';
import { Dropdown, Avatar, Typography, theme, Tag } from 'antd';
import { UserOutlined, SettingOutlined, LogoutOutlined, DownOutlined } from '@ant-design/icons';
import { useVirtualUser } from '@/features/auth/virtual-user';

const { Text, Title } = Typography;

export const UserDropdown: React.FC = () => {
  const { token } = theme.useToken();
  const { currentUser, isVirtual, clear } = useVirtualUser();
  const displayName = currentUser?.name || '系统管理员';
  const displayEmail = currentUser?.email || (isVirtual ? '未设置邮箱' : 'admin@example.com');
  const displayOrg = [currentUser?.organizationName, currentUser?.departmentName]
    .filter(Boolean)
    .join(' / ');
  const initials = displayName ? displayName.slice(0, 2) : 'NA';

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24,
          padding: '0 8px',
        }}
      >
        <Avatar
          size={64}
          src={currentUser?.avatar || undefined}
          style={{
            backgroundColor: currentUser?.avatar ? undefined : token.colorPrimary,
            fontSize: 24,
            verticalAlign: 'middle',
            border: `4px solid ${token.colorBgContainer}`,
          }}
        >
          {!currentUser?.avatar && initials}
        </Avatar>
        <div style={{ overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Title level={5} style={{ margin: 0, marginBottom: 4 }} ellipsis>
              {displayName}
            </Title>
            {isVirtual && (
              <Tag color="blue" bordered={false} style={{ marginInlineEnd: 0 }}>
                虚拟登录
              </Tag>
            )}
          </div>
          <Text type="secondary" ellipsis style={{ fontSize: 13 }}>
            {displayEmail}
          </Text>
          {displayOrg && (
            <Text
              type="secondary"
              ellipsis
              style={{ fontSize: 12, display: 'block', marginTop: 2 }}
            >
              {displayOrg}
            </Text>
          )}
        </div>
      </div>

      <div style={itemStyle} className="user-menu-item">
        <UserOutlined style={{ marginRight: 12, fontSize: 16 }} />
        <span>个人资料</span>
      </div>

      <div style={itemStyle} className="user-menu-item">
        <SettingOutlined style={{ marginRight: 12, fontSize: 16 }} />
        <span>设置</span>
      </div>

      {isVirtual && (
        <div
          style={{ ...itemStyle, color: token.colorError, marginTop: 12 }}
          className="user-menu-item-danger"
          onClick={clear}
        >
          <LogoutOutlined style={{ marginRight: 12, fontSize: 16 }} />
          <span>切换为系统管理员</span>
        </div>
      )}

      <style>
        {`
                    .user-menu-item:hover {
                        background-color: ${token.colorFillTertiary};
                    }
                    .user-menu-item-danger:hover {
                        background-color: ${token.colorErrorBg};
                    }
                    .user-pill-name {
                        max-width: 120px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    @media (max-width: 768px) {
                        .user-pill-name {
                            display: none;
                        }
                    }
                `}
      </style>
    </div>
  );

  return (
    <Dropdown dropdownRender={() => dropdownContent} placement="bottomRight" trigger={['click']}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 20,
          border: `1px solid ${token.colorBorder}`,
          backgroundColor: token.colorBgContainer,
          boxShadow: token.boxShadowTertiary, // Subtle shadow for the pill
        }}
      >
        <Avatar
          size={32}
          src={currentUser?.avatar || undefined}
          style={{
            backgroundColor: currentUser?.avatar ? undefined : token.colorPrimary,
            fontSize: 14,
          }}
        >
          {!currentUser?.avatar && initials}
        </Avatar>
        <span className="user-pill-name" style={{ fontSize: 13, color: token.colorText }}>
          {displayName}
        </span>
        <DownOutlined style={{ fontSize: 12, color: token.colorTextTertiary }} />
      </div>
    </Dropdown>
  );
};

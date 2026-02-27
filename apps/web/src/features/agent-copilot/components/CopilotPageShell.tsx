import React, { useMemo, useState } from 'react';
import { Segmented, theme, Flex } from 'antd';
import { MessageOutlined, SettingOutlined } from '@ant-design/icons';

import { useVirtualUser } from '../../auth/virtual-user';
import { CopilotChatView } from './CopilotChatView';
import { AgentCopilotPage as CopilotAdminView } from './AgentCopilotPage';

/**
 * 入口 Shell 组件：在对话助手（普通用户界面）和会话管理（管理界面）之间切换。
 * 开发阶段所有用户都可见切换按钮。
 */
export const CopilotPageShell: React.FC = () => {
  const { token } = theme.useToken();
  const { currentUser } = useVirtualUser();
  const isAdminUser = useMemo(() => {
    const roleNames = Array.isArray(currentUser?.roleNames) ? currentUser.roleNames : [];
    return roleNames.some((role) => ['SUPER_ADMIN', 'ADMIN'].includes(String(role).toUpperCase()));
  }, [currentUser?.roleNames]);

  const [viewMode, setViewMode] = useState<'CHAT' | 'ADMIN'>('CHAT');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 模式切换栏 — 放在功能区顶部（开发阶段所有用户可见） */}
      <Flex
        align="center"
        gap={12}
        style={{
          padding: '8px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
          flexShrink: 0,
        }}
      >
        <Segmented
          value={viewMode}
          onChange={(value) => setViewMode(value as 'CHAT' | 'ADMIN')}
          options={[
            {
              label: (
                <span style={{ padding: '0 8px' }}>
                  <MessageOutlined style={{ marginRight: 6 }} />
                  对话助手
                </span>
              ),
              value: 'CHAT',
            },
            {
              label: (
                <span style={{ padding: '0 8px' }}>
                  <SettingOutlined style={{ marginRight: 6 }} />
                  会话管理
                </span>
              ),
              value: 'ADMIN',
            },
          ]}
          style={{ borderRadius: 8 }}
        />
      </Flex>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {viewMode === 'ADMIN' ? (
          <CopilotAdminView />
        ) : (
          <CopilotChatView
            isAdminUser={isAdminUser}
            onSwitchToAdmin={() => setViewMode('ADMIN')}
          />
        )}
      </div>
    </div>
  );
};

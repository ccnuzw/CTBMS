import React, { useMemo, useState } from 'react';

import { useVirtualUser } from '../../auth/virtual-user';
import { useCopilotVersion } from '../api/conversations';
import { CopilotChatView } from './CopilotChatView';
import { AgentCopilotPage as CopilotAdminView } from './AgentCopilotPage';

/**
 * 入口 Shell 组件：根据用户角色和 copilot-v2 灰度开关决定显示极简对话视图或完整管理视图。
 * - v2 + 普通用户 → CopilotChatView
 * - v2 + 管理员 → CopilotChatView（可手动切换到 AdminView）
 * - v1 → CopilotAdminView（保持原始完整视图）
 */
export const CopilotPageShell: React.FC = () => {
  const { currentUser } = useVirtualUser();
  const isAdminUser = useMemo(() => {
    const roleNames = Array.isArray(currentUser?.roleNames) ? currentUser.roleNames : [];
    return roleNames.some((role) => ['SUPER_ADMIN', 'ADMIN'].includes(String(role).toUpperCase()));
  }, [currentUser?.roleNames]);

  const copilotVersionQuery = useCopilotVersion();
  const effectiveVersion = copilotVersionQuery.data?.version ?? 'v2';

  const [viewMode, setViewMode] = useState<'CHAT' | 'ADMIN'>('CHAT');

  // v1 回退到原始完整视图
  if (effectiveVersion === 'v1') {
    return <CopilotAdminView />;
  }

  // v2 管理员手动切换
  if (viewMode === 'ADMIN' && isAdminUser) {
    return <CopilotAdminView />;
  }

  // v2 默认极简对话视图
  return (
    <CopilotChatView
      isAdminUser={isAdminUser}
      onSwitchToAdmin={isAdminUser ? () => setViewMode('ADMIN') : undefined}
    />
  );
};

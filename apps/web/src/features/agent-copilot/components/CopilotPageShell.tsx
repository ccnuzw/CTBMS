import React, { useMemo, useState } from 'react';

import { useVirtualUser } from '../../auth/virtual-user';
import { AgentCopilotPage as CopilotAdminView } from './AgentCopilotPage';
import { CopilotChatView } from './CopilotChatView';

/**
 * 默认进入普通用户对话视图，仅对管理员保留管理视图切换能力。
 */
export const CopilotPageShell: React.FC = () => {
  const { currentUser } = useVirtualUser();
  const isAdminUser = useMemo(() => {
    const roleNames = Array.isArray(currentUser?.roleNames) ? currentUser.roleNames : [];
    return roleNames.some((role) => ['SUPER_ADMIN', 'ADMIN'].includes(String(role).toUpperCase()));
  }, [currentUser?.roleNames]);

  const [viewMode, setViewMode] = useState<'CHAT' | 'ADMIN'>('CHAT');

  if (viewMode === 'ADMIN' && isAdminUser) {
    return <CopilotAdminView />;
  }

  return <CopilotChatView isAdminUser={isAdminUser} onSwitchToAdmin={() => setViewMode('ADMIN')} />;
};

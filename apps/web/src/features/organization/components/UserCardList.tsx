import React, { useState, useMemo } from 'react';
import {
    Flex,
    Input,
    Button,
    Avatar,
    Badge,
    theme,
    Spin,
    Empty,
    App,
    Modal,
    List,
    Checkbox,
} from 'antd';
import {
    SearchOutlined,
    UserOutlined,
    UserAddOutlined,
    UsergroupAddOutlined,
} from '@ant-design/icons';
import { useUsers, UserWithRelations, useUpdateUser } from '../../users/api/users';
import { useOrganizations } from '../api/organizations';
import { useDepartments } from '../api/departments';
import { UserStatus, UpdateUserDto } from '@packages/types';
import type { SelectedNode } from './OrgDeptTree';
import { UserFormModal, USER_STATUS_CONFIG } from '../../users/components/UserFormModal';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

interface UserCardListProps {
    selectedNode: SelectedNode | null;
    selectedUserId: string | null;
    onSelectUser: (userId: string | null) => void;
    showAllLevels: boolean;
}

export const UserCardList: React.FC<UserCardListProps> = ({
    selectedNode,
    selectedUserId,
    onSelectUser,
    showAllLevels,
}) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();

    // 状态
    const [searchValue, setSearchValue] = useState('');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedUnassignedUsers, setSelectedUnassignedUsers] = useState<string[]>([]);
    const { containerRef, focusRef, modalProps } = useModalAutoFocus();

    // 构建筛选参数
    const filters = useMemo(() => {
        if (!selectedNode) return {};
        if (selectedNode.type === 'org') {
            return { organizationId: selectedNode.id };
        } else if (selectedNode.type === 'dept') {
            return { departmentId: selectedNode.id };
        }
        return {};
    }, [selectedNode]);

    // 获取数据
    const { data: allUsers, isLoading, refetch } = useUsers({});
    const { data: organizations } = useOrganizations();
    const { data: departments } = useDepartments(selectedNode?.type === 'org' ? selectedNode.id : selectedNode?.orgId);
    const { data: allDepartments } = useDepartments(); // 获取所有部门用于构建层级
    const updateUserMutation = useUpdateUser();

    // 获取未分配的用户
    const unassignedUsers = useMemo(() => {
        if (!allUsers) return [];
        return allUsers.filter((u) => !u.organizationId && !u.departmentId);
    }, [allUsers]);

    // 查找所有子组织ID
    const getDescendantOrgIds = (orgId: string, allOrgs: any[]): string[] => {
        const children = allOrgs.filter(org => org.parentId === orgId);
        let ids = children.map(child => child.id);
        children.forEach(child => {
            ids = [...ids, ...getDescendantOrgIds(child.id, allOrgs)];
        });
        return ids;
    };

    // 查找所有子部门ID
    const getDescendantDeptIds = (deptId: string, allDepts: any[]): string[] => {
        const children = allDepts.filter(dept => dept.parentId === deptId);
        let ids = children.map(child => child.id);
        children.forEach(child => {
            ids = [...ids, ...getDescendantDeptIds(child.id, allDepts)];
        });
        return ids;
    };

    // 根据选中节点筛选用户
    const filteredUsers = useMemo(() => {
        if (!allUsers) return [];

        // 未选中组织时不显示任何用户
        if (!selectedNode) return [];

        let users = allUsers;

        // 应用组织/部门筛选
        if (selectedNode.type === 'org') {
            if (showAllLevels && organizations) {
                // 显示所有层级：包含该组织及其下所有子组织的员工
                const descendantIds = getDescendantOrgIds(selectedNode.id, organizations);
                const targetOrgIds = [selectedNode.id, ...descendantIds];
                users = users.filter((u) => u.organizationId && targetOrgIds.includes(u.organizationId));
            } else {
                // 仅显示直属该组织的员工（包括该组织下各部门的员工）
                users = users.filter((u) => u.organizationId === selectedNode.id);
            }
        } else if (selectedNode.type === 'dept') {
            if (showAllLevels && allDepartments) {
                // 显示所有层级：包含该部门及其下所有子部门的员工
                const descendantIds = getDescendantDeptIds(selectedNode.id, allDepartments);
                const targetDeptIds = [selectedNode.id, ...descendantIds];
                users = users.filter((u) => u.departmentId && targetDeptIds.includes(u.departmentId));
            } else {
                users = users.filter((u) => u.departmentId === selectedNode.id);
            }
        }

        // 应用搜索筛选
        if (searchValue) {
            const lowerSearch = searchValue.toLowerCase();
            users = users.filter(
                (user) =>
                    user.name.toLowerCase().includes(lowerSearch) ||
                    user.employeeNo?.toLowerCase().includes(lowerSearch) ||
                    user.organization?.name?.toLowerCase().includes(lowerSearch) ||
                    user.department?.name?.toLowerCase().includes(lowerSearch)
            );
        }

        return users;
    }, [allUsers, selectedNode, showAllLevels, searchValue, organizations, allDepartments]);

    // 分配未分配用户到当前组织/部门
    const handleAssignUsers = async () => {
        if (!selectedNode || selectedUnassignedUsers.length === 0) return;

        try {
            const updates: Promise<any>[] = selectedUnassignedUsers.map((userId) => {
                const data: UpdateUserDto = {};
                if (selectedNode.type === 'org') {
                    data.organizationId = selectedNode.id;
                } else if (selectedNode.type === 'dept') {
                    data.departmentId = selectedNode.id;
                    data.organizationId = selectedNode.orgId;
                }
                return updateUserMutation.mutateAsync({ id: userId, data });
            });

            await Promise.all(updates);
            message.success(`成功分配 ${selectedUnassignedUsers.length} 名用户`);
            setAssignModalOpen(false);
            setSelectedUnassignedUsers([]);
        } catch (error) {
            message.error((error as Error).message || '分配失败');
        }
    };

    // 构建部门Map用于查找父级
    const deptMap = useMemo(() => {
        if (!allDepartments) return new Map<string, any>();
        return new Map(allDepartments.map(dept => [dept.id, dept]));
    }, [allDepartments]);

    return (
        <Flex
            vertical
            style={{
                height: '100%',
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgLayout,
                overflow: 'hidden',
            }}
        >
            {/* 头部 */}
            <Flex
                vertical
                gap={12}
                style={{
                    padding: 16,
                    background: token.colorBgContainer,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Input
                    placeholder="搜索用户..."
                    prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    allowClear
                />
                <Flex justify="space-between" align="center">
                    <span style={{ fontSize: 14, fontWeight: 600, color: token.colorText }}>
                        {selectedNode?.name || '全部用户'}{' '}
                        <span
                            style={{
                                fontWeight: 400,
                                fontSize: 12,
                                color: token.colorTextSecondary,
                            }}
                        >
                            {filteredUsers.length}
                        </span>
                    </span>
                    <Flex gap={8}>
                        {/* 分配用户按钮 - 始终显示 */}
                        <Button
                            type="default"
                            size="small"
                            icon={<UsergroupAddOutlined />}
                            onClick={() => setAssignModalOpen(true)}
                            disabled={!selectedNode || unassignedUsers.length === 0}
                            title={!selectedNode
                                ? '请先选择一个组织'
                                : unassignedUsers.length > 0
                                    ? `分配 ${unassignedUsers.length} 名未归属用户`
                                    : '没有未分配的用户'}
                        >
                            分配
                        </Button>
                        {/* 新增用户按钮 */}
                        <Button
                            type="primary"
                            size="small"
                            icon={<UserAddOutlined />}
                            onClick={() => setCreateModalOpen(true)}
                        >
                            新增
                        </Button>
                    </Flex>
                </Flex>
            </Flex>

            {/* 用户列表 */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                {isLoading ? (
                    <Flex justify="center" align="center" style={{ height: 200 }}>
                        <Spin />
                    </Flex>
                ) : filteredUsers.length === 0 ? (
                    <Empty
                        description={selectedNode ? '该组织暂无用户' : '请选择一个组织'}
                        style={{ marginTop: 60 }}
                    />
                ) : (
                    <Flex vertical>
                        {filteredUsers.map((user) => (
                            <UserCard
                                key={user.id}
                                user={user}
                                isSelected={user.id === selectedUserId}
                                onClick={() => onSelectUser(user.id)}
                                deptMap={deptMap}
                            />
                        ))}
                    </Flex>
                )}
            </div>

            {/* 新增用户弹窗 */}
            <UserFormModal
                open={createModalOpen}
                onOpenChange={setCreateModalOpen}
                onSuccess={() => refetch()}
                organizationId={selectedNode?.type === 'org' ? selectedNode.id : selectedNode?.orgId}
                departmentId={selectedNode?.type === 'dept' ? selectedNode.id : undefined}
                title={selectedNode
                    ? `新增用户 - ${selectedNode.name}${selectedNode.type === 'dept' ? '（部门）' : ''}`
                    : '新增用户'}
                hint={selectedNode && (
                    <>ℹ️ 新用户将被添加到: <strong>{selectedNode.name}</strong></>
                )}
            />

            {/* 分配用户弹窗 */}
            <Modal
                title={`分配用户到: ${selectedNode?.name || ''}`}
                open={assignModalOpen}
                onCancel={() => {
                    setAssignModalOpen(false);
                    setSelectedUnassignedUsers([]);
                }}
                onOk={handleAssignUsers}
                okText="确认分配"
                cancelText="取消"
                confirmLoading={updateUserMutation.isPending}
                okButtonProps={{ ref: focusRef } as any}
                {...modalProps}
            >
                <div ref={containerRef}>
                    <div style={{ marginBottom: 16 }}>
                        <span style={{ color: token.colorTextSecondary }}>
                            共 {unassignedUsers.length} 名未分配用户
                        </span>
                    </div>
                    <List
                        dataSource={unassignedUsers}
                        style={{ maxHeight: 400, overflow: 'auto' }}
                        renderItem={(user) => (
                            <List.Item style={{ padding: '8px 0' }}>
                                <Checkbox
                                    checked={selectedUnassignedUsers.includes(user.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedUnassignedUsers([...selectedUnassignedUsers, user.id]);
                                        } else {
                                            setSelectedUnassignedUsers(
                                                selectedUnassignedUsers.filter((id) => id !== user.id)
                                            );
                                        }
                                    }}
                                >
                                    <Flex align="center" gap={8}>
                                        <Avatar size="small" icon={<UserOutlined />}>
                                            {user.name?.slice(0, 1)}
                                        </Avatar>
                                        <span>{user.name}</span>
                                        {user.employeeNo && (
                                            <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
                                                ({user.employeeNo})
                                            </span>
                                        )}
                                    </Flex>
                                </Checkbox>
                            </List.Item>
                        )}
                    />
                </div>
            </Modal>
        </Flex>
    );
};

// 用户卡片子组件
interface UserCardProps {
    user: UserWithRelations;
    isSelected: boolean;
    onClick: () => void;
    deptMap: Map<string, any>;
}

const UserCard: React.FC<UserCardProps> = ({ user, isSelected, onClick, deptMap }) => {
    const { token } = theme.useToken();
    const statusConfig = USER_STATUS_CONFIG[user.status as UserStatus] || USER_STATUS_CONFIG.ACTIVE;

    // Map status keys to actual token values dynamically
    const getStatusColor = (key: string) => {
        switch (key) {
            case 'success': return token.colorSuccess;
            case 'warning': return token.colorWarning;
            case 'error': return token.colorError;
            case 'textTertiary': return token.colorTextTertiary;
            default: return token.colorText;
        }
    };

    // 获取公司-部门显示文本
    const orgDeptText = useMemo(() => {
        const parts: string[] = [];
        if (user.organization?.name) {
            parts.push(user.organization.name);
        }

        // 获取部门全路径
        if (user.departmentId) {
            const deptNames: string[] = [];
            let currentDeptId: string | null = user.departmentId;

            // 向上查找所有父级部门
            while (currentDeptId && deptMap.has(currentDeptId)) {
                const dept = deptMap.get(currentDeptId);
                deptNames.unshift(dept.name);
                currentDeptId = dept.parentId || null;
            }

            if (deptNames.length > 0) {
                parts.push(deptNames.join(' - '));
            } else if (user.department?.name) {
                parts.push(user.department.name);
            }
        }

        return parts.join(' - ') || '未分配';
    }, [user.organization, user.department, user.departmentId, deptMap]);

    return (
        <Flex
            align="center"
            gap={12}
            onClick={onClick}
            style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderLeft: isSelected ? `4px solid ${token.colorPrimary}` : '4px solid transparent',
                background: isSelected ? token.colorBgContainer : 'transparent',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
                if (!isSelected) {
                    e.currentTarget.style.background = token.colorBgTextHover;
                }
            }}
            onMouseLeave={(e) => {
                if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                }
            }}
        >
            {/* 头像 */}
            <Badge
                dot
                color={getStatusColor(statusConfig.color)}
                offset={[-4, 36]}
            >
                <Avatar
                    size={40}
                    src={user.avatar}
                    icon={<UserOutlined />}
                    style={{
                        backgroundColor: user.avatar ? undefined : token.colorPrimary,
                    }}
                >
                    {!user.avatar && user.name?.slice(0, 2)}
                </Avatar>
            </Badge>

            {/* 信息 */}
            <Flex vertical flex={1} style={{ minWidth: 0 }}>
                <Flex justify="space-between" align="center">
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected ? token.colorText : token.colorTextSecondary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {user.name}
                    </span>
                    <span
                        style={{
                            fontSize: 10,
                            fontFamily: 'monospace',
                            color: token.colorTextQuaternary,
                        }}
                    >
                        {user.employeeNo}
                    </span>
                </Flex>
                {/* 显示公司-部门替代职位 */}
                <span
                    style={{
                        fontSize: 12,
                        color: token.colorTextSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {orgDeptText}
                </span>
            </Flex>
        </Flex>
    );
};

export default UserCardList;

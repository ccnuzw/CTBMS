import React from 'react';
import { Alert, Avatar, Badge, Divider, Empty, List, Space, Tag, Tooltip, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';

const { Text } = Typography;

// 负载状态颜色
const getWorkloadColor = (count: number) => {
    if (count < 5) return 'success';
    if (count < 20) return 'warning';
    return 'error';
};

interface AllocationUserListProps {
    sortedUsers: any[];
    selectedUserId: string | null;
    setSelectedUserId: (id: string | null) => void;
    userQueryEnabled: boolean;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    error: Error | null;
    token: Record<string, any>;
}

export const AllocationUserList: React.FC<AllocationUserListProps> = ({
    sortedUsers,
    selectedUserId,
    setSelectedUserId,
    userQueryEnabled,
    isLoading,
    isFetching,
    isError,
    error,
    token,
}) => {
    if (!userQueryEnabled && !isLoading) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="请先选择组织/部门或输入姓名搜索负责人"
                style={{ marginTop: 40 }}
            />
        );
    }

    if (isError) {
        return (
            <Alert
                type="error"
                showIcon
                message="加载负责人失败"
                description={error?.message || '请稍后重试'}
                style={{ margin: 16 }}
            />
        );
    }

    if ((!sortedUsers || sortedUsers.length === 0) && !isLoading) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="请在上方选择组织/部门或输入姓名搜索"
                style={{ marginTop: 40 }}
            />
        );
    }

    return (
        <List
            dataSource={sortedUsers}
            loading={userQueryEnabled && isFetching}
            renderItem={(user) => {
                const pointCount = (user as any).assignedPointCount || 0;
                const taskCount = (user as any).pendingTaskCount || 0;

                return (
                    <List.Item
                        className={`user-list-item ${selectedUserId === user.id ? 'selected' : ''}`}
                        onClick={() => setSelectedUserId(user.id)}
                        style={{
                            cursor: 'pointer',
                            background: selectedUserId === user.id ? token.colorPrimaryBg : 'transparent',
                            padding: '12px',
                            borderRadius: '6px',
                            marginBottom: '4px',
                            border:
                                selectedUserId === user.id
                                    ? `1px solid ${token.colorPrimaryBorder}`
                                    : '1px solid transparent',
                        }}
                    >
                        <List.Item.Meta
                            avatar={
                                <Badge count={taskCount} size="small" offset={[0, 0]}>
                                    <Avatar
                                        icon={<UserOutlined />}
                                        style={{
                                            backgroundColor:
                                                selectedUserId === user.id ? token.colorPrimary : token.colorFill,
                                        }}
                                    />
                                </Badge>
                            }
                            title={
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Text
                                        strong={selectedUserId === user.id}
                                        style={{ color: selectedUserId === user.id ? token.colorText : undefined }}
                                    >
                                        {user.name}
                                    </Text>
                                    <Tooltip title={`已分配采集点: ${pointCount}`}>
                                        <Tag color={getWorkloadColor(pointCount)} bordered={false}>
                                            {pointCount} 点
                                        </Tag>
                                    </Tooltip>
                                </Space>
                            }
                            description={
                                <Space direction="vertical" size={0} style={{ fontSize: '12px', width: '100%' }}>
                                    <Space split={<Divider type="vertical" />}>
                                        {user.organizationName && (
                                            <Text type="secondary">{user.organizationName}</Text>
                                        )}
                                        {user.departmentName && <Text type="secondary">{user.departmentName}</Text>}
                                    </Space>
                                </Space>
                            }
                        />
                    </List.Item>
                );
            }}
            style={{ height: 'calc(100vh - 300px)', overflow: 'auto' }}
        />
    );
};

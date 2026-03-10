import React from 'react';
import { Alert, Badge, Card, Checkbox, Empty, List, Space, Tag, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface AllocationPointListProps {
    filteredPoints: any[];
    queryEnabled: boolean;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    error: Error | null;
    selectedUserId: string | null;
    isSelectionMode: boolean;
    selectedPointIds: Set<string>;
    isLoadingUserAllocations: boolean;
    pointTypeMeta: Record<string, { label: string; color: string; icon: string }>;
    token: Record<string, any>;
    onSelectPoint: (pointId: string, checked: boolean) => void;
    onToggleAllocation: (pointId: string, currentAllocated: boolean) => void;
}

export const AllocationPointList: React.FC<AllocationPointListProps> = ({
    filteredPoints,
    queryEnabled,
    isLoading,
    isFetching,
    isError,
    error,
    selectedUserId,
    isSelectionMode,
    selectedPointIds,
    isLoadingUserAllocations,
    pointTypeMeta,
    token,
    onSelectPoint,
    onToggleAllocation,
}) => {
    if (!queryEnabled && !isLoading) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="请先选择组织/部门或输入人员/采集点关键词"
                style={{ marginTop: 40 }}
            />
        );
    }

    if (isError) {
        return (
            <Alert
                type="error"
                showIcon
                message="加载采集点失败"
                description={error?.message || '请稍后重试'}
                style={{ margin: 16 }}
            />
        );
    }

    if (!filteredPoints.length && !isLoading) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未找到符合条件的采集点"
                style={{ marginTop: 40 }}
            />
        );
    }

    return (
        <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={filteredPoints}
            loading={queryEnabled && isFetching}
            renderItem={(point) => {
                const userAllocationsForPoint =
                    selectedUserId && point.allocations
                        ? point.allocations.filter((a: any) => a.userId === selectedUserId)
                        : [];
                const isAssignedToCurrentUser = userAllocationsForPoint.length > 0;
                const assignedCommodities = userAllocationsForPoint.map(
                    (a: any) => a.commodity || '全品种',
                );

                const isSelected = selectedPointIds.has(point.pointId);
                const actionDisabled =
                    !selectedUserId || (isAssignedToCurrentUser && isLoadingUserAllocations);

                return (
                    <List.Item>
                        <Card
                            size="small"
                            hoverable
                            onClick={() => {
                                if (isSelectionMode && !isAssignedToCurrentUser) {
                                    onSelectPoint(point.pointId, !isSelected);
                                }
                            }}
                            className={isAssignedToCurrentUser ? 'point-card-assigned' : ''}
                            style={{
                                borderColor:
                                    isSelectionMode && isSelected
                                        ? token.colorPrimary
                                        : isAssignedToCurrentUser
                                            ? token.colorSuccessBorder
                                            : token.colorBorder,
                                background:
                                    isSelectionMode && isSelected
                                        ? token.colorPrimaryBg
                                        : isAssignedToCurrentUser
                                            ? token.colorSuccessBg
                                            : token.colorBgContainer,
                                transition: 'all 0.3s',
                            }}
                            actions={
                                !isSelectionMode
                                    ? [
                                        <Checkbox
                                            checked={isAssignedToCurrentUser}
                                            disabled={actionDisabled}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                onToggleAllocation(point.pointId, isAssignedToCurrentUser);
                                            }}
                                        >
                                            {isAssignedToCurrentUser ? '已分配' : '分配'}
                                        </Checkbox>,
                                    ]
                                    : [
                                        <Checkbox
                                            checked={isSelected}
                                            disabled={!selectedUserId || isAssignedToCurrentUser}
                                            onChange={(e) => onSelectPoint(point.pointId, e.target.checked)}
                                        >
                                            选择
                                        </Checkbox>,
                                    ]
                            }
                        >
                            <Card.Meta
                                title={
                                    <Space>
                                        {pointTypeMeta[point.pointType]?.icon && (
                                            <span>{pointTypeMeta[point.pointType]?.icon}</span>
                                        )}
                                        <span>{point.pointName}</span>
                                    </Space>
                                }
                                description={
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                        <Tag color={pointTypeMeta[point.pointType]?.color || 'default'}>
                                            {pointTypeMeta[point.pointType]?.label || point.pointType}
                                        </Tag>

                                        {isAssignedToCurrentUser ? (
                                            <div style={{ marginTop: 4 }}>
                                                <Text
                                                    type="secondary"
                                                    style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
                                                >
                                                    负责品种:
                                                </Text>
                                                <Space size={4} wrap>
                                                    {assignedCommodities.map((c: string, idx: number) => (
                                                        <Tag key={idx} color="green" style={{ margin: 0 }}>
                                                            {c}
                                                        </Tag>
                                                    ))}
                                                </Space>
                                            </div>
                                        ) : point.allocatedUserIds.length > 0 ? (
                                            <Space size={2} wrap>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    已分配给:
                                                </Text>
                                                <Badge
                                                    count={point.allocatedUserIds.length}
                                                    style={{ backgroundColor: token.colorSuccess }}
                                                />
                                            </Space>
                                        ) : (
                                            <Tag icon={<WarningOutlined />} color="warning">
                                                未分配
                                            </Tag>
                                        )}
                                    </Space>
                                }
                            />
                        </Card>
                    </List.Item>
                );
            }}
            style={{ height: 'calc(100vh - 300px)', overflow: 'auto', padding: '0 8px' }}
        />
    );
};

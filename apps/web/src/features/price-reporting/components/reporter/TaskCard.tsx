import React from 'react';
import { Card, Tag, Button, Space, Typography, Badge, Tooltip, theme } from 'antd';
import {
    ClockCircleOutlined,
    EnvironmentOutlined,
    FileTextOutlined,
    WarningOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { IntelTaskStatus, IntelTaskType, INTEL_TASK_TYPE_LABELS } from '@packages/types';
import dayjs from 'dayjs';

const { Text } = Typography;

const POINT_TYPE_ICONS: Record<string, string> = {
    PORT: '⚓',
    ENTERPRISE: '🏭',
    STATION: '🚂',
    MARKET: '🏪',
    REGION: '📍',
};

export interface TaskCardProps {
    task: {
        id: string;
        title: string;
        description?: string;
        type: IntelTaskType;
        status: IntelTaskStatus;
        priority?: string;
        deadline: string;
        periodStart?: string;
        returnReason?: string;
        commodity?: string;
        collectionPointId?: string;
        collectionPoint?: {
            id: string;
            name: string;
            type?: string;
            commodities?: string[];
            allocations?: Array<{ userId: string; commodity?: string }>;
        };
        template?: {
            name: string;
        };
        metadata?: {
            collectionPointName?: string;
            collectionPointId?: string;
            collectionPointType?: string;
            commodities?: string[];
        };
    };
    onExecute: (pointId: string, taskId: string, commodity?: string) => void;
    onNavigate?: (taskId: string) => void;
    compact?: boolean;
}

/**
 * 统一任务卡片组件
 * 支持 PENDING/RETURNED/OVERDUE 三种状态的差异化展示
 */
export const TaskCard: React.FC<TaskCardProps> = ({
    task,
    onExecute,
    onNavigate,
    compact = false,
}) => {
    const { token } = theme.useToken();

    // 判断是否超期（前端实时计算）
    const isOverdue = task.status === IntelTaskStatus.OVERDUE ||
        (task.status === IntelTaskStatus.PENDING && dayjs().isAfter(dayjs(task.deadline)));
    const isReturned = task.status === IntelTaskStatus.RETURNED;
    const isToday = dayjs(task.periodStart || task.deadline).isSame(dayjs(), 'day');
    const isHistorical = !isToday && task.status === IntelTaskStatus.PENDING;

    // 确定采集点信息
    const pointName = task.collectionPoint?.name || task.metadata?.collectionPointName;
    const pointId = task.collectionPointId || task.metadata?.collectionPointId;
    const pointType = task.collectionPoint?.type || task.metadata?.collectionPointType;

    // 确定显示的品种
    let displayCommodities: string[] = [];
    if (task.commodity) {
        displayCommodities = [task.commodity];
    } else if (task.collectionPoint?.allocations?.length) {
        const allocated = task.collectionPoint.allocations;
        const hasAllAccess = allocated.some((a) => !a.commodity);
        if (hasAllAccess) {
            displayCommodities = task.collectionPoint?.commodities || [];
        } else {
            displayCommodities = allocated.map((a) => a.commodity).filter(Boolean) as string[];
        }
    } else {
        displayCommodities = task.collectionPoint?.commodities || task.metadata?.commodities || [];
    }

    // 标题处理
    const displayTitle = (task.type === IntelTaskType.COLLECTION && pointName)
        ? pointName
        : task.template?.name || task.title;

    // 样式配置
    const getCardStyle = () => {
        if (isReturned) {
            return {
                border: `2px solid ${token.colorError}`,
                background: token.colorErrorBg,
            };
        }
        if (isOverdue) {
            return {
                border: `2px solid ${token.colorWarning}`,
                background: token.colorWarningBg,
            };
        }
        if (isHistorical) {
            return {
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillTertiary,
            };
        }
        return {};
    };

    // Badge 配置
    const getBadgeConfig = () => {
        if (isReturned) {
            return { text: '已驳回', color: token.colorError };
        }
        if (isOverdue) {
            return { text: '已超期', color: token.colorWarning };
        }
        if (isHistorical) {
            return { text: '历史待办', color: token.colorTextSecondary };
        }
        return { text: '待办', color: token.colorPrimary };
    };

    // 按钮配置
    const getButtonConfig = () => {
        if (isReturned) {
            return { text: '修改重报', danger: true, type: 'primary' as const };
        }
        if (isOverdue) {
            return { text: '立即补报', danger: false, type: 'primary' as const };
        }
        return { text: '立即执行', danger: false, type: 'primary' as const };
    };

    // 计算超期时长
    const getOverdueDuration = () => {
        if (!isOverdue) return null;
        const deadline = dayjs(task.deadline);
        const now = dayjs();
        const hours = now.diff(deadline, 'hour');
        if (hours < 24) {
            return `超期 ${hours} 小时`;
        }
        const days = now.diff(deadline, 'day');
        return `超期 ${days} 天`;
    };

    const badgeConfig = getBadgeConfig();
    const buttonConfig = getButtonConfig();
    const overdueDuration = getOverdueDuration();

    const handleClick = () => {
        if (pointId) {
            onExecute(pointId, task.id, task.commodity);
        } else if (onNavigate) {
            onNavigate(task.id);
        }
    };

    return (
        <Badge.Ribbon text={badgeConfig.text} color={badgeConfig.color}>
            <Card
                hoverable
                size="small"
                style={{ ...getCardStyle(), height: '100%' }}
                bodyStyle={{ padding: compact ? 12 : 16, display: 'flex', flexDirection: 'column', height: '100%' }}
            >
                {/* 标题区 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                    {pointType && POINT_TYPE_ICONS[pointType] ? (
                        <span style={{ fontSize: 18 }}>{POINT_TYPE_ICONS[pointType]}</span>
                    ) : (
                        <FileTextOutlined style={{ fontSize: 16, color: token.colorTextSecondary }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong ellipsis style={{ fontSize: 15, display: 'block' }}>
                            {displayTitle}
                        </Text>
                        {task.template?.name && pointName && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {task.template.name}
                            </Text>
                        )}
                    </div>
                    <Tag>{INTEL_TASK_TYPE_LABELS[task.type as IntelTaskType]}</Tag>
                </div>

                {/* 品种标签 */}
                {displayCommodities.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                        {displayCommodities.slice(0, 3).map((c) => (
                            <Tag key={c} color="blue" bordered={false} style={{ marginRight: 4 }}>
                                {c}
                            </Tag>
                        ))}
                        {displayCommodities.length > 3 && (
                            <Tag bordered={false}>+{displayCommodities.length - 3}</Tag>
                        )}
                    </div>
                )}

                {/* 状态信息区 */}
                <div style={{ flex: 1 }}>
                    {/* 截止时间 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: isOverdue ? token.colorError : token.colorTextSecondary,
                        fontSize: 13,
                        marginBottom: 4,
                    }}>
                        <ClockCircleOutlined />
                        <span>截止: {dayjs(task.deadline).format('MM-DD HH:mm')}</span>
                        {overdueDuration && (
                            <Tag color="error" style={{ marginLeft: 4 }}>{overdueDuration}</Tag>
                        )}
                    </div>

                    {/* 历史任务日期提示 */}
                    {isHistorical && task.periodStart && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: token.colorTextSecondary,
                            fontSize: 12,
                            marginBottom: 4,
                        }}>
                            <WarningOutlined />
                            <span>原定日期: {dayjs(task.periodStart).format('MM-DD')}</span>
                        </div>
                    )}

                    {/* 驳回原因 */}
                    {isReturned && task.returnReason && (
                        <Tooltip title={task.returnReason}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                color: token.colorError,
                                fontSize: 12,
                                marginBottom: 4,
                            }}>
                                <ExclamationCircleOutlined />
                                <Text type="danger" ellipsis style={{ flex: 1 }}>
                                    驳回原因: {task.returnReason}
                                </Text>
                            </div>
                        </Tooltip>
                    )}
                </div>

                {/* 操作按钮 */}
                <Button
                    type={buttonConfig.type}
                    danger={buttonConfig.danger}
                    block
                    style={{ marginTop: 8 }}
                    onClick={handleClick}
                >
                    {buttonConfig.text}
                </Button>
            </Card>
        </Badge.Ribbon>
    );
};

export default TaskCard;

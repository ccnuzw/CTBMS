import React from 'react';
import { Alert, Tag, Space, theme, Steps } from 'antd';
import {
    EditOutlined,
    CheckCircleOutlined,
    SendOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { IntelTaskStatus } from '@packages/types';
import dayjs from 'dayjs';

export interface TaskContextBannerProps {
    task?: {
        id: string;
        title: string;
        status: IntelTaskStatus;
        deadline: string;
        returnReason?: string;
        template?: {
            name: string;
        };
        collectionPoint?: {
            name: string;
        };
    };
    entriesCount: number;
    isSubmitted: boolean;
}

/**
 * 任务上下文横幅
 * 在填报页面顶部显示当前任务状态和进度
 */
export const TaskContextBanner: React.FC<TaskContextBannerProps> = ({
    task,
    entriesCount,
    isSubmitted,
}) => {
    const { token } = theme.useToken();

    if (!task) {
        // 日常填报模式，不显示横幅
        return null;
    }

    const isReturned = task.status === IntelTaskStatus.RETURNED;
    const isOverdue = task.status === IntelTaskStatus.OVERDUE ||
        dayjs().isAfter(dayjs(task.deadline));

    // 确定Alert类型和样式
    const getAlertConfig = () => {
        if (isReturned) {
            return {
                type: 'error' as const,
                icon: <ExclamationCircleOutlined />,
                message: (
                    <Space>
                        <span style={{ fontWeight: 600 }}>此任务已被驳回</span>
                        <Tag color="error">需要修改</Tag>
                    </Space>
                ),
                description: task.returnReason ? (
                    <div style={{ marginTop: 4 }}>
                        <span style={{ color: token.colorError }}>驳回原因：</span>
                        {task.returnReason}
                    </div>
                ) : (
                    <span>请根据审核意见修改数据后重新提交</span>
                ),
            };
        }
        if (isOverdue) {
            return {
                type: 'warning' as const,
                icon: <WarningOutlined />,
                message: (
                    <Space>
                        <span style={{ fontWeight: 600 }}>任务已超期</span>
                        <Tag color="warning">请尽快完成</Tag>
                    </Space>
                ),
                description: `原定截止时间：${dayjs(task.deadline).format('YYYY-MM-DD HH:mm')}`,
            };
        }
        return {
            type: 'info' as const,
            icon: <ClockCircleOutlined />,
            message: (
                <Space>
                    <span>正在执行任务</span>
                    <Tag color="processing">{task.template?.name || task.title}</Tag>
                </Space>
            ),
            description: `截止时间：${dayjs(task.deadline).format('YYYY-MM-DD HH:mm')}`,
        };
    };

    const alertConfig = getAlertConfig();

    // 进度步骤
    const getCurrentStep = () => {
        if (isSubmitted) return 2;
        if (entriesCount > 0) return 1;
        return 0;
    };

    return (
        <div style={{ marginBottom: 16 }}>
            <Alert
                type={alertConfig.type}
                icon={alertConfig.icon}
                message={alertConfig.message}
                description={alertConfig.description}
                showIcon
                banner
                style={{
                    borderRadius: token.borderRadiusLG,
                    marginBottom: 12,
                }}
            />

            {/* 进度指示器 */}
            <div style={{
                background: token.colorFillQuaternary,
                borderRadius: token.borderRadiusLG,
                padding: '12px 16px',
            }}>
                <Steps
                    size="small"
                    current={getCurrentStep()}
                    items={[
                        {
                            title: '填写数据',
                            icon: <EditOutlined />,
                            description: '录入价格信息',
                        },
                        {
                            title: '已添加',
                            icon: <CheckCircleOutlined />,
                            description: entriesCount > 0 ? `${entriesCount} 条数据` : '待添加',
                        },
                        {
                            title: isSubmitted ? '已提交' : '提交审核',
                            icon: <SendOutlined />,
                            description: isSubmitted ? '等待审核' : isReturned ? '重新提交' : '待提交',
                        },
                    ]}
                />
            </div>
        </div>
    );
};

export default TaskContextBanner;

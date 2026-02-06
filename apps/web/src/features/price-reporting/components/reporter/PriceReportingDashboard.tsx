import React from 'react';
import { Card, List, Button, Tag, Typography, Spin, Empty, Progress, Divider, Badge, Alert, theme, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  EnvironmentOutlined,
  RightOutlined,
  FireOutlined,
  CalendarOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useMyAssignedPoints, useSubmissionStatistics } from '../../api/hooks';
import { useMyTasks } from '../../../market-intel/api/tasks';
import { useVirtualUser } from '@/features/auth/virtual-user';
import { useDictionary } from '@/hooks/useDictionaries';
import { IntelTaskStatus, IntelTaskType, INTEL_TASK_TYPE_LABELS } from '@packages/types';
import dayjs from 'dayjs';
import styles from './PriceReportingDashboard.module.css';

const { Text, Title } = Typography;

const POINT_TYPE_ICONS: Record<string, string> = {
  PORT: '⚓',
  ENTERPRISE: '🏭',
  STATION: '🚂',
  MARKET: '🏪',
  REGION: '📍',
};

export const PriceReportingDashboard: React.FC = () => {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];
  const { currentUser } = useVirtualUser();
  const { token } = theme.useToken();

  const { data: assignedPoints, isLoading: loadingPoints } = useMyAssignedPoints(today, currentUser?.id);
  const { data: myTasks, isLoading: loadingTasks } = useMyTasks(currentUser?.id || '');
  const { data: stats } = useSubmissionStatistics(currentUser?.id);
  
  // 预加载关键字典数据，确保进入填报页面时字典已可用
  useDictionary('PRICE_SUB_TYPE');
  useDictionary('COMMODITY');

  // Filter tasks
  const pendingTasks = myTasks?.filter(t => t.status === IntelTaskStatus.PENDING || t.status === IntelTaskStatus.RETURNED) || [];
  const returnedTasks = myTasks?.filter(t => t.status === IntelTaskStatus.RETURNED) || [];

  // Combine points with tasks if possible, or treat them separately.
  // The plan says: "Section 1: My Tasks (Priority) - List active tasks. Section 2: My Points (Routine)"

  // Calculate total tasks (completed + pending)
  const todayTotal = (stats?.todayCompleted || 0) + (stats?.todayPending || 0);
  const completionRate = todayTotal > 0 ? Math.round(((stats?.todayCompleted || 0) / todayTotal) * 100) : 0;
  const safeRate = isNaN(completionRate) ? 0 : completionRate;

  const dashboardVars = {
    '--pr-primary': token.colorPrimary,
    '--pr-primary-bg': token.colorPrimaryBg,
    '--pr-info-bg': token.colorInfoBg,
    '--pr-success': token.colorSuccess,
    '--pr-success-bg': token.colorSuccessBg,
    '--pr-warning': token.colorWarning,
    '--pr-warning-bg': token.colorWarningBg,
    '--pr-error': token.colorError,
    '--pr-error-bg': token.colorErrorBg,
    '--pr-text': token.colorText,
    '--pr-text-secondary': token.colorTextSecondary,
    '--pr-border': token.colorBorder,
    '--pr-border-secondary': token.colorBorderSecondary,
    '--pr-bg-layout': token.colorBgLayout,
    '--pr-bg-container': token.colorBgContainer,
    '--pr-fill-secondary': token.colorFillSecondary,
    '--pr-fill-tertiary': token.colorFillTertiary,
    '--pr-shadow': token.boxShadowSecondary,
    '--pr-shadow-2': token.boxShadow,
  } as React.CSSProperties;

  const handleReport = (pointId: string, taskId?: string, commodity?: string) => {
    const params = new URLSearchParams();
    if (taskId) params.set('taskId', taskId);
    if (commodity) params.set('commodity', commodity);
    navigate(`/price-reporting/submit/${pointId}?${params.toString()}`);
  };

  const handleViewSubmission = (submissionId: string) => {
    navigate(`/price-reporting/submissions/${submissionId}`);
  };

  const renderTaskCard = (task: any) => {
    // Determine the effective point name and ID
    // Backend might return it in top-level `collectionPoint` object or `metadata` json field
    const pointName = task.collectionPoint?.name || task.metadata?.collectionPointName;
    const pointId = task.collectionPointId || task.metadata?.collectionPointId;
    const pointType = task.collectionPoint?.type || task.metadata?.collectionPointType;

    // Logic to determine which commodities to show for YOU
    let displayCommodities: string[] = [];

    // 0. Specific Commodity Task (Granular)
    if ((task as any).commodity) {
      displayCommodities = [(task as any).commodity];
    }
    // 1. Try to use allocations (Targeted Assignment)
    else if (task.collectionPoint?.allocations && task.collectionPoint.allocations.length > 0) {
      const allocated = task.collectionPoint.allocations;
      const hasAllAccess = allocated.some((a: any) => !a.commodity); // If any allocation is null, it means ALL

      if (hasAllAccess) {
        displayCommodities = task.collectionPoint?.commodities || [];
      } else {
        displayCommodities = allocated
          .map((a: any) => a.commodity)
          .filter((c: any) => !!c);
      }
    }
    // 2. Fallback to point defaults (Generic Assignment)
    else {
      displayCommodities = task.collectionPoint?.commodities || task.metadata?.commodities || [];
    }

    // Use point name as title if this is a price collection task, otherwise generic title
    const displayTitle = (task.type === IntelTaskType.PRICE_COLLECTION && pointName) ? pointName : task.title;
    const displaySubtitle = (task.type === IntelTaskType.PRICE_COLLECTION && pointName) ? task.title : null;

    return (
      <List.Item>
        <Badge.Ribbon
          text={task.status === IntelTaskStatus.RETURNED ? "已驳回" : "待办"}
          color={task.status === IntelTaskStatus.RETURNED ? token.colorError : token.colorPrimary}
        >
          <Card
            hoverable
            size="small"
            className={styles.taskCard}
            title={
              <div className={styles.taskTitle}>
                {pointType && POINT_TYPE_ICONS[pointType] ? <span style={{ marginRight: 8, fontSize: 16 }}>{POINT_TYPE_ICONS[pointType]}</span> : <FileTextOutlined style={{ marginRight: 8 }} />}
                <span style={{ fontWeight: pointName ? 'bold' : 'normal', fontSize: 15 }}>{displayTitle}</span>
              </div>
            }
            extra={<Tag>{INTEL_TASK_TYPE_LABELS[task.type as IntelTaskType]}</Tag>}
          >
            {displaySubtitle && (
              <div style={{ marginBottom: 8, color: token.colorTextSecondary, fontSize: 12 }}>
                {displaySubtitle}
              </div>
            )}

            {/* Commodities Tags */}
            {displayCommodities && displayCommodities.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {displayCommodities.map((c: string) => (
                  <Tag key={c} color="blue" bordered={false} style={{ marginRight: 4 }}>{c}</Tag>
                ))}
              </div>
            )}

            <div className={styles.taskMeta}>
              <ClockCircleOutlined />
              <span>截止: {dayjs(task.deadline).format('MM-DD HH:mm')}</span>
            </div>

            {/* Show point tag only if we didn't promote it to title */}
            {!pointName && task.collectionPoint && (
              <div className={styles.taskTags}>
                <Tag icon={<EnvironmentOutlined />}>{task.collectionPoint.name}</Tag>
              </div>
            )}

            {task.description && <div className={styles.taskDescription}>{task.description}</div>}

            <Button
              type="primary"
              danger={task.status === IntelTaskStatus.RETURNED}
              block
              className={styles.taskButton}
              onClick={() => {
                if (pointId) {
                  handleReport(pointId, task.id, (task as any).commodity);
                } else {
                  // Generic task handling (not point-based)
                  // For now, if no point ID but it's price collection, we might have a problem.
                  // But usually Price Collection tasks MUST have a point ID.
                  navigate(`/market-intel/tasks/${task.id}`);
                }
              }}
            >
              {task.status === IntelTaskStatus.RETURNED ? "修改重报" : "立即执行"}
            </Button>
          </Card>
        </Badge.Ribbon>
      </List.Item>
    );
  };

  return (
    <div className={styles.dashboard} style={dashboardVars}>
      {/* 顶部概览 */}
      <div className={styles.heroCompact}>
        <div className={styles.heroMain}>
          <div className={styles.heroTitleRow}>
            <Title level={5} className={styles.heroTitle}>填报工作台</Title>
            <span className={styles.heroSubtitle}>今日 {dayjs().format('YYYY-MM-DD')}</span>
          </div>
          <div className={styles.heroProgressRow}>
            <div className={styles.heroProgressLabel}>
              <CheckCircleOutlined />
              <span>今日完成</span>
              <strong>{safeRate}%</strong>
            </div>
            <Progress
              percent={safeRate}
              size="small"
              showInfo={false}
              strokeColor={safeRate === 100 ? token.colorSuccess : token.colorPrimary}
            />
          </div>
        </div>
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>
              <FireOutlined />
              <span>待办</span>
            </div>
            <div className={styles.statValue}>
              {pendingTasks.length}
              <span>个</span>
            </div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>
              <CheckCircleOutlined />
              <span>本周</span>
            </div>
            <div className={styles.statValue}>{stats?.weekCompleted || 0}</div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>
              <CalendarOutlined />
              <span>本月</span>
            </div>
            <div className={styles.statValue}>{stats?.monthCompleted || 0}</div>
          </div>
        </div>
      </div>

      {/* 🚨 被驳回的任务 (Warning) */}
      {returnedTasks.length > 0 && (
        <Alert
          message="您有被驳回的任务需要处理"
          description="请查看待办列表中的红色标记任务，根据反馈进行修改并重新提交。"
          type="error"
          showIcon
          className={styles.alertBlock}
        />
      )}

      {/* 📋 任务列表 (Priority) */}
      <Card
        title={(
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <FireOutlined />
              <span>我的任务 (Priority)</span>
            </div>
            <div className={styles.sectionMeta}>
              <Tag color="processing">待办 {pendingTasks.length}</Tag>
              {returnedTasks.length > 0 && <Tag color="error">驳回 {returnedTasks.length}</Tag>}
            </div>
          </div>
        )}
        className={styles.sectionCard}
      >
        {loadingTasks ? <Spin /> : pendingTasks.length === 0 ? <Empty description="暂无待办任务" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
          <List
            grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }}
            dataSource={pendingTasks}
            renderItem={renderTaskCard}
            className={styles.taskList}
          />
        )}
      </Card>

      {/* 📍 常态采集点 (Routine) */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <EnvironmentOutlined />
              <span>日常采集点维护 (Routine)</span>
            </div>
            <div className={styles.sectionMeta}>
              <Tag>{assignedPoints?.length || 0}</Tag>
            </div>
          </div>
        }
        extra={
          <Space>
            <Button
              type="primary"
              ghost
              icon={<TableOutlined />}
              onClick={() => navigate('/price-reporting/bulk')}
            >
              批量填报
            </Button>
            <Button type="link" className={styles.manageLink} onClick={() => navigate('/price-reporting/my-points')}>
              管理全部 <RightOutlined />
            </Button>
          </Space>
        }
        className={styles.sectionCard}
      >
        {loadingPoints ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : !assignedPoints?.length ? (
          <Empty description="暂无分配的采集点" />
        ) : (
          <List
            grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }}
            dataSource={assignedPoints}
            className={styles.pointsList}
            renderItem={(item: any) => (
              <List.Item>
                <Card hoverable className={styles.pointCard}>
                  <div className={styles.pointHeader}>
                    <div className={styles.pointIcon}>{POINT_TYPE_ICONS[item.collectionPoint?.type] || '📍'}</div>
                    <div>
                      <div className={styles.pointName}>
                        {item.collectionPoint?.name}
                        {item.commodity && <span style={{ fontSize: '0.9em', fontWeight: 'normal', marginLeft: 6, color: token.colorTextSecondary }}>[{item.commodity}]</span>}
                      </div>
                      <div className={styles.pointMeta}>
                        <Tag color={item.commodity ? 'blue' : 'default'}>{item.commodity || '综合'}</Tag>
                        {item.todayReported && <Tag color="success">今日已报</Tag>}
                      </div>
                    </div>
                    <div className={styles.pointStatus}>
                      {item.todayReported ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                      <span>{item.todayReported ? '已完成' : '待填报'}</span>
                    </div>
                  </div>
                  <Divider className={styles.pointDivider} />
                  <div className={styles.pointActions}>
                    <Text type="secondary">今日 {dayjs().format('MM-DD')}</Text>
                    {item.todayReported ? (
                      <Button type="link" onClick={() => handleViewSubmission(item.submissionId)}>
                        查看已报
                      </Button>
                    ) : (
                      <Button type="primary" onClick={() => handleReport(item.collectionPointId, undefined, item.commodity)}>
                        日常填报
                      </Button>
                    )}
                  </div>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default PriceReportingDashboard;

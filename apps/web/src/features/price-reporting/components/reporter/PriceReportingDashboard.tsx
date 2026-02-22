import React from 'react';
import { Card, List, Button, Tag, Typography, Spin, Empty, Progress, Divider, Alert, theme, Space, Statistic, Row, Col, Collapse } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  RightOutlined,
  FireOutlined,
  CalendarOutlined,
  TableOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  EditOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useMyAssignedPoints, useSubmissionStatistics } from '../../api/hooks';
import { useMyTasks } from '../../../market-intel/api/tasks';
import { useMyReports, KnowledgeItem } from '@/features/market-intel/api/knowledge-hooks';
import { useVirtualUser } from '@/features/auth/virtual-user';
import { useDictionary } from '@/hooks/useDictionaries';
import { IntelTaskStatus, IntelTaskType } from '@packages/types';
import dayjs from 'dayjs';
import styles from './PriceReportingDashboard.module.css';
import { TaskCard } from './TaskCard';

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
  const { data: myReports, isLoading: loadingReports } = useMyReports(currentUser?.id);

  // 预加载关键字典数据
  useDictionary('PRICE_SUB_TYPE');
  useDictionary('COMMODITY');

  // 任务分类
  const allPendingTasks = myTasks?.filter(t =>
    t.status === IntelTaskStatus.PENDING ||
    t.status === IntelTaskStatus.RETURNED ||
    t.status === IntelTaskStatus.OVERDUE
  ) || [];

  // 紧急任务：驳回 + 超期
  const returnedTasks = allPendingTasks.filter(t => t.status === IntelTaskStatus.RETURNED);
  const overdueTasks = allPendingTasks.filter(t => {
    if (t.status === IntelTaskStatus.OVERDUE) return true;
    // 前端实时判断超期
    return t.status === IntelTaskStatus.PENDING && dayjs().isAfter(dayjs(t.deadline));
  });
  const urgentTasks = [...returnedTasks, ...overdueTasks.filter(t => t.status !== IntelTaskStatus.RETURNED)];

  // 今日待办：PENDING且未超期且是今天的任务
  const todayTasks = allPendingTasks.filter(t => {
    if (t.status === IntelTaskStatus.RETURNED) return false;
    if (dayjs().isAfter(dayjs(t.deadline))) return false; // 超期的不在这里显示
    const taskDate = t.periodStart || t.deadline;
    return dayjs(taskDate).isSame(dayjs(), 'day');
  });

  // 历史待办：PENDING但不是今天的任务（且未超期）
  const historicalTasks = allPendingTasks.filter(t => {
    if (t.status === IntelTaskStatus.RETURNED) return false;
    if (dayjs().isAfter(dayjs(t.deadline))) return false;
    const taskDate = t.periodStart || t.deadline;
    return !dayjs(taskDate).isSame(dayjs(), 'day');
  });

  // 统计
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
    navigate(`/workstation/submit/${pointId}?${params.toString()}`);
  };

  const handleViewSubmission = (submissionId: string) => {
    navigate(`/workstation/submissions/${submissionId}`);
  };

  const handleNavigateTask = (taskId: string) => {
    // 查找任务，如果是 REPORT 类型则跳转到报告填写页面
    const allTasks = allPendingTasks || [];
    const task = allTasks.find((t) => t.id === taskId);
    if (task && task.type === IntelTaskType.REPORT) {
      // 根据 periodKey 格式推断报告类型，默认 daily
      let reportType = 'daily';
      const pk = task.periodKey || '';
      if (pk.includes('_W')) reportType = 'weekly';
      else if (/^\d{4}-\d{2}$/.test(pk)) reportType = 'monthly';
      navigate(`/intel/knowledge/reports/create?knowledgeType=${reportType.toUpperCase()}&taskId=${taskId}`);
      return;
    }
    navigate(`/market-intel/tasks/${taskId}`);
  };

  return (
    <div className={styles.dashboard} style={dashboardVars}>
      {/* 顶部概览统计 */}
      <div className={styles.heroCompact}>
        <div className={styles.heroMain}>
          <div className={styles.heroTitleRow}>
            <Title level={5} className={styles.heroTitle}>我的工作台</Title>
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
              {todayTasks.length}
              <span>个</span>
            </div>
          </div>
          <div className={styles.statItem} style={{ color: returnedTasks.length > 0 ? token.colorError : undefined }}>
            <div className={styles.statLabel}>
              <ExclamationCircleOutlined />
              <span>驳回</span>
            </div>
            <div className={styles.statValue}>{returnedTasks.length}</div>
          </div>
          <div className={styles.statItem} style={{ color: overdueTasks.length > 0 ? token.colorWarning : undefined }}>
            <div className={styles.statLabel}>
              <WarningOutlined />
              <span>超期</span>
            </div>
            <div className={styles.statValue}>{overdueTasks.length}</div>
          </div>
          <div className={styles.statItem}>
            <div className={styles.statLabel}>
              <CalendarOutlined />
              <span>本周</span>
            </div>
            <div className={styles.statValue}>{stats?.weekCompleted || 0}</div>
          </div>
        </div>
      </div>

      {/* 🚨 紧急区：驳回 + 超期 */}
      {urgentTasks.length > 0 && (
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ExclamationCircleOutlined style={{ color: token.colorError }} />
              <span style={{ color: token.colorError, fontWeight: 600 }}>需要紧急处理</span>
              <Tag color="error">{returnedTasks.length} 驳回</Tag>
              {overdueTasks.length > 0 && <Tag color="warning">{overdueTasks.length} 超期</Tag>}
            </div>
          }
          className={styles.sectionCard}
          style={{
            borderColor: token.colorError,
            background: `linear-gradient(to bottom, ${token.colorErrorBg}, ${token.colorBgContainer})`,
          }}
        >
          {loadingTasks ? <Spin /> : (
            <List
              grid={{ gutter: 16, xs: 1, sm: 2, md: 2, lg: 3 }}
              dataSource={urgentTasks}
              renderItem={(task) => (
                <List.Item>
                  <TaskCard
                    task={task as any}
                    onExecute={handleReport}
                    onNavigate={handleNavigateTask}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}

      {/* 📋 今日待办任务 */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <FireOutlined />
              <span>今日待办任务</span>
            </div>
            <div className={styles.sectionMeta}>
              <Tag color="processing">待办 {todayTasks.length}</Tag>
            </div>
          </div>
        }
        className={styles.sectionCard}
      >
        {loadingTasks ? <Spin /> : todayTasks.length === 0 ? (
          <Empty
            description={
              <Space direction="vertical" align="center">
                <CheckCircleOutlined style={{ fontSize: 32, color: token.colorSuccess }} />
                <Text type="success">今日任务已完成</Text>
              </Space>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <List
            grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }}
            dataSource={todayTasks}
            renderItem={(task) => (
              <List.Item>
                <TaskCard
                  task={task as any}
                  onExecute={handleReport}
                  onNavigate={handleNavigateTask}
                />
              </List.Item>
            )}
            className={styles.taskList}
          />
        )}
      </Card>

      {/* 📅 历史未完成任务 */}
      {historicalTasks.length > 0 && (
        <Collapse
          ghost
          items={[{
            key: 'historical',
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClockCircleOutlined style={{ color: token.colorTextSecondary }} />
                <Text type="secondary">历史未完成任务</Text>
                <Tag>{historicalTasks.length}</Tag>
              </div>
            ),
            children: (
              <List
                grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 4 }}
                dataSource={historicalTasks}
                renderItem={(task) => (
                  <List.Item>
                    <TaskCard
                      task={task as any}
                      onExecute={handleReport}
                      onNavigate={handleNavigateTask}
                      compact
                    />
                  </List.Item>
                )}
              />
            ),
          }]}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ✏️ 报告填写快捷入口 */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <EditOutlined />
              <span>报告填写</span>
            </div>
          </div>
        }
        className={styles.sectionCard}
      >
        <Space size="middle" wrap>
          <Button
            type="primary"
            ghost
            onClick={() => navigate('/intel/knowledge/reports/create?knowledgeType=DAILY')}
          >
            📋 撰写日报
          </Button>
          <Button
            type="primary"
            ghost
            onClick={() => navigate('/intel/knowledge/reports/create?knowledgeType=WEEKLY')}
          >
            📊 撰写周报
          </Button>
          <Button
            type="primary"
            ghost
            onClick={() => navigate('/intel/knowledge/reports/create?knowledgeType=MONTHLY')}
          >
            📑 撰写月报
          </Button>
        </Space>
      </Card>

      <Card
        title={
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <FileTextOutlined />
              <span>我的报告</span>
            </div>
          </div>
        }
        className={styles.sectionCard}
        style={{ marginBottom: 16 }}
      >
        <List
          loading={loadingReports}
          dataSource={myReports?.data || []}
          renderItem={(item) => (
            <List.Item
              key={item.id}
              actions={[
                item.status === 'PUBLISHED' || item.status === 'APPROVED' ? (
                  <Button type="link" size="small" onClick={() => navigate(`/intel/knowledge/items/${item.id}`)}>
                    查看
                  </Button>
                ) : (
                  <Button type="link" size="small" onClick={() => navigate(`/intel/knowledge/reports/create?knowledgeType=${(item.type || item.periodType || 'DAILY').toUpperCase()}&reportId=${item.id}`)}>
                    编辑
                  </Button>
                ),
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Tag color={
                      item.type === 'DAILY' ? 'blue' :
                        item.type === 'WEEKLY' ? 'cyan' :
                          item.type === 'MONTHLY' ? 'purple' : 'default'
                    }>
                      {item.type === 'DAILY' ? '日报' :
                        item.type === 'WEEKLY' ? '周报' :
                          item.type === 'MONTHLY' ? '月报' : item.type}
                    </Tag>
                    <span>{item.title}</span>
                  </Space>
                }
                description={
                  <Space split={<Divider type="vertical" />}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(item.publishAt).format('YYYY-MM-DD HH:mm')}
                    </Text>
                    <Tag bordered={false} color={
                      item.status === 'PENDING_REVIEW' ? 'processing' :
                        item.status === 'PUBLISHED' || item.status === 'APPROVED' ? 'success' :
                          item.status === 'REJECTED' ? 'error' : 'default'
                    }>
                      {item.status === 'PENDING_REVIEW' ? '待审核' :
                        item.status === 'PUBLISHED' || item.status === 'APPROVED' ? '已发布' :
                          item.status === 'REJECTED' ? '已驳回' : item.status}
                    </Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{ emptyText: '暂无历史报告' }}
        />
      </Card>

      {/* 📍 日常采集点维护 */}
      <Card
        title={
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <EnvironmentOutlined />
              <span>日常采集点维护</span>
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
              onClick={() => navigate('/workstation/bulk')}
            >
              批量填报
            </Button>
            <Button type="link" className={styles.manageLink} onClick={() => navigate('/workstation/my-points')}>
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
            renderItem={(item) => (
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
                        {item.hasPendingTask && !item.todayReported && (
                          <Tag color="processing">有任务</Tag>
                        )}
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
                    ) : item.hasPendingTask && item.pendingTask ? (
                      <Button
                        type="primary"
                        onClick={() => handleReport(item.collectionPointId, item.pendingTask.id, item.commodity)}
                      >
                        执行任务
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

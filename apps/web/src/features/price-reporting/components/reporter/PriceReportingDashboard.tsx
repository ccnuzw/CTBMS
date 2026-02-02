import React, { useState } from 'react';
import { Card, Row, Col, Statistic, List, Button, Tag, Space, Typography, Spin, Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  EnvironmentOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useMyAssignedPoints, useSubmissionStatistics } from '../../api/hooks';

const { Title, Text } = Typography;

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

  const { data: assignedPoints, isLoading: loadingPoints } = useMyAssignedPoints(today);
  const { data: stats, isLoading: loadingStats } = useSubmissionStatistics();

  const handleReport = (pointId: string, taskId?: string) => {
    const params = new URLSearchParams();
    if (taskId) params.set('taskId', taskId);
    navigate(`/price-reporting/submit/${pointId}?${params.toString()}`);
  };

  const handleViewSubmission = (submissionId: string) => {
    navigate(`/price-reporting/submissions/${submissionId}`);
  };

  return (
    <div style={{ padding: 24 }}>


      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title="今日待填报"
              value={stats?.todayPending || 0}
              suffix="个"
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title="本周已完成"
              value={stats?.weekCompleted || 0}
              suffix="条"
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title="待审核"
              value={stats?.pendingReview || 0}
              suffix="条"
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title="本月填报"
              value={stats?.monthCompleted || 0}
              suffix="条"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 我负责的采集点 */}
      <Card
        title={
          <Space>
            <EnvironmentOutlined />
            <span>我负责的采集点</span>
          </Space>
        }
        extra={
          <Button type="link" onClick={() => navigate('/price-reporting/my-points')}>
            查看全部 <RightOutlined />
          </Button>
        }
      >
        {loadingPoints ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : !assignedPoints?.length ? (
          <Empty description="暂无分配的采集点" />
        ) : (
          <List
            dataSource={assignedPoints}
            renderItem={(item: any) => (
              <List.Item
                actions={[
                  item.todayReported ? (
                    <Button
                      type="link"
                      onClick={() => handleViewSubmission(item.submissionId)}
                    >
                      查看
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => handleReport(item.collectionPointId, item.pendingTask?.id)}
                    >
                      {item.hasPendingTask ? '立即填报' : '填报'}
                    </Button>
                  ),
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <span style={{ fontSize: 24 }}>
                      {POINT_TYPE_ICONS[item.collectionPoint?.type] || '📍'}
                    </span>
                  }
                  title={
                    <Space>
                      <span>{item.collectionPoint?.name}</span>
                      {item.todayReported ? (
                        <Tag color="success">今日已报</Tag>
                      ) : item.hasPendingTask ? (
                        <Tag color="warning">待填报</Tag>
                      ) : (
                        <Tag>未填报</Tag>
                      )}
                    </Space>
                  }
                  description={
                    <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
                      <Text type="secondary">{item.collectionPoint?.commodities?.[0] || '玉米'}</Text>
                      {item.lastPrice && (
                        <Text type="secondary">
                          昨日 {item.lastPrice.toLocaleString()} 元/吨
                        </Text>
                      )}
                      {item.pendingTask && (
                        <Text type="warning">
                          截止 {new Date(item.pendingTask.deadline).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

export default PriceReportingDashboard;

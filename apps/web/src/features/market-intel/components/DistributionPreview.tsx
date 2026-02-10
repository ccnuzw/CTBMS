import React from 'react';
import { Modal, Table, Row, Col, Card, Tag, Alert, Typography, Button, Space, Statistic, Divider, theme } from 'antd';
import { DistributionPreviewResponse } from '@packages/types';
import {
  UserOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  PlayCircleOutlined,
  BankOutlined,
  ApartmentOutlined
} from '@ant-design/icons';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Text, Title } = Typography;

interface DistributionPreviewProps {
  open: boolean;
  onCancel: () => void;
  data: DistributionPreviewResponse | null;
  loading?: boolean;
  onExecute?: () => void;
  executing?: boolean;
}

export const DistributionPreview: React.FC<DistributionPreviewProps> = ({
  open,
  onCancel,
  data,
  loading,
  onExecute,
  executing
}) => {
  const { token } = theme.useToken();
  const { containerRef, focusRef, modalProps } = useModalAutoFocus();

  if (!data) return null;

  const columns = [
    {
      title: '业务员',
      dataIndex: 'userName',
      key: 'userName',
      render: (text: string) => (
        <Space>
          <UserOutlined />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: '所属部门/组织',
      key: 'org',
      render: (_: any, record: any) => (
        <Space direction="vertical" size={0}>
          {record.organizationName && (
            <Tag icon={<BankOutlined />} color="blue">{record.organizationName}</Tag>
          )}
          {record.departmentName && (
            <Tag icon={<ApartmentOutlined />} color="cyan">{record.departmentName}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '分配采集点',
      dataIndex: 'collectionPoints',
      key: 'collectionPoints',
      render: (points: any[]) => {
        if (!points || points.length === 0) return <Text type="secondary">-</Text>;
        // 如果数量太多，只显示前几个
        if (points.length > 3) {
          return (
            <div style={{ maxWidth: 300 }}>
              {points.slice(0, 3).map((p: any) => (
                <Tag key={p.id}>{p.name}</Tag>
              ))}
              <Tag>+{points.length - 3} ...</Tag>
            </div>
          );
        }
        return (
          <div style={{ maxWidth: 300 }}>
            {points.map((p: any) => (
              <Tag key={p.id}>{p.name}</Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: '任务数',
      dataIndex: 'taskCount',
      key: 'taskCount',
      width: 100,
      render: (count: number) => <Tag color="green">{count}</Tag>,
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>任务分发预览</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      width={800}
      focusTriggerAfterClose={false}
      footer={[
        <Button key="cancel" onClick={onCancel} ref={focusRef}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={onExecute}
          loading={executing}
        >
          确认执行 ({data.totalTasks}个任务)
        </Button>
      ]}
      {...modalProps}
    >
      <div ref={containerRef}>
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card bordered={false} style={{ background: token.colorSuccessBg, textAlign: 'center' }}>
              <Statistic
                title="将生成的任务总数"
                value={data.totalTasks}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: token.colorSuccess }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card bordered={false} style={{ background: token.colorInfoBg, textAlign: 'center' }}>
              <Statistic
                title="涉及业务员人数"
                value={data.totalAssignees}
                prefix={<UserOutlined />}
                valueStyle={{ color: token.colorInfo }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card bordered={false} style={{ background: token.colorWarningBg, textAlign: 'center' }}>
              <Statistic
                title="未分配采集点"
                value={data.unassignedPoints?.length || 0}
                prefix={<WarningOutlined />}
                valueStyle={{ color: token.colorWarning }}
              />
            </Card>
          </Col>
        </Row>

        {data.unassignedPoints && data.unassignedPoints.length > 0 && (
          <Alert
            message="注意：以下采集点未分配负责人，将不会生成任务"
            description={
              <div style={{ marginTop: 8, maxHeight: 100, overflow: 'auto' }}>
                {data.unassignedPoints.map(p => (
                  <Tag key={p.id} color="warning">{p.name}</Tag>
                ))}
              </div>
            }
            type="warning"
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Divider orientation="left">分发详情</Divider>

        <Table
          columns={columns}
          dataSource={data.assignees}
          rowKey="userId"
          pagination={{ pageSize: 5 }}
          size="small"
          scroll={{ y: 300 }}
        />
      </div>
    </Modal>
  );
};

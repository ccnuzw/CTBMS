import React, { useState } from 'react';
import { Tabs, Card, Typography, Space } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import TaskTemplateManager from '../../price-reporting/components/admin/TaskTemplateManager';
import { CollectionPointAllocationCenter } from './CollectionPointAllocationCenter';

const { Title, Paragraph } = Typography;

export const TaskAllocationWorkbench: React.FC = () => {
  const [activeTab, setActiveTab] = useState('templates');

  const items = [
    {
      key: 'templates',
      label: (
        <Space>
          <CalendarOutlined />
          <span>任务模板管理</span>
        </Space>
      ),
      children: <TaskTemplateManager />,
    },
    {
      key: 'matrix',
      label: (
        <Space>
          <AppstoreOutlined />
          <span>采集点分配中心</span>
        </Space>
      ),
      children: <CollectionPointAllocationCenter defaultMode="BY_USER" />,
    },
    // Future expansion: Overview dashboard
    /*
    {
      key: 'overview',
      label: (
        <Space>
          <DashboardOutlined />
          <span>分发概览</span>
        </Space>
      ),
      children: <div style={{ padding: 24, textAlign: 'center' }}>功能开发中...</div>,
    },
    */
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card bordered={false} bodyStyle={{ padding: 0 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={items}
          type="card"
          size="large"
          tabBarStyle={{ marginBottom: 0, paddingLeft: 16, paddingTop: 16 }}
        />
      </Card>
    </div>
  );
};

export default TaskAllocationWorkbench;

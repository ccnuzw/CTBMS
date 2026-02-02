import React, { useState } from 'react';
import { Alert, Card, Segmented, Space, Typography, Popover, Tag, App } from 'antd';
import {
  InfoCircleOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PieChartOutlined,
} from '@ant-design/icons';
import { useAllocationStatistics } from '../../price-reporting/api/hooks';
import { AllocationMatrix } from './AllocationMatrix';
import { PointAllocationManager } from '../../price-reporting/components/admin/PointAllocationManager';

type AllocationCenterMode = 'BY_USER' | 'POINT_COVERAGE';

interface CollectionPointAllocationCenterProps {
  defaultMode?: AllocationCenterMode;
}

const { Text } = Typography;

export const CollectionPointAllocationCenter: React.FC<CollectionPointAllocationCenterProps> = ({
  defaultMode = 'BY_USER',
}) => {
  const [mode, setMode] = useState<AllocationCenterMode>(defaultMode);
  const { data: stats } = useAllocationStatistics();

  return (
    <App>
      <div>
        <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            {/* Left Side: Controls */}
            <Space direction="vertical" size={8}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Space>
                  <Segmented
                    value={mode}
                    onChange={(value) => setMode(value as AllocationCenterMode)}
                    options={[
                      { label: '按员工分配', value: 'BY_USER' },
                      { label: '按采集点补齐', value: 'POINT_COVERAGE' },
                    ]}
                  />
                  <Popover
                    title="快速指引"
                    content={
                      <div style={{ maxWidth: 400 }}>
                        {mode === 'BY_USER'
                          ? '1) 选择组织/部门或搜索负责人；2) 选择采集点并分配；3) 预览确认后提交。'
                          : '1) 先筛选未分配采集点；2) 点击“管理分配”选择负责人；3) 逐步补齐空缺。'}
                      </div>
                    }
                  >
                    <Tag icon={<InfoCircleOutlined />} style={{ cursor: 'pointer', margin: 0 }}>
                      快速指引
                    </Tag>
                  </Popover>
                </Space>
              </div>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {mode === 'BY_USER'
                  ? '按组织/姓名筛选负责人，再分配采集点'
                  : '聚焦未分配采集点进行补齐，可先筛选采集点范围'}
              </Text>
            </Space>

            {/* Right Side: Compact Stats */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Total */}
              <div style={{
                background: '#f5f5f5',
                padding: '8px 16px',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 120
              }}>
                <span style={{ fontSize: 12, color: '#888' }}>采集点总数</span>
                <span style={{ fontSize: 20, fontWeight: 600 }}>
                  <EnvironmentOutlined style={{ marginRight: 6, fontSize: 16, color: '#888' }} />
                  {stats?.total || 0}
                </span>
              </div>

              {/* Allocated */}
              <div style={{
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                padding: '8px 16px',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 120
              }}>
                <span style={{ fontSize: 12, color: '#52c41a' }}>已分配</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#52c41a' }}>
                  <CheckCircleOutlined style={{ marginRight: 6, fontSize: 16 }} />
                  {stats?.allocated || 0}
                </span>
              </div>

              {/* Unallocated */}
              <div style={{
                background: '#fff1f0',
                border: '1px solid #ffa39e',
                padding: '8px 16px',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 120
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>未分配</Text>
                </div>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#ff4d4f' }}>
                  <ExclamationCircleOutlined style={{ marginRight: 6, fontSize: 16 }} />
                  {stats?.unallocated || 0}
                </span>
              </div>

              {/* Rate */}
              <div style={{
                background: '#f0f5ff',
                padding: '8px 16px',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 120
              }}>
                <span style={{ fontSize: 12, color: '#1890ff' }}>分配率</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#1890ff' }}>
                  <PieChartOutlined style={{ marginRight: 6, fontSize: 16 }} />
                  {stats?.total ? Math.round((stats.allocated / stats.total) * 100) : 0}%
                </span>
              </div>
            </div>
          </div >
        </Card >

        {mode === 'BY_USER' ? (
          <AllocationMatrix />
        ) : (
          <PointAllocationManager embedded defaultAllocationStatus="UNALLOCATED" />
        )}
      </div>
    </App>
  );
};

export default CollectionPointAllocationCenter;

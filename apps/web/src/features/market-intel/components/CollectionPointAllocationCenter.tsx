import React, { useState } from 'react';
import { Card, Segmented, Space, Typography, App, theme } from 'antd';
import {
  EnvironmentOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PieChartOutlined,
} from '@ant-design/icons';
import { useAllocationStatistics } from '../../price-reporting/api/hooks';
import { AllocationMatrix } from './AllocationMatrix';
import { PointAllocationManager } from '../../price-reporting/components/admin/PointAllocationManager';
import { AllocationConfigHelp } from './AllocationConfigHelp';

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
  const { token } = theme.useToken();

  return (
    <App>
      <div>
        <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            {/* Left Side: Controls */}
            <Space direction="vertical" size={8}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Space>
                  <Segmented
                    value={mode}
                    onChange={(value) => setMode(value as AllocationCenterMode)}
                    options={[
                      { label: '按员工分配', value: 'BY_USER' },
                      { label: '按采集点分配', value: 'POINT_COVERAGE' },
                    ]}
                  />
                  <AllocationConfigHelp />
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
              <div
                style={{
                  background: token.colorFillQuaternary,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  padding: '8px 16px',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 120,
                }}
              >
                <span style={{ fontSize: 12, color: token.colorTextSecondary }}>采集点总数</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: token.colorText }}>
                  <EnvironmentOutlined
                    style={{ marginRight: 6, fontSize: 16, color: token.colorTextSecondary }}
                  />
                  {stats?.total || 0}
                </span>
              </div>

              {/* Allocated */}
              <div
                style={{
                  background: token.colorSuccessBg,
                  border: `1px solid ${token.colorSuccessBorder}`,
                  padding: '8px 16px',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 120,
                }}
              >
                <span style={{ fontSize: 12, color: token.colorSuccess }}>已分配</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: token.colorSuccessText }}>
                  <CheckCircleOutlined style={{ marginRight: 6, fontSize: 16 }} />
                  {stats?.allocated || 0}
                </span>
              </div>

              {/* Unallocated */}
              <div
                style={{
                  background: token.colorErrorBg,
                  border: `1px solid ${token.colorErrorBorder}`,
                  padding: '8px 16px',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 120,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: token.colorError }}>未分配</Text>
                </div>
                <span style={{ fontSize: 20, fontWeight: 600, color: token.colorErrorText }}>
                  <ExclamationCircleOutlined style={{ marginRight: 6, fontSize: 16 }} />
                  {stats?.unallocated || 0}
                </span>
              </div>

              {/* Rate */}
              <div
                style={{
                  background: token.colorInfoBg,
                  border: `1px solid ${token.colorInfoBorder}`,
                  padding: '8px 16px',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 120,
                }}
              >
                <span style={{ fontSize: 12, color: token.colorInfo }}>分配率</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: token.colorInfoText }}>
                  <PieChartOutlined style={{ marginRight: 6, fontSize: 16 }} />
                  {stats?.total ? Math.round((stats.allocated / stats.total) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </Card>

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

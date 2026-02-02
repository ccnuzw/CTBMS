import React, { useState } from 'react';
import { Alert, Card, Segmented, Space, Typography, Popover, Tag } from 'antd';
import {
  InfoCircleOutlined,
} from '@ant-design/icons';
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

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 12 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <Text type="secondary">
            {mode === 'BY_USER'
              ? '按组织/姓名筛选负责人，再分配采集点'
              : '聚焦未分配采集点进行补齐，可先筛选采集点范围'}
          </Text>
        </Space>
      </Card>

      {mode === 'BY_USER' ? (
        <AllocationMatrix />
      ) : (
        <PointAllocationManager embedded defaultAllocationStatus="UNALLOCATED" />
      )}
    </div>
  );
};

export default CollectionPointAllocationCenter;

import React, { useState } from 'react';
import { Alert, Card, Segmented, Space, Typography, Popover, Tag, App, Modal, Divider } from 'antd';
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

const { Text, Title, Paragraph } = Typography;

export const CollectionPointAllocationCenter: React.FC<CollectionPointAllocationCenterProps> = ({
  defaultMode = 'BY_USER',
}) => {
  const [mode, setMode] = useState<AllocationCenterMode>(defaultMode);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
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
                      { label: '按采集点分配', value: 'POINT_COVERAGE' },
                    ]}
                  />
                  <Tag
                    icon={<InfoCircleOutlined />}
                    style={{ cursor: 'pointer', margin: 0 }}
                    onClick={() => setIsHelpModalOpen(true)}
                  >
                    配置说明
                  </Tag>
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

      <Modal
        title="采集任务分配配置说明"
        open={isHelpModalOpen}
        onCancel={() => setIsHelpModalOpen(false)}
        footer={null}
        width={600}
      >
        <Typography>
          <Title level={4}>1. 分配模式说明</Title>
          <Paragraph>
            系统提供两种视角的分配模式，以满足不同的管理需求：
          </Paragraph>
          <ul>
            <li>
              <Text strong>按员工分配</Text>：
              以“人”为核心。适用于为新员工分配任务，或调整某个负责人的管辖范围。您可以清晰地看到某个人负责了哪些点，并进行增减。
            </li>
            <li>
              <Text strong>按采集点分配</Text>：
              以“点”为核心。适用于排查遗漏（补齐）或区域性调整。您可以专注于哪些点还没有人管，快速指定负责人。
            </li>
          </ul>

          <Divider />

          <Title level={4}>2. 操作流程详细指引</Title>

          <Title level={5}>模式一：按员工分配</Title>
          <ol>
            <li><Text>定位员工</Text>：在左侧组织树中选择部门，或直接搜索员工姓名。</li>
            <li><Text>查看现状</Text>：选中员工后，右侧将显示其当前负责的所有采集点。</li>
            <li><Text>新增/调整</Text>：点击“分配采集点”按钮，在弹窗中勾选新的采集点进行添加；或在列表中移除不再负责的点。</li>
          </ol>

          <Title level={5}>模式二：按采集点分配</Title>
          <ol>
            <li><Text>筛选范围</Text>：使用顶部的筛选栏，可以只看“未分配”的采集点，也可以按区域查找。</li>
            <li><Text>批量指派</Text>：勾选列表中的一个或多个采集点，点击“变更负责人”或“分配”。</li>
            <li><Text>确认生效</Text>：选择目标负责人后提交，系统将立即更新归属关系。</li>
          </ol>

          <Divider />

          <Title level={4}>3. 常见问题</Title>
          <Paragraph>
            <ul>
              <li><Text>Q: 一个采集点可以有多个负责人吗？</Text><br />A: 通常情况下一个采集点建议归属唯一的负责人，具体取决于系统的业务规则配置。</li>
              <li><Text>Q: 分配后对方什么时候能看到？</Text><br />A: 分配操作是实时生效的，负责人刷新移动端或Web端即可看到新的任务。</li>
            </ul>
          </Paragraph>
        </Typography>
      </Modal>
    </App>
  );
};

export default CollectionPointAllocationCenter;

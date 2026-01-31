import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  message,
  Modal,
  Drawer,
  List,
  Avatar,
  Tooltip,
  Row,
  Col,
  Statistic,
  Badge,
  Divider,
  Empty,
  Spin,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  UserAddOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  useAllocations,
  useAllocationStatistics,
  useCreateAllocation,
  useDeleteAllocation,
  usePointAssignees,
} from '../../api/hooks';
import { useCollectionPoints } from '../../../market-intel/api/collection-point';
import { useUsers } from '../../../users/api/users';
import { CollectionPointType } from '@packages/types';

const { Text, Title } = Typography;

const POINT_TYPE_OPTIONS = [
  { value: 'PORT' as CollectionPointType, label: '港口', icon: '⚓' },
  { value: 'ENTERPRISE' as CollectionPointType, label: '企业', icon: '🏭' },
  { value: 'STATION' as CollectionPointType, label: '站台', icon: '🚂' },
  { value: 'MARKET' as CollectionPointType, label: '市场', icon: '🏪' },
  { value: 'REGION' as CollectionPointType, label: '区域', icon: '📍' },
];

const getPointTypeInfo = (type: string) => {
  return POINT_TYPE_OPTIONS.find((t) => t.value === type) || { label: type, icon: '📍' };
};

export const PointAllocationManager: React.FC = () => {
  // 查询状态
  const [pointQuery, setPointQuery] = useState<{
    page: number;
    pageSize: number;
    type?: CollectionPointType;
    keyword: string;
    isActive: boolean;
  }>({
    page: 1,
    pageSize: 15,
    type: undefined,
    keyword: '',
    isActive: true,
  });

  // 抽屉状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<any>(null);
  const [searchUserKeyword, setSearchUserKeyword] = useState('');

  // 数据查询
  const { data: pointsData, isLoading: loadingPoints } = useCollectionPoints(pointQuery);
  const { data: stats } = useAllocationStatistics();
  const { data: users, isLoading: loadingUsers } = useUsers({ status: 'ACTIVE' });
  const { data: allocations } = useAllocations({ page: 1, pageSize: 1000, isActive: true });

  // 当前选中采集点的分配列表
  const { data: pointAssignees, isLoading: loadingAssignees } = usePointAssignees(
    selectedPoint?.id || ''
  );

  const createAllocation = useCreateAllocation();
  const deleteAllocation = useDeleteAllocation();

  // 计算每个采集点的分配人数
  const allocationCountMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    allocations?.data?.forEach((a: any) => {
      map[a.collectionPointId] = (map[a.collectionPointId] || 0) + 1;
    });
    return map;
  }, [allocations]);

  // 过滤用户列表
  const filteredUsers = React.useMemo(() => {
    if (!users) return [];
    const assignedUserIds = new Set(pointAssignees?.map((a: any) => a.userId) || []);
    return users
      .filter((u: any) => !assignedUserIds.has(u.id))
      .filter(
        (u: any) =>
          !searchUserKeyword ||
          u.name?.toLowerCase().includes(searchUserKeyword.toLowerCase()) ||
          u.username?.toLowerCase().includes(searchUserKeyword.toLowerCase())
      );
  }, [users, pointAssignees, searchUserKeyword]);

  // 打开分配抽屉
  const handleOpenDrawer = (point: any) => {
    setSelectedPoint(point);
    setDrawerVisible(true);
    setSearchUserKeyword('');
  };

  // 分配人员 (简化版 - 无角色)
  const handleAssign = async (userId: string) => {
    if (!selectedPoint) return;
    try {
      await createAllocation.mutateAsync({
        userId,
        collectionPointId: selectedPoint.id,
      });
      message.success('分配成功');
    } catch (err: any) {
      message.error(err.response?.data?.message || '分配失败');
    }
  };

  // 取消分配
  const handleRemoveAssignment = (allocationId: string, userName: string) => {
    Modal.confirm({
      title: '确认取消分配？',
      content: `取消后 ${userName} 将无法填报此采集点`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteAllocation.mutateAsync(allocationId);
          message.success('已取消分配');
        } catch (err) {
          message.error('操作失败');
        }
      },
    });
  };

  // 表格列定义
  const columns = [
    {
      title: '采集点',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => {
        const typeInfo = getPointTypeInfo(record.type);
        return (
          <Space>
            <span style={{ fontSize: 18 }}>{typeInfo.icon}</span>
            <div>
              <div style={{ fontWeight: 500 }}>{name}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.code}
              </Text>
            </div>
          </Space>
        );
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => {
        const info = getPointTypeInfo(type);
        return <Tag>{info.label}</Tag>;
      },
    },
    {
      title: '区域',
      dataIndex: 'regionCode',
      key: 'regionCode',
      width: 120,
      render: (code: string) => code || '-',
    },
    {
      title: '分配状态',
      key: 'allocationStatus',
      width: 150,
      render: (_: any, record: any) => {
        const count = allocationCountMap[record.id] || 0;
        if (count === 0) {
          return (
            <Badge status="warning" text={<Text type="warning">未分配</Text>} />
          );
        }
        return (
          <Badge status="success" text={<Text type="success">{count} 人负责</Text>} />
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: any) => (
        <Button
          type="primary"
          size="small"
          icon={<TeamOutlined />}
          onClick={() => handleOpenDrawer(record)}
        >
          管理分配
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="采集点总数"
              value={stats?.total || 0}
              prefix={<EnvironmentOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="已分配"
              value={stats?.allocated || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="未分配"
              value={stats?.unallocated || 0}
              valueStyle={{ color: '#faad14' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="分配率"
              value={stats?.total ? Math.round((stats.allocated / stats.total) * 100) : 0}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      {/* 采集点列表 */}
      <Card
        title={
          <Space>
            <EnvironmentOutlined />
            <span>采集点分配管理</span>
          </Space>
        }
      >
        {/* 筛选栏 */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索采集点名称/编码"
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            value={pointQuery.keyword}
            onChange={(e) => setPointQuery({ ...pointQuery, keyword: e.target.value, page: 1 })}
            allowClear
          />
          <Select
            placeholder="采集点类型"
            style={{ width: 140 }}
            allowClear
            value={pointQuery.type}
            onChange={(v) => setPointQuery({ ...pointQuery, type: v, page: 1 })}
            options={POINT_TYPE_OPTIONS.map((t) => ({
              value: t.value,
              label: `${t.icon} ${t.label}`,
            }))}
          />
        </Space>

        <Table
          columns={columns}
          dataSource={pointsData?.data || []}
          rowKey="id"
          loading={loadingPoints}
          pagination={{
            current: pointQuery.page,
            pageSize: pointQuery.pageSize,
            total: pointsData?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个采集点`,
            onChange: (page, pageSize) => setPointQuery({ ...pointQuery, page, pageSize }),
          }}
        />
      </Card>

      {/* 分配管理抽屉 */}
      <Drawer
        title={
          selectedPoint && (
            <Space>
              <span style={{ fontSize: 20 }}>{getPointTypeInfo(selectedPoint.type).icon}</span>
              <span>{selectedPoint.name}</span>
              <Tag>{getPointTypeInfo(selectedPoint.type).label}</Tag>
            </Space>
          )
        }
        placement="right"
        width={480}
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedPoint(null);
        }}
      >
        {selectedPoint && (
          <div>
            {/* 当前负责人列表 */}
            <div style={{ marginBottom: 24 }}>
              <Title level={5}>
                <TeamOutlined style={{ marginRight: 8 }} />
                当前负责人 ({pointAssignees?.length || 0})
              </Title>

              {loadingAssignees ? (
                <Spin />
              ) : !pointAssignees?.length ? (
                <Empty description="暂无分配人员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <List
                  size="small"
                  dataSource={pointAssignees}
                  renderItem={(item: any) => (
                    <List.Item
                      actions={[
                        <Tooltip title="取消分配" key="delete">
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => handleRemoveAssignment(item.id, item.user?.name)}
                          />
                        </Tooltip>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} />}
                        title={
                          <Space>
                            <span>{item.user?.name}</span>
                            <Tag color="blue">负责人</Tag>
                          </Space>
                        }
                        description={item.user?.username}
                      />
                    </List.Item>
                  )}
                />
              )}
            </div>

            <Divider />

            {/* 添加人员 */}
            <div>
              <Title level={5}>
                <UserAddOutlined style={{ marginRight: 8 }} />
                添加负责人
              </Title>

              {/* 搜索用户 */}
              <Input
                placeholder="搜索员工姓名/用户名"
                prefix={<SearchOutlined />}
                style={{ marginBottom: 12 }}
                value={searchUserKeyword}
                onChange={(e) => setSearchUserKeyword(e.target.value)}
                allowClear
              />

              {/* 可分配用户列表 */}
              {loadingUsers ? (
                <Spin />
              ) : (
                <List
                  size="small"
                  style={{ maxHeight: 300, overflowY: 'auto' }}
                  dataSource={filteredUsers.slice(0, 20)}
                  locale={{ emptyText: searchUserKeyword ? '未找到匹配用户' : '所有用户已分配' }}
                  renderItem={(user: any) => (
                    <List.Item
                      actions={[
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => handleAssign(user.id)}
                          loading={createAllocation.isPending}
                          key="assign"
                        >
                          分配
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar icon={<UserOutlined />} />}
                        title={user.name}
                        description={user.username}
                      />
                    </List.Item>
                  )}
                />
              )}
              {filteredUsers.length > 20 && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  还有 {filteredUsers.length - 20} 个用户，请使用搜索缩小范围
                </Text>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default PointAllocationManager;

import React, { useState, useMemo } from 'react';
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
  Layout,
  Segmented,
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
  ApartmentOutlined,
} from '@ant-design/icons';
import {
  useAllocationStatistics,
  useCreateAllocation,
  useDeleteAllocation,
  usePointAssignees,
} from '../../api/hooks';
import { useCollectionPoints } from '../../../market-intel/api/collection-point';
import { useUsers } from '../../../users/api/users';
import { CollectionPointType } from '@packages/types';
import { OrgDeptTree } from '../../../organization/components/OrgDeptTree';

const { Text, Title } = Typography;
const { Sider, Content } = Layout;

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
    allocationStatus?: 'ALLOCATED' | 'UNALLOCATED';
  }>({
    page: 1,
    pageSize: 15,
    type: undefined,
    keyword: '',
    isActive: true,
    allocationStatus: undefined,
  });

  // 抽屉状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<any>(null);

  // 用户筛选状态
  const [searchUserKeyword, setSearchUserKeyword] = useState('');
  const [selectedOrgNode, setSelectedOrgNode] = useState<{ id: string; type: 'org' | 'dept'; name: string } | null>(null);

  // 数据查询
  const { data: pointsData, isLoading: loadingPoints } = useCollectionPoints(pointQuery);
  const { data: stats } = useAllocationStatistics();
  const { data: users, isLoading: loadingUsers } = useUsers({ status: 'ACTIVE' });

  // 当前选中采集点的分配列表
  const { data: pointAssignees, isLoading: loadingAssignees } = usePointAssignees(
    selectedPoint?.id || ''
  );

  const createAllocation = useCreateAllocation();
  const deleteAllocation = useDeleteAllocation();

  // 过滤用户列表
  const filteredUsers = useMemo(() => {
    if (!users) return [];

    // 1. 排除已分配用户
    const assignedUserIds = new Set(pointAssignees?.map((a: any) => a.userId) || []);
    let result = users.filter((u: any) => !assignedUserIds.has(u.id));

    // 2. 按组织架构筛选
    if (selectedOrgNode) {
      if (selectedOrgNode.type === 'org') {
        // 选中组织：匹配该组织及其下属部门的用户
        result = result.filter((u: any) => u.organizationId === selectedOrgNode.id);
      } else {
        // 选中部门
        result = result.filter((u: any) => u.departmentId === selectedOrgNode.id);
      }
    }

    // 3. 按关键字筛选
    if (searchUserKeyword) {
      const lowerKeyword = searchUserKeyword.toLowerCase();
      result = result.filter(
        (u: any) =>
          u.name?.toLowerCase().includes(lowerKeyword) ||
          u.username?.toLowerCase().includes(lowerKeyword)
      );
    }

    return result;
  }, [users, pointAssignees, searchUserKeyword, selectedOrgNode]);

  // 打开分配抽屉
  const handleOpenDrawer = (point: any) => {
    setSelectedPoint(point);
    setDrawerVisible(true);
    setSearchUserKeyword('');
    setSelectedOrgNode(null);
  };

  // 分配人员
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
      render: (code: string, record: any) => record.region?.name || code || '-',
    },
    {
      title: '主要品种',
      dataIndex: 'commodities',
      key: 'commodities',
      width: 200,
      render: (commodities: string[]) => {
        if (!commodities || commodities.length === 0) return '-';
        const display = commodities.slice(0, 3);
        const restCount = commodities.length - 3;
        return (
          <Space size={4} wrap>
            {display.map((c) => (
              <Tag key={c} style={{ margin: 0 }}>
                {c}
              </Tag>
            ))}
            {restCount > 0 && <Tag style={{ margin: 0 }}>+{restCount}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '分配状态 / 负责人',
      key: 'allocationStatus',
      width: 250,
      render: (_: any, record: any) => {
        const activeAllocations = record.allocations?.filter((a: any) => a.isActive) || [];

        if (activeAllocations.length === 0) {
          return <Badge status="warning" text={<Text type="warning">未分配</Text>} />;
        }

        return (
          <Space>
             <Avatar.Group maxCount={5} size="small">
              {activeAllocations.map((a: any) => (
                <Tooltip key={a.id} title={a.user?.name}>
                  <Avatar src={a.user?.avatar} style={{ backgroundColor: '#1890ff' }}>
                    {a.user?.name?.[0]}
                  </Avatar>
                </Tooltip>
              ))}
            </Avatar.Group>
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({activeAllocations.length}人)
            </Text>
          </Space>
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
          <Segmented
            options={[
              { label: '全部', value: 'ALL' },
              { label: '已分配', value: 'ALLOCATED' },
              { label: '未分配', value: 'UNALLOCATED' },
            ]}
            value={pointQuery.allocationStatus || 'ALL'}
            onChange={(val) => {
              setPointQuery({
                ...pointQuery,
                allocationStatus: val === 'ALL' ? undefined : (val as any),
                page: 1,
              });
            }}
          />
          <Divider type="vertical" />
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
        width={1000}
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
          setSelectedPoint(null);
        }}
        bodyStyle={{ padding: 0 }}
      >
        {selectedPoint && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>
              {/* 1. 当前负责人列表 */}
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
                    grid={{ gutter: 16, column: 3 }}
                    dataSource={pointAssignees}
                    renderItem={(item: any) => (
                      <List.Item>
                        <Card size="small" bodyStyle={{ padding: 12 }}>
                           <List.Item.Meta
                            avatar={<Avatar src={item.user?.avatar} icon={<UserOutlined />} />}
                            title={
                              <Space>
                                <span>{item.user?.name}</span>
                                <Button
                                  type="text"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleRemoveAssignment(item.id, item.user?.name)}
                                />
                              </Space>
                            }
                            description={
                              <div style={{ fontSize: 12 }}>
                                <div>{item.user?.username}</div>
                                <div style={{ color: '#888', marginTop: 4 }}>
                                  <ApartmentOutlined style={{ marginRight: 4 }} />
                                  {item.user?.organization?.name}
                                  {item.user?.department?.name ? ` - ${item.user?.department?.name}` : ''}
                                </div>
                              </div>
                            }
                          />
                        </Card>
                      </List.Item>
                    )}
                  />
                )}
              </div>

              <Divider />

              {/* 2. 添加人员区域 (带组织架构筛选) */}
              <div style={{ height: 500, display: 'flex', flexDirection: 'column' }}>
                <Title level={5}>
                  <UserAddOutlined style={{ marginRight: 8 }} />
                  添加负责人
                </Title>

                <div style={{ display: 'flex', gap: 16, height: '100%' }}>
                  {/* 左侧：组织架构树 */}
                  <div style={{ width: 280, borderRight: '1px solid #f0f0f0', paddingRight: 16, overflowY: 'auto' }}>
                    <OrgDeptTree
                      onSelect={(node) => setSelectedOrgNode(node)}
                    />
                  </div>

                  {/* 右侧：用户列表 */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* 筛选标签 */}
                    {selectedOrgNode && (
                      <div style={{ marginBottom: 12 }}>
                        <Tag closable onClose={() => setSelectedOrgNode(null)} color="blue">
                          {selectedOrgNode.type === 'org' ? '组织' : '部门'}: {selectedOrgNode.name}
                        </Tag>
                      </div>
                    )}

                    {/* 搜索框 */}
                    <Input
                      placeholder="搜索员工姓名/用户名"
                      prefix={<SearchOutlined />}
                      style={{ marginBottom: 12 }}
                      value={searchUserKeyword}
                      onChange={(e) => setSearchUserKeyword(e.target.value)}
                      allowClear
                    />

                    {/* 用户列表 */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {loadingUsers ? (
                        <Spin />
                      ) : (
                        <List
                          grid={{ gutter: 12, column: 2 }}
                          dataSource={filteredUsers.slice(0, 50)}
                          locale={{ emptyText: searchUserKeyword || selectedOrgNode ? '未找到匹配用户' : '请搜索或选择部门' }}
                          renderItem={(user: any) => (
                            <List.Item>
                               <Card size="small" hoverable onClick={() => handleAssign(user.id)}>
                                <List.Item.Meta
                                  avatar={<Avatar icon={<UserOutlined />} />}
                                  title={
                                    <Space>
                                      <span>{user.name}</span>
                                      <PlusOutlined style={{ color: '#1890ff' }} />
                                    </Space>
                                  }
                                  description={
                                    <div style={{ fontSize: 12 }}>
                                      <div>{user.username}</div>
                                      <div style={{ color: '#888' }}>
                                        {user.organization?.name} {user.department?.name ? `- ${user.department?.name}` : ''}
                                      </div>
                                    </div>
                                  }
                                />
                              </Card>
                            </List.Item>
                          )}
                        />
                      )}
                      {filteredUsers.length > 50 && (
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8, textAlign: 'center' }}>
                          还有 {filteredUsers.length - 50} 个用户，请使用搜索或选择部门缩小范围
                        </Text>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default PointAllocationManager;

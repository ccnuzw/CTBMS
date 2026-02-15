import React, { useState, useMemo, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  App,
  Modal,
  Drawer,
  List,
  Avatar,
  Tooltip,
  Badge,
  Divider,
  Empty,
  Spin,
  Typography,
  Layout,
  Segmented,
  theme,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  UserAddOutlined,
  DeleteOutlined,
  DownloadOutlined,
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

export interface PointAllocationManagerProps {
  embedded?: boolean;
  defaultAllocationStatus?: 'ALL' | 'ALLOCATED' | 'UNALLOCATED';
}

export const PointAllocationManager: React.FC<PointAllocationManagerProps> = ({
  embedded = false,
  defaultAllocationStatus = 'ALL',
}) => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const initialAllocationStatus =
    defaultAllocationStatus === 'ALL' ? undefined : defaultAllocationStatus;
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
    allocationStatus: initialAllocationStatus,
  });

  useEffect(() => {
    const nextStatus = defaultAllocationStatus === 'ALL' ? undefined : defaultAllocationStatus;
    setPointQuery((prev) => {
      if (prev.allocationStatus === nextStatus) return prev;
      return {
        ...prev,
        allocationStatus: nextStatus,
        page: 1,
      };
    });
  }, [defaultAllocationStatus]);

  // 抽屉状态
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<any>(null);
  const [assignCommodity, setAssignCommodity] = useState<string | undefined>(undefined); // [NEW] 分配品种

  // 用户筛选状态
  const [searchUserKeyword, setSearchUserKeyword] = useState('');
  const [selectedOrgNode, setSelectedOrgNode] = useState<{
    id: string;
    type: 'org' | 'dept';
    name: string;
  } | null>(null);

  // 数据查询
  const { data: pointsData, isLoading: loadingPoints } = useCollectionPoints(pointQuery);
  const { data: stats } = useAllocationStatistics();
  const { data: users, isLoading: loadingUsers } = useUsers({ status: 'ACTIVE' });

  // 当前选中采集点的分配列表
  const { data: pointAssignees, isLoading: loadingAssignees } = usePointAssignees(
    selectedPoint?.id || '',
  );

  const createAllocation = useCreateAllocation();
  const deleteAllocation = useDeleteAllocation();

  const handleExport = async (allocationStatusOverride?: 'ALLOCATED' | 'UNALLOCATED') => {
    // ... (existing export logic)
    try {
      const params = new URLSearchParams();
      if (pointQuery.type) params.append('type', pointQuery.type);
      if (pointQuery.keyword) params.append('keyword', pointQuery.keyword);
      if (pointQuery.isActive !== undefined) params.append('isActive', String(pointQuery.isActive));
      const allocationStatus = allocationStatusOverride || pointQuery.allocationStatus;
      if (allocationStatus) params.append('allocationStatus', allocationStatus);
      params.append('page', '1');
      params.append('pageSize', '1000');

      const res = await fetch(`/api/collection-points?${params}`);
      if (!res.ok) throw new Error('导出失败');
      const data = (await res.json()) as { data: any[] };
      const rows = data.data || [];

      const header = ['采集点名称', '编码', '类型', '区域'];
      const lines = rows.map((item) => [
        item.name || '',
        item.code || '',
        getPointTypeInfo(item.type).label,
        item.region?.name || item.regionCode || '',
      ]);

      const csvContent =
        '\ufeff' +
        [header, ...lines]
          .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
          .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `采集点分配导出_${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success(`已导出 ${rows.length} 条数据`);
    } catch (err: any) {
      message.error(err?.message || '导出失败');
    }
  };

  // 过滤用户列表
  const filteredUsers = useMemo(() => {
    if (!users) return [];

    // [MODIFIED] 不再完全排除已分配用户，因为同一用户可能分配不同品种
    // 但为了简化，如果用户已经拥有"全品种"权限，则应排除
    // 如果当前选择了"全品种"分配，则排除所有已在该点有分配的用户（避免冲突）

    // const assignedUserIds = new Set(pointAssignees?.map((a: any) => a.userId) || []);
    // let result = users.filter((u: any) => !assignedUserIds.has(u.id));

    let result = users;

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
          u.username?.toLowerCase().includes(lowerKeyword),
      );
    }

    // [MODIFIED] 如果没有选择组织且没有搜索关键字，则不显示任何用户（避免一次性加载过多，也解决初始空白问题）
    if (!selectedOrgNode && !searchUserKeyword) {
      return [];
    }

    return result;
  }, [users, pointAssignees, searchUserKeyword, selectedOrgNode]);

  // 打开分配抽屉
  const handleOpenDrawer = (point: any) => {
    setSelectedPoint(point);
    setDrawerVisible(true);
    setSearchUserKeyword('');
    setSelectedOrgNode(null);
    setAssignCommodity(undefined); // 重置品种选择
  };

  // 分配人员
  const handleAssign = async (userId: string) => {
    if (!selectedPoint) return;

    // Check user's current allocations at this point
    const userAllocations = pointAssignees?.filter((a: any) => a.userId === userId) || [];

    // CASE 1: Assigning a Specific Commodity
    if (assignCommodity) {
      const hasAll = userAllocations.some((a: any) => !a.commodity);
      if (hasAll) {
        message.warning('该用户已拥有全品种采集权限，无需重复分配');
        return;
      }
      const isDuplicate = userAllocations.some((a: any) => a.commodity === assignCommodity);
      if (isDuplicate) {
        message.warning('该用户已在当前采集点分配了同一种品种');
        return;
      }
    }
    // CASE 2: Assigning "All Commodities" (Upgrade)
    else {
      const hasAll = userAllocations.some((a: any) => !a.commodity);
      if (hasAll) {
        message.warning('该用户已拥有全品种采集权限');
        return;
      }
      // If user has existing specific allocations, upgrade means replacing them
      if (userAllocations.length > 0) {
        try {
          // Delete all existing specific allocations first
          await Promise.all(userAllocations.map((a: any) => deleteAllocation.mutateAsync(a.id)));
          // Then create the "All" allocation
          await createAllocation.mutateAsync({
            userId,
            collectionPointId: selectedPoint.id,
            commodity: undefined,
          });
          message.success('已升级为全品种权限，原有单一品种分配已清除');
          return;
        } catch (err: any) {
          message.error('权限升级失败，请重试');
          return;
        }
      }
    }

    try {
      await createAllocation.mutateAsync({
        userId,
        collectionPointId: selectedPoint.id,
        commodity: assignCommodity, // [NEW]
      });
      message.success('分配成功');
    } catch (err: any) {
      if (err.response?.status === 409) {
        message.warning('该用户已在当前采集点分配了同一种品种');
        return;
      }
      const errorMsg = err.response?.data?.message;
      if (typeof errorMsg === 'string') {
        message.error(errorMsg);
      } else if (Array.isArray(errorMsg)) {
        message.error(errorMsg.join(', '));
      } else {
        message.error('分配失败');
      }
    }
  };

  // 取消分配
  const handleRemoveAssignment = (allocationId: string, userName: string) => {
    modal.confirm({
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
                  <Avatar src={a.user?.avatar} style={{ backgroundColor: token.colorPrimary }}>
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
    <div style={{ padding: embedded ? 0 : 24 }}>
      {/* 采集点列表 */}
      <Card bordered={false}>
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
          <Button icon={<DownloadOutlined />} onClick={() => handleExport()}>
            导出当前筛选
          </Button>
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
        styles={{ body: { padding: 0 } }}
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
                                {item.commodity && <Tag color="blue">{item.commodity}</Tag>}
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
                                <div style={{ color: token.colorTextSecondary, marginTop: 4 }}>
                                  <ApartmentOutlined style={{ marginRight: 4 }} />
                                  {item.user?.organization?.name}
                                  {item.user?.department?.name
                                    ? ` - ${item.user?.department?.name}`
                                    : ''}
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
                  <div
                    style={{
                      width: 280,
                      borderRight: `1px solid ${token.colorBorderSecondary}`,
                      paddingRight: 16,
                      overflowY: 'auto',
                    }}
                  >
                    <OrgDeptTree onSelect={(node) => setSelectedOrgNode(node)} />
                  </div>

                  {/* 右侧：用户列表 */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {/* 筛选标签 */}
                    <Space style={{ marginBottom: 12 }}>
                      {selectedOrgNode && (
                        <Tag closable onClose={() => setSelectedOrgNode(null)} color="blue">
                          {selectedOrgNode.type === 'org' ? '组织' : '部门'}: {selectedOrgNode.name}
                        </Tag>
                      )}

                      {/* [NEW] 品种选择 */}
                      {selectedPoint?.commodities?.length > 0 && (
                        <Select
                          style={{ width: 160 }}
                          placeholder="选择分配品种"
                          value={assignCommodity}
                          onChange={setAssignCommodity}
                          allowClear
                          options={[
                            { value: undefined, label: '全部品种 (默认)' },
                            ...selectedPoint.commodities.map((c: string) => ({
                              value: c,
                              label: c,
                            })),
                          ]}
                        />
                      )}
                    </Space>

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
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                      {loadingUsers ? (
                        <Spin />
                      ) : (
                        <List
                          grid={{ gutter: 12, column: 2 }}
                          dataSource={filteredUsers.slice(0, 50)}
                          locale={{
                            emptyText:
                              searchUserKeyword || selectedOrgNode
                                ? '未找到匹配用户'
                                : '请搜索或选择部门',
                          }}
                          renderItem={(user: any) => (
                            <List.Item>
                              <Card size="small" hoverable onClick={() => handleAssign(user.id)}>
                                <List.Item.Meta
                                  avatar={<Avatar icon={<UserOutlined />} />}
                                  title={
                                    <Space>
                                      <span>{user.name}</span>
                                      <PlusOutlined style={{ color: token.colorPrimary }} />
                                    </Space>
                                  }
                                  description={
                                    <div style={{ fontSize: 12 }}>
                                      <div>{user.username}</div>
                                      <div style={{ color: token.colorTextSecondary }}>
                                        {user.organization?.name}{' '}
                                        {user.department?.name ? `- ${user.department?.name}` : ''}
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
                        <Text
                          type="secondary"
                          style={{
                            fontSize: 12,
                            display: 'block',
                            marginTop: 8,
                            textAlign: 'center',
                          }}
                        >
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

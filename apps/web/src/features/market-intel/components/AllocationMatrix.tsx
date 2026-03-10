import React, { useState, useMemo, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  List,
  Avatar,
  Tag,
  Input,
  Select,
  Button,
  Empty,
  Checkbox,
  Space,
  Badge,
  Typography,
  Divider,
  Modal,
  // message, // Removed static message import to avoid conflict or just don't use it
  Tooltip,
  Segmented,
  Alert,
  App, // Add App component
  theme,
} from 'antd';
import {
  UserOutlined,
  SearchOutlined,
  EnvironmentOutlined,
  WarningOutlined,
  SaveOutlined,
  ReloadOutlined,
  GlobalOutlined,
  BarsOutlined,
  CheckSquareOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useDebounce } from '@/hooks/useDebounce';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';
import { useDictionary } from '@/hooks/useDictionaries';
import {
  useAllocationMatrix,
  useAllocationsByUser,
  useCreateAllocation,
  useDeleteAllocation,
  useBatchCreateAllocation,
} from '../../price-reporting/api/hooks';
import { OrgDeptTreeSelect } from '../../organization/components/OrgDeptTreeSelect';
import { CollectionPointMap } from './CollectionPointMap';
import { AllocationUserList } from './AllocationUserList';
import { AllocationPointList } from './AllocationPointList';

const { Text, Title } = Typography;

const POINT_TYPE_META_FALLBACK: Record<string, { label: string; color: string; icon: string }> = {
  PORT: { label: '港口', color: 'blue', icon: '⚓' },
  ENTERPRISE: { label: '企业', color: 'cyan', icon: '🏭' },
  STATION: { label: '站台', color: 'purple', icon: '🚂' },
  MARKET: { label: '批发市场', color: 'green', icon: '🏪' },
  REGION: { label: '地域', color: 'orange', icon: '🌍' },
};



export const AllocationMatrix: React.FC = () => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  // 焦点管理
  const { focusRef, containerRef, modalProps } = useModalAutoFocus();
  const blurActiveElement = () => {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
  };
  const { data: pointTypeDict } = useDictionary('COLLECTION_POINT_TYPE');

  // 状态
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userKeyword, setUserKeyword] = useState('');
  const [pointKeyword, setPointKeyword] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>(undefined);
  const [pointTypeFilter, setPointTypeFilter] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(new Set());
  const [pointStatusFilter, setPointStatusFilter] = useState<
    'ALL' | 'UNALLOCATED' | 'ALLOCATED' | 'ASSIGNED_TO_USER'
  >('ALL');
  const [userSort, setUserSort] = useState<'NAME' | 'WORKLOAD' | 'TASKS'>('NAME');

  // 品种选择弹窗状态
  const [commodityModalOpen, setCommodityModalOpen] = useState(false);
  const [currentOperatingPoint, setCurrentOperatingPoint] = useState<any>(null);
  const [selectedCommodity, setSelectedCommodity] = useState<string[]>([]);

  // 查询参数
  const debouncedUserKeyword = useDebounce(userKeyword, 500);
  const debouncedPointKeyword = useDebounce(pointKeyword, 500);

  const matrixQuery = useMemo(() => {
    const query: Record<string, any> = {};
    const hasUserFilter = !!orgFilter || !!debouncedUserKeyword;
    const hasPointFilter = !!pointTypeFilter || !!debouncedPointKeyword;

    if (hasUserFilter) {
      if (debouncedUserKeyword) query.userKeyword = debouncedUserKeyword;
      if (orgFilter) {
        if (orgFilter.startsWith('org-')) query.organizationId = orgFilter.substring(4);
        if (orgFilter.startsWith('dept-')) query.departmentId = orgFilter.substring(5);
      }
    }

    if (hasPointFilter) {
      if (debouncedPointKeyword) query.pointKeyword = debouncedPointKeyword;
      if (pointTypeFilter) query.pointType = pointTypeFilter;
    }

    // 如果没有任何筛选条件，不要发送请求（配合后端优化）
    if (!hasUserFilter && !hasPointFilter) {
      return null;
    }

    return query;
  }, [debouncedUserKeyword, debouncedPointKeyword, pointTypeFilter, orgFilter]);

  // 数据获取
  // 只有当 matrixQuery 不为 null 时才启用查询
  const hasUserFilter = !!orgFilter || !!debouncedUserKeyword;
  const queryEnabled = !!matrixQuery;
  const userQueryEnabled = hasUserFilter;
  const { data, isLoading, isFetching, isError, error, refetch } = useAllocationMatrix(
    matrixQuery || {},
    {
      enabled: queryEnabled,
    },
  );
  const {
    data: userAllocations,
    isLoading: isLoadingUserAllocations,
    refetch: refetchUserAllocations,
  } = useAllocationsByUser(selectedUserId || undefined);
  const createAllocation = useCreateAllocation();
  const batchCreateAllocation = useBatchCreateAllocation();
  const deleteAllocation = useDeleteAllocation();

  // 当前选中的用户信息
  const selectedUser = useMemo(
    () => data?.users.find((u) => u.id === selectedUserId),
    [data, selectedUserId],
  );

  const allocationIdByPointId = useMemo(() => {
    const map = new Map<string, string>();

    (userAllocations || []).forEach((allocation: any) => {
      if (allocation.collectionPointId) {
        map.set(allocation.collectionPointId, allocation.id);
      }
    });
    return map;
  }, [userAllocations]);

  const pointCounts = useMemo(() => {
    const points = data?.points || [];
    const total = points.length;
    const allocated = points.filter((p) => p.isAllocated).length;
    const unallocated = total - allocated;
    const assignedToUser = selectedUserId
      ? points.filter((p) => p.allocatedUserIds.includes(selectedUserId)).length
      : 0;
    return { total, allocated, unallocated, assignedToUser };
  }, [data, selectedUserId]);

  const pointStatusOptions = useMemo(
    () => [
      { label: `全部 (${pointCounts.total})`, value: 'ALL' },
      { label: `未分配 (${pointCounts.unallocated})`, value: 'UNALLOCATED' },
      { label: `已分配 (${pointCounts.allocated})`, value: 'ALLOCATED' },
      {
        label: selectedUserId ? `我负责 (${pointCounts.assignedToUser})` : '我负责',
        value: 'ASSIGNED_TO_USER',
        disabled: !selectedUserId,
      },
    ],
    [pointCounts, selectedUserId],
  );

  const pointTypeMeta = useMemo(() => {
    const items = (pointTypeDict || []).filter((item) => item.isActive);
    if (!items.length) return POINT_TYPE_META_FALLBACK;
    return items.reduce<Record<string, { label: string; color: string; icon: string }>>(
      (acc, item) => {
        const meta = item.meta as { color?: string; icon?: string } | null;
        acc[item.code] = {
          label: item.label,
          color: meta?.color || POINT_TYPE_META_FALLBACK[item.code]?.color || 'default',
          icon: meta?.icon || POINT_TYPE_META_FALLBACK[item.code]?.icon || '',
        };
        return acc;
      },
      { ...POINT_TYPE_META_FALLBACK },
    );
  }, [pointTypeDict]);

  const pointTypeOptions = useMemo(() => {
    const items = (pointTypeDict || []).filter((item) => item.isActive);
    if (!items.length) {
      return Object.entries(POINT_TYPE_META_FALLBACK).map(([value, meta]) => ({
        value,
        label: meta.label,
      }));
    }
    return items
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((item) => ({ value: item.code, label: item.label }));
  }, [pointTypeDict]);

  const sortedUsers = useMemo(() => {
    const users = [...(data?.users || [])];
    if (userSort === 'WORKLOAD') {
      users.sort((a, b) => (b.assignedPointCount || 0) - (a.assignedPointCount || 0));
    } else if (userSort === 'TASKS') {
      users.sort((a, b) => (b.pendingTaskCount || 0) - (a.pendingTaskCount || 0));
    } else {
      users.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'));
    }
    return users;
  }, [data, userSort]);

  const filteredPoints = useMemo(() => {
    const points = data?.points || [];
    if (pointStatusFilter === 'UNALLOCATED') {
      return points.filter((p) => !p.isAllocated);
    }
    if (pointStatusFilter === 'ALLOCATED') {
      return points.filter((p) => p.isAllocated);
    }
    if (pointStatusFilter === 'ASSIGNED_TO_USER') {
      if (!selectedUserId) return [];
      return points.filter((p) => p.allocatedUserIds.includes(selectedUserId));
    }
    return points;
  }, [data, pointStatusFilter, selectedUserId]);

  const selectablePoints = useMemo(() => {
    if (!selectedUserId) return [];
    return filteredPoints.filter((p) => !p.allocatedUserIds.includes(selectedUserId));
  }, [filteredPoints, selectedUserId]);

  const filteredPointIdSet = useMemo(
    () => new Set(filteredPoints.map((p) => p.pointId)),
    [filteredPoints],
  );

  useEffect(() => {
    if (pointStatusFilter === 'ASSIGNED_TO_USER' && !selectedUserId) {
      setPointStatusFilter('ALL');
    }
  }, [pointStatusFilter, selectedUserId]);

  useEffect(() => {
    if (!userQueryEnabled) {
      setSelectedUserId(null);
    }
  }, [userQueryEnabled]);

  useEffect(() => {
    setSelectedPointIds(new Set());
    setIsSelectionMode(false);
  }, [selectedUserId]);

  useEffect(() => {
    if (!isSelectionMode) return;
    setSelectedPointIds((prev) => {
      const next = new Set([...prev].filter((id) => filteredPointIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredPointIdSet, isSelectionMode]);

  useEffect(() => {
    if (!selectedUserId || !data?.users?.length) return;
    const exists = data.users.some((u) => u.id === selectedUserId);
    if (!exists) {
      setSelectedUserId(null);
      setSelectedPointIds(new Set());
      setIsSelectionMode(false);
    }
  }, [data?.users, selectedUserId]);

  // 处理分配确认 (Modal确认)
  const handleConfirmAllocation = async () => {
    if (!selectedUserId || !currentOperatingPoint) return;

    try {
      // 检查是否选择了"全品种" (空字符串) 或未选择任何内容(空数组)
      const isAllCommodities = selectedCommodity.length === 0 || selectedCommodity.includes('');

      if (isAllCommodities) {
        // 全品种分配
        await createAllocation.mutateAsync({
          userId: selectedUserId,
          collectionPointId: currentOperatingPoint.pointId,
          commodity: undefined,
        });
      } else if (selectedCommodity.length === 1) {
        // 单个品种分配
        await createAllocation.mutateAsync({
          userId: selectedUserId,
          collectionPointId: currentOperatingPoint.pointId,
          commodity: selectedCommodity[0],
        });
      } else {
        // 多个品种 -> 批量创建
        await batchCreateAllocation.mutateAsync({
          collectionPointId: currentOperatingPoint.pointId,
          allocations: selectedCommodity.map((c) => ({
            userId: selectedUserId,
            commodity: c,
          })),
        });
      }

      message.success('已分配');
      blurActiveElement();
      setCommodityModalOpen(false);
      setCurrentOperatingPoint(null);
      setSelectedCommodity([]);
      refetch();
      refetchUserAllocations();

    } catch (err: any) {
      message.error(err?.response?.data?.message || '操作失败');
    }
  };

  // 处理分配变更 (单个)
  const handleToggleAllocation = async (pointId: string, currentAllocated: boolean) => {
    if (!selectedUserId) {
      message.info('请先选择负责人');
      return;
    }

    if (currentAllocated) {
      // 查找当前用户在该点的所有分配
      const allocations =

        userAllocations?.filter((a: any) => a.collectionPointId === pointId) || [];

      if (allocations.length === 0) {
        message.warning('分配信息加载中，请稍后再试');
        return;
      }

      modal.confirm({
        title: '确认取消分配？',
        content:
          allocations.length > 1

            ? `该用户在此采集点有 ${allocations.length} 项分配记录（${allocations.map((a: any) => a.commodity || '全品种').join(', ')}），将全部取消。`
            : '取消后该采集点将不再分配给当前负责人',
        okText: '确认',
        cancelText: '取消',
        onOk: async () => {
          try {
            // 并行删除所有关联分配

            await Promise.all(allocations.map((a: any) => deleteAllocation.mutateAsync(a.id)));
            message.success('已取消分配');
            refetch();
            refetchUserAllocations();

          } catch (err: any) {
            message.error(err?.response?.data?.message || '操作失败');
          }
        },
      });
      return;
    }

    // 新增分配
    const point = data?.points.find((p) => p.pointId === pointId);
    if (!point) return;

    // 检查是否需要选择品种
    const commodities = (point as any).commodities || [];
    if (commodities.length > 0) {
      blurActiveElement();
      setCurrentOperatingPoint(point);
      setSelectedCommodity([]); // 默认全选/空状态
      setCommodityModalOpen(true);
    } else {
      // 无特定品种，直接分配
      try {
        await createAllocation.mutateAsync({
          userId: selectedUserId,
          collectionPointId: pointId,
        });
        message.success('已分配');
        refetch();
        refetchUserAllocations();

      } catch (err: any) {
        message.error(err?.response?.data?.message || '操作失败');
      }
    }
  };

  // 批量操作
  const handleSelectPoint = (pointId: string, checked: boolean) => {
    const newSet = new Set(selectedPointIds);
    if (checked) {
      newSet.add(pointId);
    } else {
      newSet.delete(pointId);
    }
    setSelectedPointIds(newSet);
  };

  const handleBatchAssign = async () => {
    if (!selectedUserId) {
      message.info('请先选择负责人');
      return;
    }
    if (selectedPointIds.size === 0) {
      message.info('请先选择采集点');
      return;
    }

    try {
      // 这里的逻辑需要根据后端接口调整
      // 假设后端支持 batchCreateAllocation 接收 { allocations: [{ userId, pointId }] } 或类似
      // 现有的 useBatchCreateAllocation 是针对 "一个点分配给多人"
      // 我们需要确认 backend service 是否支持 "一人分配给多点"
      // 查看 Service: batchCreate(dto: BatchCreateAllocationDto) -> { collectionPointId, allocations: [{userId}] }
      // 现在的 API 是 "一个采集点 -> 多个用户"。
      // 我们的需求是 "多个采集点 -> 一个用户"。
      // 所以我们需要循环调用 createAllocation 或者后端新增接口。
      // 为了效率，前端循环调用 createAllocation (Promise.all)

      const pointIdList = Array.from(selectedPointIds);
      const promises = pointIdList.map((pointId) =>
        createAllocation.mutateAsync({
          userId: selectedUserId,
          collectionPointId: pointId,
        }),
      );

      const results = await Promise.allSettled(promises);
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedIds = pointIdList.filter((_, index) => results[index].status === 'rejected');

      if (successCount > 0) {
        message.success(`成功分配 ${successCount} 个采集点`);
      }
      if (failedIds.length > 0) {
        message.warning(`有 ${failedIds.length} 个采集点分配失败，请重试`);
      }

      setSelectedPointIds(new Set(failedIds));
      setIsSelectionMode(failedIds.length > 0);
      refetch();
      refetchUserAllocations();
    } catch (error) {
      message.error('批量分配部分失败');
      refetch();
    }
  };

  const handleSelectAllFiltered = () => {
    if (!selectedUserId) {
      message.info('请先选择负责人');
      return;
    }
    const selectableIds = selectablePoints.map((point) => point.pointId);
    setSelectedPointIds(new Set(selectableIds));
  };

  const handleClearSelection = () => {
    setSelectedPointIds(new Set());
  };

  // 渲染用户列表
  const renderUserList = () => (
    <AllocationUserList
      sortedUsers={sortedUsers}
      selectedUserId={selectedUserId}
      setSelectedUserId={setSelectedUserId}
      userQueryEnabled={userQueryEnabled}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      error={error as Error | null}
      token={token}
    />
  );

  // 渲染采集点列表
  const renderPointList = () => (
    <AllocationPointList
      filteredPoints={filteredPoints}
      queryEnabled={queryEnabled}
      isLoading={isLoading}
      isFetching={isFetching}
      isError={isError}
      error={error as Error | null}
      selectedUserId={selectedUserId}
      isSelectionMode={isSelectionMode}
      selectedPointIds={selectedPointIds}
      isLoadingUserAllocations={isLoadingUserAllocations}
      pointTypeMeta={pointTypeMeta}
      token={token}
      onSelectPoint={handleSelectPoint}
      onToggleAllocation={handleToggleAllocation}
    />
  );

  return (
    <div className="allocation-matrix">
      {/* 顶部统计与筛选 */}
      <Card bodyStyle={{ padding: '16px 24px' }} style={{ marginBottom: 16 }}>
        {pointCounts.unallocated > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`当前还有 ${pointCounts.unallocated} 个采集点未分配负责人`}
            action={
              <Button size="small" onClick={() => setPointStatusFilter('UNALLOCATED')}>
                只看未分配
              </Button>
            }
            style={{ marginBottom: 12 }}
          />
        )}
        <Row gutter={16}>
          <Col span={6}>
            <OrgDeptTreeSelect
              mode="both"
              multiple={false}
              returnRawValue={true}
              value={orgFilter ? [orgFilter] : []}
              onChange={(vals: string[]) => setOrgFilter(vals[0])}
              placeholder="筛选组织/部门"
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索人员姓名"
              value={userKeyword}
              onChange={(e) => setUserKeyword(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Select
              allowClear
              placeholder="采集点类型"
              style={{ width: '100%' }}
              value={pointTypeFilter}
              onChange={(value) => setPointTypeFilter(value || undefined)}
              options={pointTypeOptions}
            />
          </Col>
          <Col span={6}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索采集点名称"
              value={pointKeyword}
              onChange={(e) => setPointKeyword(e.target.value)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ height: '100%' }}>
        {/* 左侧：人员列表 */}
        <Col span={6}>
          <Card
            title={
              <Space>
                <UserOutlined />
                <span>选择负责人</span>
                <Badge
                  count={userQueryEnabled ? data?.users.length || 0 : 0}
                  style={{ backgroundColor: token.colorPrimary }}
                />
              </Space>
            }
            extra={
              <Select
                size="small"
                value={userSort}
                onChange={setUserSort}
                options={[
                  { label: '按姓名', value: 'NAME' },
                  { label: '按负载', value: 'WORKLOAD' },
                  { label: '按待办', value: 'TASKS' },
                ]}
              />
            }
            bodyStyle={{ padding: 0 }}
          >
            {renderUserList()}
          </Card>
        </Col>

        {/* 右侧：分配矩阵 */}
        <Col span={18}>
          <Card
            title={
              <Space>
                <EnvironmentOutlined />
                <span>分配采集点</span>
                {selectedUser && <Tag color="blue">当前操作: {selectedUser.name}</Tag>}
              </Space>
            }
            extra={
              <Space>
                <Segmented
                  value={viewMode}

                  onChange={(val: any) => setViewMode(val)}
                  options={[
                    { label: '列表', value: 'list', icon: <BarsOutlined /> },
                    { label: '地图', value: 'map', icon: <GlobalOutlined /> },
                  ]}
                />
                {viewMode === 'list' && (
                  <Button
                    icon={isSelectionMode ? <SaveOutlined /> : <CheckSquareOutlined />}
                    type={isSelectionMode ? 'primary' : 'default'}
                    onClick={() => {
                      if (isSelectionMode) {
                        handleBatchAssign();
                      } else {
                        if (!selectedUserId) {
                          message.info('请先选择负责人');
                          return;
                        }
                        setIsSelectionMode(true);
                      }
                    }}
                    disabled={!selectedUserId || (isSelectionMode && selectedPointIds.size === 0)}
                  >
                    {isSelectionMode ? `确认分配 (${selectedPointIds.size})` : '批量分配'}
                  </Button>
                )}
                {isSelectionMode && (
                  <Button
                    onClick={() => {
                      setIsSelectionMode(false);
                      setSelectedPointIds(new Set());
                    }}
                  >
                    取消
                  </Button>
                )}
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => refetch()}
                  disabled={!queryEnabled}
                >
                  刷新
                </Button>
              </Space>
            }
            bodyStyle={{ padding: viewMode === 'map' ? 0 : '16px 0' }}
          >
            <div
              style={{
                padding: '0 16px 12px',
                borderBottom:
                  viewMode === 'map' ? 'none' : `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Space wrap>
                <Segmented
                  value={pointStatusFilter}

                  onChange={(val: any) => setPointStatusFilter(val)}
                  options={pointStatusOptions}
                />
                {isSelectionMode && viewMode === 'list' && (
                  <>
                    <Button
                      size="small"
                      onClick={handleSelectAllFiltered}
                      disabled={!selectedUserId || selectablePoints.length === 0}
                    >
                      全选当前筛选
                    </Button>
                    <Button
                      size="small"
                      onClick={handleClearSelection}
                      disabled={selectedPointIds.size === 0}
                    >
                      清空选择
                    </Button>
                    <Text type="secondary">
                      已选 {selectedPointIds.size} / 可分配 {selectablePoints.length}
                    </Text>
                  </>
                )}
              </Space>
              {!selectedUserId && (
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                  选择负责人后可分配采集点；当前为只读浏览模式。
                </Text>
              )}
            </div>
            {viewMode === 'list' ? (
              renderPointList()
            ) : (
              <CollectionPointMap
                points={filteredPoints}
                selectedUserId={selectedUserId}
                onAssign={(pointId) => handleToggleAllocation(pointId, false)}
                onUnassign={(pointId) => handleToggleAllocation(pointId, true)}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 品种选择弹窗 */}
      <Modal
        title={`分配品种 - ${currentOperatingPoint?.pointName || ''}`}
        open={commodityModalOpen}
        {...modalProps}
        onOk={handleConfirmAllocation}
        onCancel={() => {
          blurActiveElement();
          setCommodityModalOpen(false);
          setCurrentOperatingPoint(null);
          setSelectedCommodity([]);
        }}
        okText="确认分配"
        cancelText="取消"
        focusTriggerAfterClose={false}
      >
        <div ref={containerRef} style={{ padding: '20px 0' }}>
          <Alert
            message="请选择该负责人负责的品种"
            description="如果不选择具体品种，将默认为“全品种”负责（即负责该采集点的所有商品）。"
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
          />

          <div style={{ marginBottom: 8 }}>选择品种:</div>
          <Select
            ref={focusRef}
            style={{ width: '100%' }}
            placeholder="请选择品种 (留空代表全品种)"
            allowClear
            mode="multiple"
            value={selectedCommodity}
            onChange={(values) => {
              // 互斥逻辑处理
              // 1. 如果新选择中包含"全品种"('')，且之前没有，说明是刚点击了全品种 -> 清空其他，只留全品种
              const hasAll = values.includes('');
              const hadAll = selectedCommodity.includes('');

              if (hasAll && !hadAll) {
                setSelectedCommodity(['']);
                return;
              }

              // 2. 如果之前有全品种，现在选了别的 -> 移除全品种
              if (hadAll && values.length > 1) {
                setSelectedCommodity(values.filter((v) => v !== ''));
                return;
              }

              // 3. 正常情况
              setSelectedCommodity(values);
            }}
            options={[
              { label: '全品种 (默认)', value: '' },
              ...(currentOperatingPoint?.commodities || []).map((c: string) => ({
                label: c,
                value: c,
              })),
            ]}
          />
        </div>
      </Modal>
    </div>
  );
};

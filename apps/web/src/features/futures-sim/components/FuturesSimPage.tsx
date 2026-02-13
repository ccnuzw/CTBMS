import React, { useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Flex,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  BankOutlined,
  StockOutlined,
  SwapOutlined,
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
  PlusOutlined,
  EyeOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import type { VirtualFuturesPositionDto, VirtualTradeLedgerDto } from '@packages/types';
import {
  usePositions,
  usePositionDetail,
  useOpenPosition,
  useClosePosition,
  useTrades,
  useAccountSummary,
} from '../api/futures-sim';

const { Title, Text } = Typography;

const directionConfig: Record<string, { color: string; label: string }> = {
  LONG: { color: 'red', label: '多头' },
  SHORT: { color: 'green', label: '空头' },
};

const positionStatusConfig: Record<string, { color: string; label: string }> = {
  OPEN: { color: 'processing', label: '持仓中' },
  PARTIALLY_CLOSED: { color: 'warning', label: '部分平仓' },
  CLOSED: { color: 'default', label: '已平仓' },
  LIQUIDATED: { color: 'error', label: '已强平' },
};

const actionConfig: Record<string, { color: string; label: string }> = {
  OPEN_LONG: { color: 'red', label: '开多' },
  OPEN_SHORT: { color: 'green', label: '开空' },
  CLOSE_LONG: { color: 'orange', label: '平多' },
  CLOSE_SHORT: { color: 'cyan', label: '平空' },
  FORCED_LIQUIDATION: { color: 'error', label: '强平' },
};

const riskLevelConfig: Record<string, { color: string; label: string }> = {
  NORMAL: { color: 'success', label: '正常' },
  WARNING: { color: 'warning', label: '预警' },
  DANGER: { color: 'error', label: '危险' },
  LIQUIDATION: { color: '#ff0000', label: '强平线' },
};

export const FuturesSimPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') ?? 'positions';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const statusFilter = searchParams.get('status') ?? undefined;
  const directionFilter = searchParams.get('direction') ?? undefined;
  const accountId = searchParams.get('accountId') ?? 'default';

  const [selectedPositionId, setSelectedPositionId] = useState<string | undefined>();
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [closeModal, setCloseModal] = useState<{ open: boolean; positionId: string; closePrice: number; quantity: number; reason: string }>({
    open: false, positionId: '', closePrice: 0, quantity: 1, reason: '',
  });

  const [openForm, setOpenForm] = useState({
    contractCode: '',
    exchange: 'SHFE' as string,
    direction: 'LONG' as string,
    openPrice: 0,
    quantity: 1,
    marginRate: 0.1,
    stopLossPrice: '',
    takeProfitPrice: '',
  });

  const { data: positionsData, isLoading: isPosLoading } = usePositions(
    activeTab === 'positions' ? { accountId, status: statusFilter, direction: directionFilter, page, pageSize } : undefined,
  );
  const { data: tradesData, isLoading: isTradesLoading } = useTrades(
    activeTab === 'trades' ? { accountId, page, pageSize } : undefined,
  );
  const { data: positionDetail } = usePositionDetail(selectedPositionId);
  const { data: accountSummary } = useAccountSummary(accountId);

  const openMutation = useOpenPosition();
  const closeMutation = useClosePosition();

  const handleOpen = async () => {
    if (!openForm.contractCode || openForm.openPrice <= 0) {
      message.warning('请填写合约代码和开仓价格');
      return;
    }
    try {
      await openMutation.mutateAsync({
        accountId,
        contractCode: openForm.contractCode,
        exchange: openForm.exchange as 'SHFE' | 'DCE' | 'CZCE' | 'INE' | 'CFFEX' | 'GFEX' | 'OTHER',
        direction: openForm.direction as 'LONG' | 'SHORT',
        openPrice: openForm.openPrice,
        quantity: openForm.quantity,
        marginRate: openForm.marginRate,
        stopLossPrice: openForm.stopLossPrice ? Number(openForm.stopLossPrice) : undefined,
        takeProfitPrice: openForm.takeProfitPrice ? Number(openForm.takeProfitPrice) : undefined,
      });
      message.success('开仓成功');
      setIsOpenModalOpen(false);
      setOpenForm({ contractCode: '', exchange: 'SHFE', direction: 'LONG', openPrice: 0, quantity: 1, marginRate: 0.1, stopLossPrice: '', takeProfitPrice: '' });
    } catch {
      message.error('开仓失败');
    }
  };

  const handleClose = async () => {
    if (closeModal.closePrice <= 0) {
      message.warning('请输入平仓价格');
      return;
    }
    try {
      await closeMutation.mutateAsync({
        id: closeModal.positionId,
        dto: {
          closePrice: closeModal.closePrice,
          quantity: closeModal.quantity,
          reason: closeModal.reason || undefined,
        },
      });
      message.success('平仓成功');
      setCloseModal({ open: false, positionId: '', closePrice: 0, quantity: 1, reason: '' });
    } catch {
      message.error('平仓失败');
    }
  };

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    setSearchParams(next);
  };

  const positionColumns: ColumnsType<VirtualFuturesPositionDto> = [
    {
      title: '合约',
      dataIndex: 'contractCode',
      width: 100,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      width: 70,
      render: (d: string) => {
        const cfg = directionConfig[d] ?? { color: 'default', label: d };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => {
        const cfg = positionStatusConfig[s] ?? { color: 'default', label: s };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '开仓价', dataIndex: 'openPrice', width: 100, render: (v: number) => v.toFixed(2) },
    { title: '数量', dataIndex: 'quantity', width: 70 },
    { title: '剩余', dataIndex: 'remainingQty', width: 70 },
    { title: '保证金', dataIndex: 'marginAmount', width: 110, render: (v: number) => v.toFixed(2) },
    {
      title: '浮动盈亏',
      dataIndex: 'floatingPnl',
      width: 110,
      render: (v: number | null) => {
        if (v === null || v === undefined) return '-';
        return <Text style={{ color: v >= 0 ? token.colorSuccess : token.colorError }}>{v.toFixed(2)}</Text>;
      },
    },
    {
      title: '已实现盈亏',
      dataIndex: 'realizedPnl',
      width: 110,
      render: (v: number | null) => {
        if (v === null || v === undefined) return '-';
        return <Text style={{ color: v >= 0 ? token.colorSuccess : token.colorError }}>{v.toFixed(2)}</Text>;
      },
    },
    {
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setSelectedPositionId(record.id)}>详情</Button>
          {(record.status === 'OPEN' || record.status === 'PARTIALLY_CLOSED') && (
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => setCloseModal({ open: true, positionId: record.id, closePrice: record.openPrice, quantity: record.remainingQty, reason: '' })}
            >
              平仓
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const tradeColumns: ColumnsType<VirtualTradeLedgerDto> = [
    {
      title: '动作',
      dataIndex: 'action',
      width: 80,
      render: (a: string) => {
        const cfg = actionConfig[a] ?? { color: 'default', label: a };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    { title: '合约', dataIndex: 'contractCode', width: 100 },
    { title: '价格', dataIndex: 'price', width: 100, render: (v: number) => v.toFixed(2) },
    { title: '数量', dataIndex: 'quantity', width: 70 },
    { title: '金额', dataIndex: 'amount', width: 120, render: (v: number) => v.toFixed(2) },
    {
      title: '盈亏',
      dataIndex: 'realizedPnl',
      width: 100,
      render: (v: number | null) => {
        if (v === null || v === undefined) return '-';
        return <Text style={{ color: v >= 0 ? token.colorSuccess : token.colorError }}>{v.toFixed(2)}</Text>;
      },
    },
    {
      title: '时间',
      dataIndex: 'tradedAt',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
    },
  ];

  const riskCfg = riskLevelConfig[accountSummary?.riskAlertLevel ?? 'NORMAL'];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {/* ── Header ── */}
      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <StockOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
            <Title level={4} style={{ margin: 0 }}>期货模拟中心</Title>
          </Space>
          <Space>
            <Input
              style={{ width: 140 }}
              value={accountId}
              addonBefore="账户"
              onChange={(e) => updateParams({ accountId: e.target.value || 'default' })}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsOpenModalOpen(true)}>
              开仓
            </Button>
          </Space>
        </Flex>
      </Card>

      {/* ── Account Summary ── */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="可用余额"
              value={accountSummary?.availableBalance?.toFixed(2) ?? '-'}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="占用保证金"
              value={accountSummary?.totalMargin?.toFixed(2) ?? '-'}
              prefix={<BankOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="浮动盈亏"
              value={accountSummary?.totalFloatingPnl?.toFixed(2) ?? '-'}
              prefix={(accountSummary?.totalFloatingPnl ?? 0) >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              valueStyle={{ color: (accountSummary?.totalFloatingPnl ?? 0) >= 0 ? token.colorSuccess : token.colorError }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Flex justify="space-between" align="center">
              <Statistic title="风控状态" value={riskCfg?.label ?? '-'} valueStyle={{ color: riskCfg?.color }} />
              {accountSummary && (
                <Progress
                  type="circle"
                  percent={Math.round(accountSummary.marginUsageRate * 100)}
                  size={48}
                  strokeColor={
                    accountSummary.marginUsageRate >= 0.7 ? token.colorError
                      : accountSummary.marginUsageRate >= 0.5 ? token.colorWarning
                        : token.colorSuccess
                  }
                />
              )}
            </Flex>
          </Card>
        </Col>
      </Row>

      {/* ── Tabs: Positions / Trades ── */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => updateParams({ tab: key, page: '1' })}
          items={[
            { key: 'positions', label: `持仓 (${accountSummary?.openPositionCount ?? 0})` },
            { key: 'trades', label: '成交流水' },
          ]}
          tabBarExtraContent={
            activeTab === 'positions' ? (
              <Space>
                <Select
                  allowClear
                  style={{ width: 100 }}
                  placeholder="方向"
                  value={directionFilter}
                  onChange={(v) => updateParams({ direction: v, page: '1' })}
                  options={[
                    { label: '多头', value: 'LONG' },
                    { label: '空头', value: 'SHORT' },
                  ]}
                />
                <Select
                  allowClear
                  style={{ width: 120 }}
                  placeholder="状态"
                  value={statusFilter}
                  onChange={(v) => updateParams({ status: v, page: '1' })}
                  options={[
                    { label: '持仓中', value: 'OPEN' },
                    { label: '部分平仓', value: 'PARTIALLY_CLOSED' },
                    { label: '已平仓', value: 'CLOSED' },
                    { label: '已强平', value: 'LIQUIDATED' },
                  ]}
                />
              </Space>
            ) : null
          }
        />
        {activeTab === 'positions' && (
          <Table<VirtualFuturesPositionDto>
            rowKey="id"
            loading={isPosLoading}
            dataSource={positionsData?.data ?? []}
            columns={positionColumns}
            size="middle"
            scroll={{ x: 1100 }}
            pagination={{
              current: page,
              pageSize,
              total: positionsData?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (p, ps) => updateParams({ page: String(p), pageSize: String(ps) }),
            }}
          />
        )}
        {activeTab === 'trades' && (
          <Table<VirtualTradeLedgerDto>
            rowKey="id"
            loading={isTradesLoading}
            dataSource={tradesData?.data ?? []}
            columns={tradeColumns}
            size="middle"
            scroll={{ x: 800 }}
            pagination={{
              current: page,
              pageSize,
              total: tradesData?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (p, ps) => updateParams({ page: String(p), pageSize: String(ps) }),
            }}
          />
        )}
      </Card>

      {/* ── Open Position Modal ── */}
      <Modal
        title="开仓"
        open={isOpenModalOpen}
        onCancel={() => setIsOpenModalOpen(false)}
        onOk={handleOpen}
        confirmLoading={openMutation.isPending}
        width={480}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>合约代码 *</Text>
              <Input value={openForm.contractCode} onChange={(e) => setOpenForm((p) => ({ ...p, contractCode: e.target.value }))} style={{ marginTop: 4 }} placeholder="如 rb2510" />
            </Col>
            <Col span={12}>
              <Text strong>交易所</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={openForm.exchange}
                onChange={(v) => setOpenForm((p) => ({ ...p, exchange: v }))}
                options={[
                  { label: '上期所 (SHFE)', value: 'SHFE' },
                  { label: '大商所 (DCE)', value: 'DCE' },
                  { label: '郑商所 (CZCE)', value: 'CZCE' },
                  { label: '能源中心 (INE)', value: 'INE' },
                  { label: '中金所 (CFFEX)', value: 'CFFEX' },
                  { label: '广期所 (GFEX)', value: 'GFEX' },
                  { label: '其他', value: 'OTHER' },
                ]}
              />
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>方向</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={openForm.direction}
                onChange={(v) => setOpenForm((p) => ({ ...p, direction: v }))}
                options={[
                  { label: '做多 (LONG)', value: 'LONG' },
                  { label: '做空 (SHORT)', value: 'SHORT' },
                ]}
              />
            </Col>
            <Col span={12}>
              <Text strong>开仓价格 *</Text>
              <InputNumber style={{ width: '100%', marginTop: 4 }} min={0.01} step={0.01} value={openForm.openPrice} onChange={(v) => setOpenForm((p) => ({ ...p, openPrice: v ?? 0 }))} />
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Text strong>数量 (手)</Text>
              <InputNumber style={{ width: '100%', marginTop: 4 }} min={1} value={openForm.quantity} onChange={(v) => setOpenForm((p) => ({ ...p, quantity: v ?? 1 }))} />
            </Col>
            <Col span={8}>
              <Text strong>保证金率</Text>
              <InputNumber style={{ width: '100%', marginTop: 4 }} min={0.01} max={1} step={0.01} value={openForm.marginRate} onChange={(v) => setOpenForm((p) => ({ ...p, marginRate: v ?? 0.1 }))} />
            </Col>
            <Col span={8}>
              <Text strong>预估保证金</Text>
              <Input style={{ marginTop: 4 }} disabled value={(openForm.openPrice * openForm.quantity * openForm.marginRate).toFixed(2)} />
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong>止损价</Text>
              <Input type="number" style={{ marginTop: 4 }} placeholder="可选" value={openForm.stopLossPrice} onChange={(e) => setOpenForm((p) => ({ ...p, stopLossPrice: e.target.value }))} />
            </Col>
            <Col span={12}>
              <Text strong>止盈价</Text>
              <Input type="number" style={{ marginTop: 4 }} placeholder="可选" value={openForm.takeProfitPrice} onChange={(e) => setOpenForm((p) => ({ ...p, takeProfitPrice: e.target.value }))} />
            </Col>
          </Row>
        </Space>
      </Modal>

      {/* ── Close Position Modal ── */}
      <Modal
        title="平仓"
        open={closeModal.open}
        onCancel={() => setCloseModal((p) => ({ ...p, open: false }))}
        onOk={handleClose}
        confirmLoading={closeMutation.isPending}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text strong>平仓价格 *</Text>
            <InputNumber style={{ width: '100%', marginTop: 4 }} min={0.01} step={0.01} value={closeModal.closePrice} onChange={(v) => setCloseModal((p) => ({ ...p, closePrice: v ?? 0 }))} />
          </div>
          <div>
            <Text strong>平仓数量</Text>
            <InputNumber style={{ width: '100%', marginTop: 4 }} min={1} value={closeModal.quantity} onChange={(v) => setCloseModal((p) => ({ ...p, quantity: v ?? 1 }))} />
          </div>
          <div>
            <Text strong>平仓原因</Text>
            <Input.TextArea rows={2} value={closeModal.reason} onChange={(e) => setCloseModal((p) => ({ ...p, reason: e.target.value }))} style={{ marginTop: 4 }} />
          </div>
        </Space>
      </Modal>

      {/* ── Position Detail Drawer ── */}
      <Drawer
        title="持仓详情"
        open={Boolean(selectedPositionId)}
        onClose={() => setSelectedPositionId(undefined)}
        width={720}
      >
        {positionDetail && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="合约">{positionDetail.contractCode}</Descriptions.Item>
              <Descriptions.Item label="交易所">{positionDetail.exchange}</Descriptions.Item>
              <Descriptions.Item label="方向">
                <Tag color={directionConfig[positionDetail.direction]?.color}>{directionConfig[positionDetail.direction]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={positionStatusConfig[positionDetail.status]?.color}>{positionStatusConfig[positionDetail.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="开仓价">{positionDetail.openPrice.toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="数量">{positionDetail.quantity} (剩余 {positionDetail.remainingQty})</Descriptions.Item>
              <Descriptions.Item label="保证金">{positionDetail.marginAmount.toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="保证金率">{(positionDetail.marginRate * 100).toFixed(0)}%</Descriptions.Item>
              <Descriptions.Item label="浮动盈亏">
                <Text style={{ color: (positionDetail.floatingPnl ?? 0) >= 0 ? token.colorSuccess : token.colorError }}>
                  {positionDetail.floatingPnl?.toFixed(2) ?? '-'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="已实现盈亏">
                <Text style={{ color: (positionDetail.realizedPnl ?? 0) >= 0 ? token.colorSuccess : token.colorError }}>
                  {positionDetail.realizedPnl?.toFixed(2) ?? '-'}
                </Text>
              </Descriptions.Item>
              {positionDetail.stopLossPrice && (
                <Descriptions.Item label="止损价">{positionDetail.stopLossPrice.toFixed(2)}</Descriptions.Item>
              )}
              {positionDetail.takeProfitPrice && (
                <Descriptions.Item label="止盈价">{positionDetail.takeProfitPrice.toFixed(2)}</Descriptions.Item>
              )}
              <Descriptions.Item label="开仓时间" span={2}>
                {new Date(positionDetail.openedAt).toLocaleString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>

            {Array.isArray(positionDetail.trades) && positionDetail.trades.length > 0 && (
              <Card title="关联成交" size="small">
                <Table<VirtualTradeLedgerDto>
                  rowKey="id"
                  dataSource={positionDetail.trades}
                  columns={tradeColumns}
                  pagination={false}
                  size="small"
                  scroll={{ x: 700 }}
                />
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </Space>
  );
};

import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Flex,
  Form,
  Input,
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
  Timeline,
  Tooltip,
  Typography,
  InputNumber,
  Switch,
  Divider,
  theme,
} from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  RollbackOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type {
  CreateParameterItemDto,
  CreateParameterSetDto,
  ParameterChangeLogDto,
  ParameterImpactPreviewDto,
  ParameterItemDto,
  ParameterOverrideDiffItemDto,
  ParameterScopeLevel,
  ParameterSetDto,
  WorkflowTemplateSource,
} from '@packages/types';
import { ParameterDiffView, ParameterInheritanceStatus, ParameterResolutionPreview } from './index';
import {
  useParameterSetViewModel,
  scopeOptions,
  paramTypeOptions,
  scopeColorMap,
  operationColorMap,
  getTemplateSourceLabel,
  getScopeLabel,
  getActiveStatusLabel,
  isPublished,
  formatValue,
  slugifyParamCode,
} from './useParameterSetViewModel';

const { Title } = Typography;

export const ParameterSetPage: React.FC = () => {
  const { token } = theme.useToken();
  const vm = useParameterSetViewModel();

  const setColumns = useMemo<ColumnsType<ParameterSetDto>>(
    () => [
      { title: '名称', dataIndex: 'name', width: 220 },
      {
        title: '来源',
        dataIndex: 'templateSource',
        width: 100,
        render: (value: string) => (
          <Tag color={value === 'PUBLIC' ? 'blue' : 'default'}>
            {getTemplateSourceLabel(value as WorkflowTemplateSource)}
          </Tag>
        ),
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{getActiveStatusLabel(value)}</Tag>
        ),
      },
      {
        title: '版本',
        dataIndex: 'version',
        width: 90,
        render: (value: number) => (
          <Tag color={isPublished(value) ? 'green' : 'orange'}>{value}</Tag>
        ),
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
      {
        title: '操作',
        key: 'actions',
        width: 260,
        render: (_, record) => (
          <Space size={4}>
            <Button type="link" onClick={() => { vm.setters.setSelectedSetId(record.id); vm.setters.setDetailTab('items'); }}>
              查看详情
            </Button>
            <Popconfirm
              title="确认发布该参数包?"
              onConfirm={() => vm.actions.handlePublishSet(record)}
              disabled={!record.isActive || isPublished(record.version)}
            >
              <Button
                type="link"
                disabled={!record.isActive || isPublished(record.version)}
                loading={vm.mutations.publishSetMutation.isPending && vm.state.publishingSetId === record.id}
              >
                {isPublished(record.version) ? '已发布' : '发布'}
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认停用该参数包?"
              onConfirm={async () => {
                await vm.mutations.deleteSetMutation.mutateAsync(record.id);
              }}
              disabled={!record.isActive}
            >
              <Button type="link" danger disabled={!record.isActive}>
                停用
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [vm.actions, vm.mutations.deleteSetMutation, vm.mutations.publishSetMutation.isPending, vm.setters, vm.state.publishingSetId],
  );

  const itemColumns = useMemo<ColumnsType<ParameterItemDto>>(
    () => [
      { title: '名称', dataIndex: 'paramName', width: 180 },
      { title: '类型', dataIndex: 'paramType', width: 90 },
      {
        title: '作用域',
        dataIndex: 'scopeLevel',
        width: 140,
        render: (value: string) => (
          <Tag color={scopeColorMap[value] || 'default'}>{getScopeLabel(value)}</Tag>
        ),
      },
      { title: '作用域值', dataIndex: 'scopeValue', width: 100, render: (v?: string) => v || '-' },
      {
        title: '当前值',
        dataIndex: 'value',
        width: 120,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '默认值',
        dataIndex: 'defaultValue',
        width: 120,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '继承状态',
        key: 'inheritStatus',
        width: 120,
        render: (_, record) => {
          const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
          return (
            <ParameterInheritanceStatus
              defaultValue={record.defaultValue}
              currentValue={record.value}
              hasDefault={hasDefault}
            />
          );
        },
      },
      {
        title: '状态',
        dataIndex: 'isActive',
        width: 80,
        render: (value: boolean) => (
          <Tag color={value ? 'green' : 'red'}>{getActiveStatusLabel(value)}</Tag>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_, record) => {
          const hasDefault = record.defaultValue !== null && record.defaultValue !== undefined;
          const isOverridden = hasDefault && record.value !== null && record.value !== undefined &&
            JSON.stringify(record.value) !== JSON.stringify(record.defaultValue);
          return (
            <Space size={4}>
              <Button type="link" size="small" onClick={() => vm.actions.openEditItem(record)}>
                编辑
              </Button>
              <Popconfirm
                title="确认重置到默认值?"
                onConfirm={() => vm.actions.handleResetItem(record.id)}
                disabled={!isOverridden}
              >
                <Button type="link" size="small" disabled={!isOverridden}>
                  重置
                </Button>
              </Popconfirm>
            </Space>
          );
        },
      },
    ],
    [vm.actions],
  );

  const diffColumns = useMemo<ColumnsType<ParameterOverrideDiffItemDto>>(
    () => [
      { title: '名称', dataIndex: 'paramName', width: 180 },
      {
        title: '作用域',
        dataIndex: 'scopeLevel',
        width: 130,
        render: (value: string) => <Tag color={scopeColorMap[value] || 'default'}>{getScopeLabel(value)}</Tag>,
      },
      {
        title: '模板默认值',
        dataIndex: 'templateDefault',
        width: 150,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '当前值',
        dataIndex: 'currentValue',
        width: 150,
        render: (value: unknown, record: Record<string, unknown>) => (
          <span style={{ color: record.isOverridden ? token.colorWarning : undefined, fontWeight: record.isOverridden ? 600 : undefined }}>
            {formatValue(value)}
          </span>
        ),
      },
      {
        title: '覆盖状态',
        dataIndex: 'isOverridden',
        width: 100,
        render: (value: boolean) => (
          <Tag color={value ? 'orange' : 'green'}>{value ? '已覆盖' : '继承'}</Tag>
        ),
      },
      {
        title: '覆盖来源',
        dataIndex: 'overrideSource',
        width: 120,
        render: (value?: string) => value || '-',
      },
    ],
    [token.colorWarning],
  );

  const auditColumns = useMemo<ColumnsType<ParameterChangeLogDto>>(
    () => [
      {
        title: '操作',
        dataIndex: 'operation',
        width: 130,
        render: (value: string) => (
          <Tag color={operationColorMap[value] || 'default'}>{value}</Tag>
        ),
      },
      { title: '字段', dataIndex: 'fieldPath', width: 120, render: (v?: string) => v || '-' },
      {
        title: '旧值',
        dataIndex: 'oldValue',
        width: 150,
        render: (value: unknown) => formatValue(value),
      },
      {
        title: '新值',
        dataIndex: 'newValue',
        width: 150,
        render: (value: unknown) => formatValue(value),
      },
      { title: '变更原因', dataIndex: 'changeReason', ellipsis: true, render: (v?: string) => v || '-' },
      { title: '操作人', dataIndex: 'changedByUserId', width: 120 },
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value?: Date) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'),
      },
    ],
    [],
  );

  const renderDynamicInput = (type?: string, placeholder?: string) => {
    if (type === 'boolean') {
      return <Switch checkedChildren="True" unCheckedChildren="False" />;
    }
    if (type === 'number') {
      return <InputNumber style={{ width: '100%' }} placeholder={placeholder} />;
    }
    if (type === 'json' || type === 'expression') {
      return <Input.TextArea rows={3} placeholder={placeholder} />;
    }
    return <Input placeholder={placeholder} />;
  };

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            参数中心
          </Title>
          <Space>
            <Input.Search
              allowClear
              placeholder="按编码/名称搜索"
              value={vm.state.keywordInput}
              onChange={(event) => {
                const nextValue = event.target.value;
                vm.setters.setKeywordInput(nextValue);
                if (!nextValue.trim()) { vm.setters.setKeyword(undefined); vm.setters.setPage(1); }
              }}
              onSearch={(value) => {
                const normalized = value?.trim() || '';
                vm.setters.setKeywordInput(normalized);
                vm.setters.setKeyword(normalized || undefined);
                vm.setters.setPage(1);
              }}
              style={{ width: 260 }}
            />
            <Select
              allowClear
              style={{ width: 140 }}
              placeholder="状态筛选"
              options={[
                { label: getActiveStatusLabel(true), value: true },
                { label: getActiveStatusLabel(false), value: false },
              ]}
              value={vm.state.isActiveFilter}
              onChange={(value) => { vm.setters.setIsActiveFilter(value); vm.setters.setPage(1); }}
            />
            <Button onClick={() => vm.setters.setCompareVisible(true)}>
              版本对比
            </Button>
            <Button type="primary" onClick={() => vm.setters.setCreateVisible(true)}>
              新建参数包
            </Button>
          </Space>
        </Space>

        <div ref={vm.refs.setTableContainerRef}>
          <Table<ParameterSetDto>
            rowKey="id"
            loading={vm.data.isLoading}
            dataSource={vm.data.data?.data ?? []}
            columns={setColumns}
            onRow={(record) =>
              record.id === vm.computed.highlightedSetId
                ? { style: { backgroundColor: token.colorWarningBg || token.colorWarningBg } }
                : {}
            }
            scroll={{ x: 1400 }}
            pagination={{
              current: vm.data.data?.page ?? vm.state.page,
              pageSize: vm.data.data?.pageSize ?? vm.state.pageSize,
              total: vm.data.data?.total ?? 0,
              showSizeChanger: true,
              onChange: (nextPage, nextPageSize) => { vm.setters.setPage(nextPage); vm.setters.setPageSize(nextPageSize); },
            }}
          />
        </div>
      </Space>

      <Modal
        title="新建参数包"
        open={vm.state.createVisible}
        onCancel={() => vm.setters.setCreateVisible(false)}
        onOk={vm.actions.handleCreateSet}
        confirmLoading={vm.mutations.createSetMutation.isPending}
      >
        <Form<CreateParameterSetDto>
          layout="vertical"
          form={vm.state.setForm}
          initialValues={{ templateSource: 'PRIVATE' }}
        >
          <Form.Item name="setCode" label="参数包编码" rules={[{ required: true }]}>
            <Input placeholder="如 BASELINE_SET" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="templateSource" label="模板来源" rules={[{ required: true }]}>
            <Select
              options={[
                { label: getTemplateSourceLabel('PRIVATE'), value: 'PRIVATE' },
                { label: getTemplateSourceLabel('PUBLIC'), value: 'PUBLIC' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="参数包详情"
        width="85%"
        open={Boolean(vm.state.selectedSetId)}
        onClose={() => { vm.setters.setSelectedSetId(null); vm.setters.setSelectedItemIds([]); }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <Typography.Title level={4} style={{ margin: 0 }}>{vm.data.setDetail?.name || '-'}</Typography.Title>
              <Tag color={vm.data.setDetail?.isActive ? 'green' : 'red'}>
                {getActiveStatusLabel(vm.data.setDetail?.isActive)}
              </Tag>
              <Tag color={isPublished(vm.data.setDetail?.version) ? 'green' : 'orange'}>
                {isPublished(vm.data.setDetail?.version) ? '已发布' : '未发布'}
              </Tag>
              <Tag>版本 {vm.data.setDetail?.version ?? '-'}</Tag>
              {vm.data.setDetail?.templateSource === 'PUBLIC' && (
                <Tooltip title="继承自公共模板">
                  <Tag color="blue" icon={<CheckCircleOutlined />}>公共模板</Tag>
                </Tooltip>
              )}
            </Space>
            <Space>
              {vm.state.selectedItemIds.length > 0 && (
                <Popconfirm
                  title={`确认批量重置 ${vm.state.selectedItemIds.length} 个参数项到默认值?`}
                  onConfirm={vm.actions.handleBatchReset}
                >
                  <Button danger loading={vm.mutations.batchResetMutation.isPending}>
                    批量重置 ({vm.state.selectedItemIds.length})
                  </Button>
                </Popconfirm>
              )}
              <Button type="primary" onClick={() => vm.setters.setItemVisible(true)}>
                新建参数项
              </Button>
            </Space>
          </Space>

          <Space wrap>
            <Select<ParameterScopeLevel>
              allowClear
              style={{ width: 220 }}
              placeholder="按作用域批量重置"
              value={vm.state.scopeResetLevel}
              options={scopeOptions.map((item) => ({ label: getScopeLabel(item), value: item }))}
              onChange={(value) => vm.setters.setScopeResetLevel(value)}
            />
            <Input
              style={{ width: 220 }}
              placeholder="作用域值(可选)"
              value={vm.state.scopeResetValue}
              onChange={(event) => vm.setters.setScopeResetValue(event.target.value)}
            />
            <Popconfirm
              title="确认按当前作用域批量重置到默认值?"
              onConfirm={vm.actions.handleScopeBatchReset}
              disabled={!vm.state.scopeResetLevel}
            >
              <Button disabled={!vm.state.scopeResetLevel} loading={vm.mutations.batchResetMutation.isPending}>
                按作用域批量重置
              </Button>
            </Popconfirm>
          </Space>

          {/* Override Impact Summary */}
          {vm.data.setDetail && (
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic title="参数总数" value={vm.computed.overrideSummary.total} />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="继承模板"
                    value={vm.computed.overrideSummary.inherited}
                    valueStyle={{ color: token.colorSuccess }}
                    prefix={<CheckCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="已覆盖"
                    value={vm.computed.overrideSummary.overridden}
                    valueStyle={{ color: token.colorWarning }}
                    prefix={<WarningOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Tooltip title="已覆盖参数项占比">
                    <Statistic
                      title="覆盖率"
                      value={vm.computed.overrideSummary.overrideRate}
                      suffix="%"
                      valueStyle={{ color: vm.computed.overrideSummary.overrideRate > 50 ? token.colorWarning : token.colorSuccess }}
                    />
                  </Tooltip>
                </Card>
              </Col>
            </Row>
          )}

          <Tabs
            activeKey={vm.state.detailTab}
            onChange={vm.setters.setDetailTab}
            items={[
              {
                key: 'items',
                label: '参数列表',
                children: (
                  <Table<ParameterItemDto>
                    rowKey="id"
                    loading={vm.data.isDetailLoading}
                    dataSource={vm.data.setDetail?.items ?? []}
                    columns={itemColumns}
                    pagination={false}
                    scroll={{ x: 1400 }}
                    rowSelection={{
                      selectedRowKeys: vm.state.selectedItemIds,
                      onChange: (keys) => vm.setters.setSelectedItemIds(keys as string[]),
                      getCheckboxProps: (record) => ({
                        disabled: !(
                          record.defaultValue !== null &&
                          record.defaultValue !== undefined &&
                          record.value !== null &&
                          record.value !== undefined &&
                          JSON.stringify(record.value) !== JSON.stringify(record.defaultValue)
                        ),
                      }),
                    }}
                  />
                ),
              },
              {
                key: 'diff',
                label: `覆盖对比${vm.data.overrideDiff ? ` (${vm.data.overrideDiff.overriddenCount}/${vm.data.overrideDiff.totalCount})` : ''}`,
                children: (
                  <Table<ParameterOverrideDiffItemDto>
                    rowKey="paramCode"
                    loading={vm.data.isDiffLoading}
                    dataSource={vm.data.overrideDiff?.items ?? []}
                    columns={diffColumns}
                    pagination={false}
                    scroll={{ x: 1100 }}
                  />
                ),
              },
              {
                key: 'impact',
                label: '影响预览',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <Row gutter={[16, 16]}>
                      <Col xs={12} sm={6}>
                        <Card size="small">
                          <Statistic
                            title="受影响流程"
                            value={vm.data.impactPreview?.workflowCount ?? 0}
                            loading={vm.data.isImpactLoading}
                          />
                        </Card>
                      </Col>
                      <Col xs={12} sm={6}>
                        <Card size="small">
                          <Statistic
                            title="受影响 Agent"
                            value={vm.data.impactPreview?.agentCount ?? 0}
                            loading={vm.data.isImpactLoading}
                          />
                        </Card>
                      </Col>
                    </Row>

                    <Card size="small" title="流程影响列表">
                      <Table<ParameterImpactPreviewDto['workflows'][number]>
                        rowKey="workflowVersionId"
                        loading={vm.data.isImpactLoading}
                        dataSource={vm.data.impactPreview?.workflows ?? []}
                        pagination={{ pageSize: 8 }}
                        columns={[
                          { title: '流程编码', dataIndex: 'workflowCode', width: 180 },
                          { title: '流程名称', dataIndex: 'workflowName', width: 220 },
                          { title: '版本', dataIndex: 'versionCode', width: 120, render: (v) => <Tag>{v}</Tag> },
                        ]}
                      />
                    </Card>

                    <Card size="small" title="Agent 影响列表">
                      <Table<ParameterImpactPreviewDto['agents'][number]>
                        rowKey="id"
                        loading={vm.data.isImpactLoading}
                        dataSource={vm.data.impactPreview?.agents ?? []}
                        pagination={{ pageSize: 8 }}
                        columns={[
                          { title: 'Agent 编码', dataIndex: 'agentCode', width: 200 },
                          { title: '名称', dataIndex: 'agentName', width: 180 },
                          { title: '角色', dataIndex: 'roleType', width: 160, render: (v) => <Tag>{v}</Tag> },
                        ]}
                      />
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'simulator',
                label: '继承模拟',
                children: vm.state.selectedSetId ? (
                  <ParameterResolutionPreview parameterSetId={vm.state.selectedSetId} />
                ) : null,
              },
              {
                key: 'audit',
                label: '变更审计',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={12}>
                    <Flex justify="flex-end">
                      <Select
                        style={{ width: 120 }}
                        value={vm.state.auditViewMode}
                        onChange={vm.setters.setAuditViewMode}
                        options={[
                          { label: '表格视图', value: 'table' },
                          { label: '时间线', value: 'timeline' },
                        ]}
                      />
                    </Flex>
                    {vm.state.auditViewMode === 'table' ? (
                      <Table<ParameterChangeLogDto>
                        rowKey="id"
                        loading={vm.data.isLogsLoading}
                        dataSource={vm.data.changeLogs?.data ?? []}
                        columns={auditColumns}
                        scroll={{ x: 1100 }}
                        pagination={{
                          current: vm.data.changeLogs?.page ?? vm.state.logPage,
                          pageSize: 20,
                          total: vm.data.changeLogs?.total ?? 0,
                          onChange: (nextPage) => vm.setters.setLogPage(nextPage),
                        }}
                      />
                    ) : (
                      <>
                        <Timeline
                          items={(vm.data.changeLogs?.data ?? []).map((log) => ({
                            key: log.id,
                            color: operationColorMap[log.operation] === 'green'
                              ? 'green'
                              : operationColorMap[log.operation] === 'red'
                                ? 'red'
                                : operationColorMap[log.operation] === 'purple'
                                  ? 'purple' as unknown as undefined
                                  : 'blue',
                            dot: log.operation === 'PUBLISH'
                              ? <CheckCircleOutlined />
                              : log.operation === 'DELETE'
                                ? <WarningOutlined />
                                : log.operation === 'RESET_TO_DEFAULT' || log.operation === 'BATCH_RESET'
                                  ? <RollbackOutlined />
                                  : <EditOutlined />,
                            children: (
                              <Card size="small" style={{ marginBottom: 4 }}>
                                <Flex justify="space-between" align="center" style={{ marginBottom: 4 }}>
                                  <Space size={4}>
                                    <Tag color={operationColorMap[log.operation] || 'default'}>
                                      {log.operation}
                                    </Tag>
                                    {log.fieldPath && (
                                      <Tag>{log.fieldPath}</Tag>
                                    )}
                                  </Space>
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {log.createdAt
                                      ? dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')
                                      : '-'}
                                  </Typography.Text>
                                </Flex>
                                {(log.oldValue !== null && log.oldValue !== undefined) && (
                                  <Flex gap={8} style={{ fontSize: 12 }}>
                                    <Typography.Text type="secondary">旧值:</Typography.Text>
                                    <Typography.Text delete>{formatValue(log.oldValue)}</Typography.Text>
                                    <Typography.Text type="secondary">→</Typography.Text>
                                    <Typography.Text strong>{formatValue(log.newValue)}</Typography.Text>
                                  </Flex>
                                )}
                                {log.changeReason && (
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    原因: {log.changeReason}
                                  </Typography.Text>
                                )}
                                {log.changedByUserId && (
                                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                                    操作人: {log.changedByUserId}
                                  </Typography.Text>
                                )}
                              </Card>
                            ),
                          }))}
                        />
                        <Flex justify="center">
                          <Button
                            type="link"
                            disabled={vm.state.logPage <= 1}
                            onClick={() => vm.setters.setLogPage((prev) => Math.max(prev - 1, 1))}
                          >
                            上一页
                          </Button>
                          <Typography.Text type="secondary" style={{ lineHeight: '32px' }}>
                            {vm.data.changeLogs?.page ?? vm.state.logPage} / {Math.ceil((vm.data.changeLogs?.total ?? 0) / 20) || 1}
                          </Typography.Text>
                          <Button
                            type="link"
                            disabled={(vm.data.changeLogs?.page ?? vm.state.logPage) >= Math.ceil((vm.data.changeLogs?.total ?? 0) / 20)}
                            onClick={() => vm.setters.setLogPage((prev) => prev + 1)}
                          >
                            下一页
                          </Button>
                        </Flex>
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Space>
      </Drawer>

      <Modal
        title="参数版本/集合对比"
        open={vm.state.compareVisible}
        onCancel={() => vm.setters.setCompareVisible(false)}
        width={1100}
        footer={null}
        destroyOnClose
      >
        <ParameterDiffView
          initialLeftId={vm.state.selectedSetId || undefined}
          parameterSets={vm.data.data?.data || []}
        />
      </Modal>

      <Modal
        title={`编辑参数项${vm.state.editingItem ? ` - ${vm.state.editingItem.paramCode}` : ''}`}
        open={vm.state.editItemVisible}
        onCancel={() => {
          vm.setters.setEditItemVisible(false);
          vm.setters.setEditingItem(null);
        }}
        onOk={vm.actions.handleUpdateItem}
        confirmLoading={vm.mutations.updateItemMutation.isPending}
        width={720}
      >
        <Form layout="vertical" form={vm.state.editItemForm}>
          <Typography.Title level={5}>基本信息</Typography.Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="paramName" label="参数名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paramType" label="参数类型" rules={[{ required: true }]}>
                <Select options={paramTypeOptions.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="单位">
                <Input allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="source" label="来源">
                <Input allowClear placeholder="例如: 业务规则V1, 外部API" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>作用域</Typography.Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="scopeLevel" label="作用域层级" rules={[{ required: true }]}>
                <Select options={scopeOptions.map((item) => ({ label: getScopeLabel(item), value: item }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="scopeValue" label="作用域值">
                <Input placeholder="例如: USER_XYZ, REGION_CN" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>数值设定</Typography.Title>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.paramType !== curr.paramType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('paramType');
              return (
                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item name="value" label="当前值" valuePropName={type === 'boolean' ? 'checked' : 'value'}>
                      {renderDynamicInput(type, '覆盖后的实际生效值')}
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item name="defaultValue" label="默认值" valuePropName={type === 'boolean' ? 'checked' : 'value'}>
                      {renderDynamicInput(type, '若未被覆盖，将继承此默认值')}
                    </Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>约束条件</Typography.Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="minValueText" label="最小值 (JSON/Text)">
                <Input placeholder="例如: 0, 1.5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxValueText" label="最大值 (JSON/Text)">
                <Input placeholder="例如: 100, 99.9" />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />
          <Typography.Title level={5}>变更审计</Typography.Title>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="changeReason" label="变更原因">
                <Input.TextArea rows={1} placeholder="请简述本次修改的原因" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isActive" label="启用状态">
                <Select
                  options={[
                    { label: getActiveStatusLabel(true), value: true },
                    { label: getActiveStatusLabel(false), value: false },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="新建参数项"
        open={vm.state.itemVisible}
        onCancel={() => {
          vm.setters.setItemVisible(false);
          vm.setters.setIsParamCodeCustomized(false);
        }}
        onOk={vm.actions.handleCreateItem}
        confirmLoading={vm.mutations.createItemMutation.isPending}
      >
        <Form<CreateParameterItemDto>
          layout="vertical"
          form={vm.state.itemForm}
          initialValues={{ scopeLevel: 'GLOBAL', paramType: 'number' }}
          onValuesChange={(changedValues, allValues) => {
            const changedName = changedValues.paramName as string | undefined;
            if (changedName !== undefined && !vm.state.isParamCodeCustomized) {
              const generatedCode = slugifyParamCode(changedName);
              vm.state.itemForm.setFieldsValue({ paramCode: generatedCode || undefined });
            }
            const changedCode = changedValues.paramCode as string | undefined;
            if (changedCode !== undefined) {
              const generatedCode = slugifyParamCode(allValues.paramName as string | undefined);
              const normalized = changedCode.trim();
              if (!normalized) {
                vm.setters.setIsParamCodeCustomized(false);
              } else {
                vm.setters.setIsParamCodeCustomized(Boolean(generatedCode && normalized !== generatedCode));
              }
            }
          }}
        >
          <Form.Item name="paramCode" label="参数编码" rules={[{ required: true }]}>
            <Input
              addonAfter={(
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    const generatedCode = slugifyParamCode(vm.state.itemForm.getFieldValue('paramName'));
                    vm.state.itemForm.setFieldsValue({ paramCode: generatedCode || undefined });
                    vm.setters.setIsParamCodeCustomized(false);
                  }}
                >
                  自动生成
                </Button>
              )}
            />
          </Form.Item>
          <Form.Item name="paramName" label="参数名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="paramType" label="参数类型" rules={[{ required: true }]}>
            <Select options={paramTypeOptions.map((item) => ({ label: item, value: item }))} />
          </Form.Item>
          <Form.Item name="scopeLevel" label="作用域" rules={[{ required: true }]}>
            <Select options={scopeOptions.map((item) => ({ label: getScopeLabel(item), value: item }))} />
          </Form.Item>
          <Form.Item name="scopeValue" label="作用域值">
            <Input />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.paramType !== curr.paramType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('paramType');
              return (
                <>
                  <Form.Item
                    name="defaultValue"
                    label={type === 'json' || type === 'expression' ? '默认值(JSON或文本)' : '默认值'}
                    valuePropName={type === 'boolean' ? 'checked' : 'value'}
                  >
                    {renderDynamicInput(type, '设置模板默认值')}
                  </Form.Item>
                  <Form.Item
                    name="value"
                    label={type === 'json' || type === 'expression' ? '值(JSON或文本)' : '值'}
                    valuePropName={type === 'boolean' ? 'checked' : 'value'}
                  >
                    {renderDynamicInput(type, '设置当前值')}
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

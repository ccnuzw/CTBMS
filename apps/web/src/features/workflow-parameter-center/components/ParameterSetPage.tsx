import React, { useMemo } from 'react';
import { useWorkflowUxMode } from '../../../hooks/useWorkflowUxMode';
import dayjs from 'dayjs';
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
  Collapse,
  theme,
} from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  RollbackOutlined,
  WarningOutlined,
  PlusOutlined,
  MinusCircleOutlined,
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
import { ParameterDiffView, ParameterResolutionPreview } from './index';
import {
  useParameterSetViewModel,
  scopeOptions,
  paramTypeOptions,
  operationColorMap,
  getTemplateSourceLabel,
  getScopeLabel,
  getActiveStatusLabel,
  isPublished,
  formatValue,
  slugifyParamCode,
} from './useParameterSetViewModel';
import {
  buildSetColumns,
  buildItemColumns,
  buildDiffColumns,
  buildAuditColumns,
  renderDynamicInput,
} from './parameterSetColumns';

const { Title } = Typography;

export const ParameterSetPage: React.FC = () => {
  const { token } = theme.useToken();
  const vm = useParameterSetViewModel();
  const uxMode = useWorkflowUxMode((s) => s.mode);
  const isSimple = uxMode === 'simple';
  const isExpert = uxMode === 'expert';

  const setColumns = useMemo(
    () => buildSetColumns({ actions: vm.actions, setters: vm.setters, mutations: vm.mutations, state: vm.state }),
    [vm.actions, vm.mutations.deleteSetMutation, vm.mutations.publishSetMutation.isPending, vm.setters, vm.state.publishingSetId],
  );

  const itemColumns = useMemo(
    () => buildItemColumns({ actions: vm.actions }),
    [vm.actions],
  );

  const diffColumns = useMemo(
    () => buildDiffColumns(token.colorWarning),
    [token.colorWarning],
  );

  const auditColumns = useMemo(
    () => buildAuditColumns(),
    [],
  );

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
              placeholder={isSimple ? '搜索参数包' : '按编码/名称搜索'}
              value={vm.state.keywordInput}
              onChange={(event) => {
                const nextValue = event.target.value;
                vm.setters.setKeywordInput(nextValue);
                if (!nextValue.trim()) {
                  vm.setters.setKeyword(undefined);
                  vm.setters.setPage(1);
                }
              }}
              onSearch={(value) => {
                const normalized = value?.trim() || '';
                vm.setters.setKeywordInput(normalized);
                vm.setters.setKeyword(normalized || undefined);
                vm.setters.setPage(1);
              }}
              style={{ width: 260 }}
            />
            {!isSimple && (
              <Select
                allowClear
                style={{ width: 140 }}
                placeholder="状态筛选"
                options={[
                  { label: getActiveStatusLabel(true), value: true },
                  { label: getActiveStatusLabel(false), value: false },
                ]}
                value={vm.state.isActiveFilter}
                onChange={(value) => {
                  vm.setters.setIsActiveFilter(value);
                  vm.setters.setPage(1);
                }}
              />
            )}
            {isExpert && <Button onClick={() => vm.setters.setCompareVisible(true)}>版本对比</Button>}
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
              onChange: (nextPage, nextPageSize) => {
                vm.setters.setPage(nextPage);
                vm.setters.setPageSize(nextPageSize);
              },
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
          {!isSimple && (
            <Form.Item name="setCode" label="参数包编码" rules={[{ required: true }]}>
              <Input placeholder="如 BASELINE_SET" />
            </Form.Item>
          )}
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          {!isSimple && (
            <Form.Item name="templateSource" label="模板来源" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: getTemplateSourceLabel('PRIVATE'), value: 'PRIVATE' },
                  { label: getTemplateSourceLabel('PUBLIC'), value: 'PUBLIC' },
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer
        title="参数包详情"
        width="85%"
        open={Boolean(vm.state.selectedSetId)}
        onClose={() => {
          vm.setters.setSelectedSetId(null);
          vm.setters.setSelectedItemIds([]);
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {vm.data.setDetail?.name || '-'}
              </Typography.Title>
              <Tag color={vm.data.setDetail?.isActive ? 'green' : 'red'}>
                {getActiveStatusLabel(vm.data.setDetail?.isActive)}
              </Tag>
              <Tag color={isPublished(vm.data.setDetail?.version) ? 'green' : 'orange'}>
                {isPublished(vm.data.setDetail?.version) ? '已发布' : '未发布'}
              </Tag>
              <Tag>版本 {vm.data.setDetail?.version ?? '-'}</Tag>
              {vm.data.setDetail?.templateSource === 'PUBLIC' && (
                <Tooltip title="继承自公共模板">
                  <Tag color="blue" icon={<CheckCircleOutlined />}>
                    公共模板
                  </Tag>
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

          {!isSimple && (
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
                <Button
                  disabled={!vm.state.scopeResetLevel}
                  loading={vm.mutations.batchResetMutation.isPending}
                >
                  按作用域批量重置
                </Button>
              </Popconfirm>
            </Space>
          )}

          {/* Override Impact Summary */}
          {vm.data.setDetail && !isSimple && (
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
                      valueStyle={{
                        color:
                          vm.computed.overrideSummary.overrideRate > 50
                            ? token.colorWarning
                            : token.colorSuccess,
                      }}
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
              ...(!isSimple ? [
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
                            {
                              title: '版本',
                              dataIndex: 'versionCode',
                              width: 120,
                              render: (v) => <Tag>{v}</Tag>,
                            },
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
                            {
                              title: '角色',
                              dataIndex: 'roleType',
                              width: 160,
                              render: (v) => <Tag>{v}</Tag>,
                            },
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
                              color:
                                operationColorMap[log.operation] === 'green'
                                  ? 'green'
                                  : operationColorMap[log.operation] === 'red'
                                    ? 'red'
                                    : operationColorMap[log.operation] === 'purple'
                                      ? ('purple' as unknown as undefined)
                                      : 'blue',
                              dot:
                                log.operation === 'PUBLISH' ? (
                                  <CheckCircleOutlined />
                                ) : log.operation === 'DELETE' ? (
                                  <WarningOutlined />
                                ) : log.operation === 'RESET_TO_DEFAULT' ||
                                  log.operation === 'BATCH_RESET' ? (
                                  <RollbackOutlined />
                                ) : (
                                  <EditOutlined />
                                ),
                              children: (
                                <Card size="small" style={{ marginBottom: 4 }}>
                                  <Flex
                                    justify="space-between"
                                    align="center"
                                    style={{ marginBottom: 4 }}
                                  >
                                    <Space size={4}>
                                      <Tag color={operationColorMap[log.operation] || 'default'}>
                                        {log.operation}
                                      </Tag>
                                      {log.fieldPath && <Tag>{log.fieldPath}</Tag>}
                                    </Space>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                      {log.createdAt
                                        ? dayjs(log.createdAt).format('YYYY-MM-DD HH:mm:ss')
                                        : '-'}
                                    </Typography.Text>
                                  </Flex>
                                  {log.oldValue !== null && log.oldValue !== undefined && (
                                    <Flex gap={8} style={{ fontSize: 12 }}>
                                      <Typography.Text type="secondary">旧值:</Typography.Text>
                                      <Typography.Text delete>
                                        {formatValue(log.oldValue)}
                                      </Typography.Text>
                                      <Typography.Text type="secondary">→</Typography.Text>
                                      <Typography.Text strong>
                                        {formatValue(log.newValue)}
                                      </Typography.Text>
                                    </Flex>
                                  )}
                                  {log.changeReason && (
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                      原因: {log.changeReason}
                                    </Typography.Text>
                                  )}
                                  {log.changedByUserId && (
                                    <Typography.Text
                                      type="secondary"
                                      style={{ fontSize: 11, display: 'block' }}
                                    >
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
                              {vm.data.changeLogs?.page ?? vm.state.logPage} /{' '}
                              {Math.ceil((vm.data.changeLogs?.total ?? 0) / 20) || 1}
                            </Typography.Text>
                            <Button
                              type="link"
                              disabled={
                                (vm.data.changeLogs?.page ?? vm.state.logPage) >=
                                Math.ceil((vm.data.changeLogs?.total ?? 0) / 20)
                              }
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
              ] : []),
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
        <Form layout="vertical" form={vm.state.editItemForm as any}>
          <Typography.Title level={5}>基本信息</Typography.Title>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="paramName" label="参数名称 (中文)" rules={[{ required: true }]}>
                <Input placeholder="例: 最大重试次数" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paramType" label="数据类型" rules={[{ required: true }]}>
                <Select options={paramTypeOptions.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.paramType !== curr.paramType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('paramType');
              return (
                <>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="defaultValue"
                        label="模板默认值"
                        valuePropName={type === 'boolean' ? 'checked' : 'value'}
                      >
                        {renderDynamicInput(type, '若未被覆盖，将继承此默认值')}
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="value"
                        label="当前实际生效值"
                        valuePropName={type === 'boolean' ? 'checked' : 'value'}
                      >
                        {renderDynamicInput(type, '覆盖后的当前实际生效值')}
                      </Form.Item>
                    </Col>
                  </Row>
                  {type === 'number' && (
                    <Row
                      gutter={16}
                      style={{
                        backgroundColor: token.colorFillAlter,
                        padding: '12px 12px 0 12px',
                        borderRadius: 6,
                        marginBottom: 16,
                      }}
                    >
                      <Col span={8}>
                        <Form.Item name="numberMin" label="最小值限制">
                          <InputNumber style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="numberMax" label="最大值限制">
                          <InputNumber style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="numberStep" label="递增步长">
                          <InputNumber style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                  {type === 'enum' && (
                    <div
                      style={{
                        backgroundColor: token.colorFillAlter,
                        padding: '12px 12px 0 12px',
                        borderRadius: 6,
                        marginBottom: 16,
                      }}
                    >
                      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                        选项配置管理
                      </Typography.Text>
                      <Form.List name="selectOptions">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map(({ key, name, ...restField }) => (
                              <Space
                                key={key}
                                style={{ display: 'flex', marginBottom: 8 }}
                                align="baseline"
                              >
                                <Form.Item
                                  {...restField}
                                  name={[name, 'label']}
                                  rules={[{ required: true, message: '必填' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="下拉可见展示名" />
                                </Form.Item>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'value']}
                                  rules={[{ required: true, message: '必填' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="后端实际取值" />
                                </Form.Item>
                                <MinusCircleOutlined
                                  onClick={() => remove(name)}
                                  style={{ color: token.colorError }}
                                />
                              </Space>
                            ))}
                            <Form.Item>
                              <Button
                                type="dashed"
                                onClick={() => add()}
                                block
                                icon={<PlusOutlined />}
                              >
                                新增选项项目
                              </Button>
                            </Form.Item>
                          </>
                        )}
                      </Form.List>
                    </div>
                  )}
                </>
              );
            }}
          </Form.Item>

          {!isSimple && (
            <Collapse
              ghost
              style={{ backgroundColor: token.colorFillQuaternary, borderRadius: 8, marginTop: 16 }}
            >
              <Collapse.Panel key="advanced" header="⚙️ 高级配置 (按需展开)">
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  专业开发选项 / 数据源配置
                </Typography.Text>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="scopeLevel" label="作用域层级" rules={[{ required: true }]}>
                      <Select
                        options={scopeOptions.map((item) => ({
                          label: getScopeLabel(item),
                          value: item,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="scopeValue" label="限定作用域值">
                      <Input placeholder="填入 ID 覆盖范围, 留空则全覆盖" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="unit" label="数值单位">
                      <Input allowClear />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="source" label="参数定义来源">
                      <Input allowClear placeholder="例如: 业务规则V1, 外部API" />
                    </Form.Item>
                  </Col>
                </Row>
                <Divider style={{ margin: '8px 0' }} />
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item name="uiComponent" label="UI 控件覆盖渲染">
                      <Select
                        allowClear
                        options={[
                          { label: '默认输入 (Input)', value: 'input' },
                          { label: '数字输入框 (NumberInput)', value: 'number-input' },
                          { label: '短滑块 (Slider)', value: 'slider' },
                          { label: '单选下拉 (Select)', value: 'select' },
                          { label: '外部字典下拉 (DictSelect)', value: 'dict-select' },
                        ]}
                        placeholder="默认自动推断"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="optionsSourceId" label="外部选项数据源">
                      <Input allowClear placeholder="如 SYSTEM_REGION" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name="uiPropsText" label="特殊透传配置 (JSON)">
                      <Input.TextArea
                        rows={1}
                        allowClear
                        placeholder='如: {"placeholder":"填入年龄"}'
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Collapse.Panel>
            </Collapse>
          )}

          <Divider style={{ margin: '16px 0' }} />
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="changeReason" label="提交变更原因">
                <Input.TextArea rows={1} placeholder="为了日后追溯，请简述本次修改的原因" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isActive" label="记录状态启用">
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
        title={
          <Flex align="center" gap="middle">
            <span>新建参数项</span>
            <Space size="small">
              <Button
                size="small"
                type="primary"
                ghost
                onClick={() => {
                  vm.state.itemForm.setFieldsValue({
                    paramType: 'number',
                    defaultValue: 0,
                    numberMin: 0,
                    numberMax: 100,
                    numberStep: 1,
                  });
                }}
              >
                数值阈值参数
              </Button>
              <Button
                size="small"
                type="primary"
                ghost
                onClick={() => {
                  vm.state.itemForm.setFieldsValue({ paramType: 'boolean', defaultValue: false });
                }}
              >
                状态开关
              </Button>
            </Space>
          </Flex>
        }
        open={vm.state.itemVisible}
        onCancel={() => {
          vm.setters.setItemVisible(false);
          vm.setters.setIsParamCodeCustomized(false);
        }}
        onOk={vm.actions.handleCreateItem}
        confirmLoading={vm.mutations.createItemMutation.isPending}
        width={720}
      >
        <Form<CreateParameterItemDto>
          layout="vertical"
          form={vm.state.itemForm as any}
          initialValues={{ scopeLevel: 'GLOBAL', paramType: 'string' }}
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
                vm.setters.setIsParamCodeCustomized(
                  Boolean(generatedCode && normalized !== generatedCode),
                );
              }
            }
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="paramName" label="参数名称 (中文)" rules={[{ required: true }]}>
                <Input placeholder="例: 最大重试次数" />
              </Form.Item>
              <Form.Item
                name="paramCode"
                label={
                  <span
                    style={{ color: token.colorTextSecondary, fontSize: 12, fontWeight: 'normal' }}
                  >
                    唯一编码 (将根据名称自动静默生成)
                  </span>
                }
                rules={[{ required: true }]}
                style={{ marginTop: -16, marginBottom: 16 }}
              >
                <Input
                  bordered={false}
                  style={{
                    color: token.colorTextDisabled,
                    padding: 0,
                    fontSize: 12,
                    transform: 'translateY(-10px)',
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paramType" label="数据类型" rules={[{ required: true }]}>
                <Select options={paramTypeOptions.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.paramType !== curr.paramType}>
            {({ getFieldValue }) => {
              const type = getFieldValue('paramType');
              return (
                <>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="defaultValue"
                        label={
                          type === 'json' || type === 'expression'
                            ? '模板默认值 (JSON/Text)'
                            : '模板默认值'
                        }
                        valuePropName={type === 'boolean' ? 'checked' : 'value'}
                      >
                        {renderDynamicInput(type, '设置此参数项的出厂默认值')}
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="value"
                        label={
                          type === 'json' || type === 'expression'
                            ? '实生效值 (JSON/Text)'
                            : '当前实生效值'
                        }
                        valuePropName={type === 'boolean' ? 'checked' : 'value'}
                      >
                        {renderDynamicInput(type, '若有值则覆盖默认值')}
                      </Form.Item>
                    </Col>
                  </Row>

                  {type === 'number' && (
                    <Row
                      gutter={16}
                      style={{
                        backgroundColor: token.colorFillAlter,
                        padding: '12px 12px 0 12px',
                        borderRadius: 6,
                        marginBottom: 16,
                      }}
                    >
                      <Col span={8}>
                        <Form.Item name="numberMin" label="最小值限制">
                          <InputNumber style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="numberMax" label="最大值限制">
                          <InputNumber style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="numberStep" label="递增步长">
                          <InputNumber style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                  {type === 'enum' && (
                    <div
                      style={{
                        backgroundColor: token.colorFillAlter,
                        padding: '12px 12px 0 12px',
                        borderRadius: 6,
                        marginBottom: 16,
                      }}
                    >
                      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                        选项配置管理
                      </Typography.Text>
                      <Form.List name="selectOptions">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map(({ key, name, ...restField }) => (
                              <Space
                                key={key}
                                style={{ display: 'flex', marginBottom: 8 }}
                                align="baseline"
                              >
                                <Form.Item
                                  {...restField}
                                  name={[name, 'label']}
                                  rules={[{ required: true, message: '必填' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="可见选项 (如: 男)" />
                                </Form.Item>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'value']}
                                  rules={[{ required: true, message: '必填' }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder="后端实际值 (如: M)" />
                                </Form.Item>
                                <MinusCircleOutlined
                                  onClick={() => remove(name)}
                                  style={{ color: token.colorError }}
                                />
                              </Space>
                            ))}
                            <Form.Item>
                              <Button
                                type="dashed"
                                onClick={() => add()}
                                block
                                icon={<PlusOutlined />}
                              >
                                新增选项项目
                              </Button>
                            </Form.Item>
                          </>
                        )}
                      </Form.List>
                    </div>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Collapse
            ghost
            style={{ backgroundColor: token.colorFillQuaternary, borderRadius: 8, marginTop: 16 }}
          >
            <Collapse.Panel key="advanced" header="⚙️ 高级配置 (按需展开)">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="scopeLevel" label="作用域层级" rules={[{ required: true }]}>
                    <Select
                      options={scopeOptions.map((item) => ({
                        label: getScopeLabel(item),
                        value: item,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="scopeValue" label="限定作用域值">
                    <Input placeholder="填入 ID 覆盖范围, 留空则全覆盖" />
                  </Form.Item>
                </Col>
              </Row>
              <Divider style={{ margin: '8px 0' }} />
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                专业开发选项 / 数据源配置
              </Typography.Text>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="uiComponent" label="UI 控件覆盖渲染">
                    <Select
                      allowClear
                      options={[
                        { label: '默认输入 (Input)', value: 'input' },
                        { label: '数字输入框 (NumberInput)', value: 'number-input' },
                        { label: '单选下拉 (Select)', value: 'select' },
                        { label: '外部字典下拉 (DictSelect)', value: 'dict-select' },
                        { label: '日期选择器 (DatePicker)', value: 'date-picker' },
                      ]}
                      placeholder="默认由参数类型自动推断"
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="optionsSourceId" label="外部字典数据源">
                    <Input allowClear placeholder="如 SYSTEM_REGION" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="uiPropsText" label="特殊透传配置 (JSON)">
                    <Input.TextArea rows={1} allowClear placeholder='{"placeholder":"填入年龄"}' />
                  </Form.Item>
                </Col>
              </Row>
            </Collapse.Panel>
          </Collapse>
        </Form>
      </Modal>
    </Card>
  );
};

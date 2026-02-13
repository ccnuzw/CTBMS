import React, { useMemo, useState } from 'react';
import {
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  DiffOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  EditOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { WorkflowVersionDto, WorkflowDsl, WorkflowNode, WorkflowEdge } from '@packages/types';

const { Text, Title } = Typography;

// ── Types ──

interface VersionDiffViewerProps {
  versions: WorkflowVersionDto[];
}

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

interface NodeDiffItem {
  nodeId: string;
  name: string;
  type: string;
  status: DiffStatus;
  leftConfig?: Record<string, unknown>;
  rightConfig?: Record<string, unknown>;
  changes: string[];
}

interface EdgeDiffItem {
  edgeId: string;
  from: string;
  to: string;
  edgeType: string;
  status: DiffStatus;
}

interface ConfigDiffItem {
  field: string;
  leftValue: unknown;
  rightValue: unknown;
  status: DiffStatus;
}

// ── Helpers ──

const diffStatusConfig: Record<DiffStatus, { color: string; icon: React.ReactNode; label: string }> = {
  added: { color: 'green', icon: <PlusCircleOutlined />, label: '新增' },
  removed: { color: 'red', icon: <MinusCircleOutlined />, label: '删除' },
  modified: { color: 'orange', icon: <EditOutlined />, label: '修改' },
  unchanged: { color: 'default', icon: null, label: '未变' },
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
};

const shallowEqual = (a: unknown, b: unknown): boolean => {
  return JSON.stringify(a) === JSON.stringify(b);
};

const diffNodes = (leftNodes: WorkflowNode[], rightNodes: WorkflowNode[]): NodeDiffItem[] => {
  const leftMap = new Map(leftNodes.map((n) => [n.id, n]));
  const rightMap = new Map(rightNodes.map((n) => [n.id, n]));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const result: NodeDiffItem[] = [];

  for (const id of allIds) {
    const left = leftMap.get(id);
    const right = rightMap.get(id);

    if (!left && right) {
      result.push({
        nodeId: id,
        name: right.name,
        type: right.type,
        status: 'added',
        rightConfig: right.config,
        changes: ['新增节点'],
      });
    } else if (left && !right) {
      result.push({
        nodeId: id,
        name: left.name,
        type: left.type,
        status: 'removed',
        leftConfig: left.config,
        changes: ['删除节点'],
      });
    } else if (left && right) {
      const changes: string[] = [];
      if (left.name !== right.name) changes.push(`名称: ${left.name} → ${right.name}`);
      if (left.type !== right.type) changes.push(`类型: ${left.type} → ${right.type}`);
      if (left.enabled !== right.enabled) changes.push(`启用: ${left.enabled} → ${right.enabled}`);
      if (!shallowEqual(left.config, right.config)) changes.push('配置变更');
      if (!shallowEqual(left.runtimePolicy, right.runtimePolicy)) changes.push('运行策略变更');
      if (!shallowEqual(left.inputBindings, right.inputBindings)) changes.push('输入绑定变更');

      result.push({
        nodeId: id,
        name: right.name,
        type: right.type,
        status: changes.length > 0 ? 'modified' : 'unchanged',
        leftConfig: left.config,
        rightConfig: right.config,
        changes,
      });
    }
  }

  return result.sort((a, b) => {
    const order: Record<DiffStatus, number> = { removed: 0, modified: 1, added: 2, unchanged: 3 };
    return order[a.status] - order[b.status];
  });
};

const diffEdges = (leftEdges: WorkflowEdge[], rightEdges: WorkflowEdge[]): EdgeDiffItem[] => {
  const leftMap = new Map(leftEdges.map((e) => [e.id, e]));
  const rightMap = new Map(rightEdges.map((e) => [e.id, e]));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);
  const result: EdgeDiffItem[] = [];

  for (const id of allIds) {
    const left = leftMap.get(id);
    const right = rightMap.get(id);

    if (!left && right) {
      result.push({ edgeId: id, from: right.from, to: right.to, edgeType: right.edgeType, status: 'added' });
    } else if (left && !right) {
      result.push({ edgeId: id, from: left.from, to: left.to, edgeType: left.edgeType, status: 'removed' });
    } else if (left && right) {
      const isModified = left.from !== right.from || left.to !== right.to || left.edgeType !== right.edgeType || !shallowEqual(left.condition, right.condition);
      result.push({ edgeId: id, from: right.from, to: right.to, edgeType: right.edgeType, status: isModified ? 'modified' : 'unchanged' });
    }
  }

  return result.sort((a, b) => {
    const order: Record<DiffStatus, number> = { removed: 0, modified: 1, added: 2, unchanged: 3 };
    return order[a.status] - order[b.status];
  });
};

const diffTopLevelConfig = (leftDsl: WorkflowDsl, rightDsl: WorkflowDsl): ConfigDiffItem[] => {
  const fields: (keyof WorkflowDsl)[] = [
    'name', 'mode', 'usageMethod', 'version', 'status', 'templateSource',
    'paramSetBindings', 'agentBindings', 'dataConnectorBindings', 'runPolicy', 'outputConfig', 'experimentConfig',
  ];
  const result: ConfigDiffItem[] = [];

  for (const field of fields) {
    const leftVal = leftDsl[field];
    const rightVal = rightDsl[field];
    const isEqual = shallowEqual(leftVal, rightVal);
    result.push({
      field,
      leftValue: leftVal,
      rightValue: rightVal,
      status: isEqual ? 'unchanged' : 'modified',
    });
  }

  return result;
};

// ── Component ──

export const VersionDiffViewer: React.FC<VersionDiffViewerProps> = ({ versions }) => {
  const { token } = theme.useToken();

  const [leftVersionId, setLeftVersionId] = useState<string | undefined>(
    versions.length >= 2 ? versions[1].id : undefined,
  );
  const [rightVersionId, setRightVersionId] = useState<string | undefined>(
    versions.length >= 1 ? versions[0].id : undefined,
  );
  const [showUnchanged, setShowUnchanged] = useState(false);

  const leftVersion = versions.find((v) => v.id === leftVersionId);
  const rightVersion = versions.find((v) => v.id === rightVersionId);

  const leftDsl = leftVersion?.dslSnapshot as WorkflowDsl | undefined;
  const rightDsl = rightVersion?.dslSnapshot as WorkflowDsl | undefined;

  const nodeDiffs = useMemo(() => {
    if (!leftDsl || !rightDsl) return [];
    const all = diffNodes(leftDsl.nodes, rightDsl.nodes);
    return showUnchanged ? all : all.filter((d) => d.status !== 'unchanged');
  }, [leftDsl, rightDsl, showUnchanged]);

  const edgeDiffs = useMemo(() => {
    if (!leftDsl || !rightDsl) return [];
    const all = diffEdges(leftDsl.edges, rightDsl.edges);
    return showUnchanged ? all : all.filter((d) => d.status !== 'unchanged');
  }, [leftDsl, rightDsl, showUnchanged]);

  const configDiffs = useMemo(() => {
    if (!leftDsl || !rightDsl) return [];
    const all = diffTopLevelConfig(leftDsl, rightDsl);
    return showUnchanged ? all : all.filter((d) => d.status !== 'unchanged');
  }, [leftDsl, rightDsl, showUnchanged]);

  const stats = useMemo(() => {
    const nodeStats = {
      added: nodeDiffs.filter((d) => d.status === 'added').length,
      removed: nodeDiffs.filter((d) => d.status === 'removed').length,
      modified: nodeDiffs.filter((d) => d.status === 'modified').length,
    };
    const edgeStats = {
      added: edgeDiffs.filter((d) => d.status === 'added').length,
      removed: edgeDiffs.filter((d) => d.status === 'removed').length,
      modified: edgeDiffs.filter((d) => d.status === 'modified').length,
    };
    return { nodeStats, edgeStats };
  }, [nodeDiffs, edgeDiffs]);

  const versionOptions = versions.map((v) => ({
    label: `${v.versionCode} (${v.status})`,
    value: v.id,
  }));

  const nodeColumns: ColumnsType<NodeDiffItem> = [
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: DiffStatus) => {
        const config = diffStatusConfig[status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    { title: '节点 ID', dataIndex: 'nodeId', width: 180 },
    { title: '名称', dataIndex: 'name', width: 160 },
    { title: '类型', dataIndex: 'type', width: 140 },
    {
      title: '变更详情',
      dataIndex: 'changes',
      render: (changes: string[]) =>
        changes.length > 0 ? (
          <Space direction="vertical" size={0}>
            {changes.map((c, i) => (
              <Text key={i} style={{ fontSize: 12 }}>
                {c}
              </Text>
            ))}
          </Space>
        ) : (
          '-'
        ),
    },
  ];

  const edgeColumns: ColumnsType<EdgeDiffItem> = [
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: DiffStatus) => {
        const config = diffStatusConfig[status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    { title: '连线 ID', dataIndex: 'edgeId', width: 180 },
    { title: '起点', dataIndex: 'from', width: 160 },
    { title: '终点', dataIndex: 'to', width: 160 },
    { title: '类型', dataIndex: 'edgeType', width: 120 },
  ];

  const configColumns: ColumnsType<ConfigDiffItem> = [
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (status: DiffStatus) => {
        const config = diffStatusConfig[status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    { title: '字段', dataIndex: 'field', width: 200 },
    {
      title: '旧版本值',
      dataIndex: 'leftValue',
      render: (value: unknown) => (
        <Text style={{ fontSize: 12 }}>{formatValue(value)}</Text>
      ),
    },
    {
      title: '新版本值',
      dataIndex: 'rightValue',
      render: (value: unknown, record) => (
        <Text
          style={{
            fontSize: 12,
            fontWeight: record.status === 'modified' ? 600 : undefined,
            color: record.status === 'modified' ? token.colorWarning : undefined,
          }}
        >
          {formatValue(value)}
        </Text>
      ),
    },
  ];

  if (versions.length < 2) {
    return (
      <Card>
        <Empty description="至少需要两个版本才能进行对比" />
      </Card>
    );
  }

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space>
            <DiffOutlined />
            <Title level={5} style={{ margin: 0 }}>
              版本差异对比
            </Title>
          </Space>
          <Space wrap>
            <Select
              style={{ width: 200 }}
              placeholder="选择旧版本"
              value={leftVersionId}
              onChange={setLeftVersionId}
              options={versionOptions}
            />
            <SwapOutlined style={{ color: token.colorTextSecondary }} />
            <Select
              style={{ width: 200 }}
              placeholder="选择新版本"
              value={rightVersionId}
              onChange={setRightVersionId}
              options={versionOptions}
            />
            <Select
              style={{ width: 140 }}
              value={showUnchanged ? 'all' : 'changed'}
              onChange={(v) => setShowUnchanged(v === 'all')}
              options={[
                { label: '仅显示变更', value: 'changed' },
                { label: '显示全部', value: 'all' },
              ]}
            />
          </Space>
        </Flex>

        {leftDsl && rightDsl ? (
          <>
            {/* ── Stats ── */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Card size="small" title="节点变更">
                  <Space size={16}>
                    <Tag color="green">新增 {stats.nodeStats.added}</Tag>
                    <Tag color="red">删除 {stats.nodeStats.removed}</Tag>
                    <Tag color="orange">修改 {stats.nodeStats.modified}</Tag>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12}>
                <Card size="small" title="连线变更">
                  <Space size={16}>
                    <Tag color="green">新增 {stats.edgeStats.added}</Tag>
                    <Tag color="red">删除 {stats.edgeStats.removed}</Tag>
                    <Tag color="orange">修改 {stats.edgeStats.modified}</Tag>
                  </Space>
                </Card>
              </Col>
            </Row>

            {/* ── Config Diff ── */}
            {configDiffs.length > 0 && (
              <Card title="顶层配置变更" size="small">
                <Table<ConfigDiffItem>
                  rowKey="field"
                  dataSource={configDiffs}
                  columns={configColumns}
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                />
              </Card>
            )}

            {/* ── Node Diff ── */}
            <Card title={`节点差异 (${nodeDiffs.length})`} size="small">
              <Table<NodeDiffItem>
                rowKey="nodeId"
                dataSource={nodeDiffs}
                columns={nodeColumns}
                pagination={false}
                size="small"
                scroll={{ x: 900 }}
                expandable={{
                  expandedRowRender: (record) => {
                    if (!record.leftConfig && !record.rightConfig) return null;
                    return (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Card title="旧版本配置" size="small">
                            <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                              {record.leftConfig ? JSON.stringify(record.leftConfig, null, 2) : '(无)'}
                            </pre>
                          </Card>
                        </Col>
                        <Col span={12}>
                          <Card title="新版本配置" size="small">
                            <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                              {record.rightConfig ? JSON.stringify(record.rightConfig, null, 2) : '(无)'}
                            </pre>
                          </Card>
                        </Col>
                      </Row>
                    );
                  },
                  rowExpandable: (record) => record.status !== 'unchanged',
                }}
              />
            </Card>

            {/* ── Edge Diff ── */}
            <Card title={`连线差异 (${edgeDiffs.length})`} size="small">
              <Table<EdgeDiffItem>
                rowKey="edgeId"
                dataSource={edgeDiffs}
                columns={edgeColumns}
                pagination={false}
                size="small"
                scroll={{ x: 800 }}
              />
            </Card>
          </>
        ) : (
          <Empty description="请选择两个版本进行对比" />
        )}
      </Space>
    </Card>
  );
};

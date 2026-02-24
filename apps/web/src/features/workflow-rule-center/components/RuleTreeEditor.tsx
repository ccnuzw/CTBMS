import React from 'react';
import {
  Space,
  Card,
  Button,
  Select,
  Input,
  Dropdown,
  MenuProps,
  Typography,
  theme,
  AutoComplete,
  Modal,
  message,
  Switch,
  InputNumber,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SubnodeOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  DecisionRuleConditionNodeDto,
  DecisionRuleConditionLeafDto,
  DecisionRuleLogic,
  DecisionRuleOperator,
} from '@packages/types';
import { useSmartParseAst } from '../api/decision-rule-packs';
import { v4 as uuidv4 } from 'uuid';

const { Text } = Typography;

export type RuleTreeItem = (DecisionRuleConditionNodeDto | DecisionRuleConditionLeafDto) & {
  _key?: string; // used for React rendering and tracking
};

interface RuleTreeNodeProps {
  node: RuleTreeItem;
  onChange: (newNode: RuleTreeItem) => void;
  onRemove?: () => void;
  level: number;
}

const isLogicGroup = (node: any): node is DecisionRuleConditionNodeDto => {
  return node && typeof node.logic === 'string' && Array.isArray(node.children);
};

const OPERATOR_OPTIONS = [
  {
    label: '🟢 文本匹配',
    options: [
      { label: '包含', value: 'CONTAINS' },
      { label: '不包含', value: 'NOT_CONTAINS' },
      { label: '精确等于', value: 'EQ' },
      { label: '不等于', value: 'NEQ' },
    ]
  },
  {
    label: '🔵 数值比较',
    options: [
      { label: '大于', value: 'GT' },
      { label: '大于等于', value: 'GTE' },
      { label: '小于', value: 'LT' },
      { label: '小于等于', value: 'LTE' },
      { label: '等于', value: 'EQ' },
      { label: '介于区间', value: 'BETWEEN' },
    ]
  },
  {
    label: '🟡 状态判断',
    options: [
      { label: '是 (True) / 等于', value: 'EQ' },
      { label: '否 (False) / 不等于', value: 'NEQ' },
      { label: '存在', value: 'EXISTS' },
      { label: '为空', value: 'NOT_EXISTS' },
    ]
  },
  {
    label: '集合操作',
    options: [
      { label: '包含于', value: 'IN' },
      { label: '不包含于', value: 'NOT_IN' },
    ]
  }
];

const FIELD_TYPES: Record<string, 'boolean' | 'number' | 'string'> = {
  'parsed.thesis': 'string',
  'parsed.confidence': 'number',
  'parsed.riskLevel': 'string',
  'parsed.evidence': 'string',
  'recordCount': 'number',
  'isFresh': 'boolean',
  'policyShockScore': 'number',
  'executionWindowOpen': 'boolean',
  'volatilityTolerance': 'number',
  'traderConfidence': 'number',
  'emergencyStop': 'boolean',
  'complianceStatus': 'string',
  'marginUsagePct': 'number',
};

const FIELD_PATH_OPTIONS = [
  { value: 'parsed.thesis', label: '核心结论 (parsed.thesis)' },
  { value: 'parsed.confidence', label: '置信度 (parsed.confidence)' },
  { value: 'parsed.riskLevel', label: '风险等级 (parsed.riskLevel)' },
  { value: 'parsed.evidence', label: '证据支持 (parsed.evidence)' },
  { value: 'recordCount', label: '采集记录数量 (recordCount)' },
  { value: 'isFresh', label: '数据新鲜度 (isFresh)' },
  { value: 'policyShockScore', label: '政策冲击分数 (policyShockScore)' },
  { value: 'executionWindowOpen', label: '执行窗口状态 (executionWindowOpen)' },
  { value: 'volatilityTolerance', label: '波动容忍度 (volatilityTolerance)' },
  { value: 'traderConfidence', label: '交易员置信度 (traderConfidence)' },
  { value: 'emergencyStop', label: '紧急停机 (emergencyStop)' },
  { value: 'complianceStatus', label: '合规状态 (complianceStatus)' },
  { value: 'marginUsagePct', label: '保证金占用率 (marginUsagePct)' },
];

const RuleTreeNodeLeaf: React.FC<{
  node: DecisionRuleConditionLeafDto;
  onChange: (newNode: DecisionRuleConditionLeafDto) => void;
  onRemove?: () => void;
}> = ({ node, onChange, onRemove }) => {
  const { token } = theme.useToken();

  const handleFieldChange = (val: string) => {
    // When field changes, reset operator and expected value to sensible defaults based on type
    const fieldType = FIELD_TYPES[val] || 'string';
    let defaultOperator: DecisionRuleOperator = 'EQ';
    let defaultValue: any = '';

    if (fieldType === 'boolean') {
      defaultOperator = 'EQ';
      defaultValue = true;
    } else if (fieldType === 'number') {
      defaultOperator = 'GT';
      defaultValue = 0;
    } else {
      defaultOperator = 'CONTAINS';
      defaultValue = '';
    }

    onChange({ ...node, fieldPath: val, operator: defaultOperator, expectedValue: defaultValue });
  };

  const handleOperatorChange = (val: DecisionRuleOperator) => {
    onChange({ ...node, operator: val });
  };

  const handleExpectedValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Basic heuristics to store as number if possible, or boolean, else string
    let val: any = e.target.value;
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    else if (!isNaN(Number(val)) && val.trim() !== '') {
      val = Number(val);
    }
    onChange({ ...node, expectedValue: val });
  };

  const getInputValue = () => {
    if (node.expectedValue === null || node.expectedValue === undefined) return '';
    if (typeof node.expectedValue === 'object') return JSON.stringify(node.expectedValue);
    return String(node.expectedValue);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        backgroundColor: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        flexWrap: 'wrap',
      }}
    >
      <AutoComplete
        allowClear
        placeholder="字段路径 (例如: parsed.thesis)"
        value={node.fieldPath}
        onChange={handleFieldChange}
        options={FIELD_PATH_OPTIONS}
        filterOption={(inputValue: string, option: any) =>
          (option?.label?.toString() ?? '').toLowerCase().includes(inputValue.toLowerCase()) ||
          (option?.value?.toString() ?? '').toLowerCase().includes(inputValue.toLowerCase())
        }
        style={{ width: 260 }}
      />
      <Select
        value={node.operator}
        options={OPERATOR_OPTIONS}
        onChange={handleOperatorChange}
        style={{ width: 180 }}
      />
      {node.operator !== 'EXISTS' && node.operator !== 'NOT_EXISTS' && (
        (() => {
          const fieldType = FIELD_TYPES[node.fieldPath] || 'string';

          if (fieldType === 'boolean') {
            return (
              <Select
                value={node.expectedValue === true ? 'true' : node.expectedValue === false ? 'false' : String(node.expectedValue)}
                onChange={(val) => handleExpectedValueChange({ target: { value: val } } as any)}
                style={{ width: 120 }}
                options={[
                  { label: '是 (True)', value: 'true' },
                  { label: '否 (False)', value: 'false' },
                ]}
              />
            );
          }

          if (fieldType === 'number') {
            return (
              <InputNumber
                placeholder="预期数值"
                value={Number(node.expectedValue) || 0}
                onChange={(val) => handleExpectedValueChange({ target: { value: String(val) } } as any)}
                style={{ width: 160 }}
              />
            );
          }

          return (
            <Input
              placeholder="预期文本值"
              value={getInputValue()}
              onChange={handleExpectedValueChange}
              style={{ width: 220 }}
            />
          );
        })()
      )}
      {onRemove && (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={onRemove}
          title="移除此条件"
        />
      )}
    </div>
  );
};

const RuleTreeNodeGroup: React.FC<RuleTreeNodeProps> = ({ node, onChange, onRemove, level }) => {
  const { token } = theme.useToken();
  const groupNode = node as DecisionRuleConditionNodeDto;

  const handleLogicChange = (val: DecisionRuleLogic) => {
    onChange({ ...groupNode, logic: val });
  };

  const handleChildChange = (index: number, newChild: RuleTreeItem) => {
    const nextChildren = [...groupNode.children];
    nextChildren[index] = newChild as any;
    onChange({ ...groupNode, children: nextChildren });
  };

  const handleRemoveChild = (index: number) => {
    const nextChildren = [...groupNode.children];
    nextChildren.splice(index, 1);
    onChange({ ...groupNode, children: nextChildren });
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'add_leaf',
      icon: <PlusOutlined />,
      label: '添加判断条件',
      onClick: () => {
        const nextChildren = [...groupNode.children];
        const newLeaf = {
          _key: uuidv4(),
          fieldPath: '',
          operator: 'EQ',
          expectedValue: '',
        } as any;
        nextChildren.push(newLeaf);
        onChange({ ...groupNode, children: nextChildren });
      },
    },
    {
      key: 'add_group',
      icon: <SubnodeOutlined />,
      label: '添加逻辑组 (AND/OR)',
      onClick: () => {
        const nextChildren = [...groupNode.children];
        const newGroup = {
          _key: uuidv4(),
          logic: 'AND',
          children: [],
        } as any;
        nextChildren.push(newGroup);
        onChange({ ...groupNode, children: nextChildren });
      },
    },
  ];

  return (
    <Card
      size="small"
      style={{
        backgroundColor: level === 0 ? token.colorFillAlter : token.colorFillQuaternary,
        border: `1px solid ${level === 0 ? token.colorPrimaryBorder : token.colorBorder}`,
        marginBottom: 8,
      }}
      bodyStyle={{ padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Select
          value={groupNode.logic}
          options={[
            { label: '且 (AND) - 必须全部满足', value: 'AND' },
            { label: '或 (OR) - 满足其一即可', value: 'OR' },
          ]}
          onChange={handleLogicChange}
          style={{ width: 220 }}
        />
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <Button type="dashed" icon={<PlusOutlined />}>
            添加下级节点
          </Button>
        </Dropdown>
        {onRemove && level > 0 && (
          <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove}>
            删除此逻辑组
          </Button>
        )}
      </div>

      {groupNode.children.length === 0 ? (
        <div style={{ padding: '8px 0', color: token.colorTextTertiary }}>
          当前组为空，请添加判断条件或子嵌套逻辑组。
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingLeft: 16,
            borderLeft: `2px solid ${token.colorBorderSecondary}`,
          }}
        >
          {groupNode.children.map((child: any, idx) => (
            <RuleTreeNodeWrapper
              key={child._key || idx}
              node={child}
              level={level + 1}
              onChange={(newC) => handleChildChange(idx, newC)}
              onRemove={() => handleRemoveChild(idx)}
            />
          ))}
        </div>
      )}
    </Card>
  );
};

const RuleTreeNodeWrapper: React.FC<RuleTreeNodeProps> = (props) => {
  if (isLogicGroup(props.node)) {
    return <RuleTreeNodeGroup {...props} />;
  }
  return (
    <RuleTreeNodeLeaf
      node={props.node as DecisionRuleConditionLeafDto}
      onChange={props.onChange as any}
      onRemove={props.onRemove}
    />
  );
};

export interface RuleTreeEditorProps {
  value?: any; // The conditionAST object
  onChange?: (value: any) => void;
}

const ensureKeys = (node: any): any => {
  if (!node) return node;
  const withKey = { ...node };
  if (!withKey._key) {
    withKey._key = uuidv4();
  }
  if (isLogicGroup(withKey)) {
    withKey.children = withKey.children.map(ensureKeys);
  }
  return withKey;
};

const stripKeys = (node: any): any => {
  if (!node) return node;
  const { _key, ...rest } = node;
  if (isLogicGroup(rest as any)) {
    (rest as any).children = (rest as any).children.map(stripKeys);
  }
  return rest;
};

export const RuleTreeEditor: React.FC<RuleTreeEditorProps> = ({ value, onChange }) => {
  const { token } = theme.useToken();
  const [isSmartParseModalOpen, setIsSmartParseModalOpen] = React.useState(false);
  const [smartParseInput, setSmartParseInput] = React.useState('');
  const { mutateAsync: smartParse, isPending: isParsing } = useSmartParseAst();

  // Keep an internal state for rendering to avoid complete unmounts due to `value` reference changes
  const [internalRoot, setInternalRoot] = React.useState<any>(() => {
    if (value && value.root) {
      return ensureKeys(value.root);
    }
    return {
      _key: uuidv4(),
      logic: 'AND',
      children: [],
    } as any;
  });

  // Sync external value to internal state only when it deeply differs (e.g. initial load)
  // To prevent cursor jumping, we don't blindly overwrite on every onChange.
  React.useEffect(() => {
    const keylessInternal = stripKeys(internalRoot);
    const externalRoot = value?.root || { logic: 'AND', children: [] };
    // If the external value is structurally different from what we currently hold, sync it!
    if (JSON.stringify(keylessInternal) !== JSON.stringify(externalRoot)) {
      setInternalRoot(ensureKeys(externalRoot));
    }
  }, [value]);

  const handleChange = (newRoot: any) => {
    setInternalRoot(newRoot);
    if (onChange) {
      onChange({ root: stripKeys(newRoot) });
    }
  };

  const handleSmartParse = async () => {
    if (!smartParseInput.trim()) {
      message.warning('请输入您的自然语言需求');
      return;
    }
    try {
      const result = await smartParse({ naturalLanguage: smartParseInput });
      handleChange(ensureKeys(result.root));
      message.success('已自动生成规则 AST 结构');
      setIsSmartParseModalOpen(false);
      setSmartParseInput('');
    } catch (error: any) {
      message.error(error.response?.data?.message || '智能生成失败');
    }
  };

  return (
    <div className="rule-tree-editor">
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary">
            规则包可以通过可视化构建灵活的 AND/OR 嵌套条件组合。外部系统会自动将上下文信息代入到
            "字段路径" 中执行结果计算。
          </Text>
          <Button
            type="dashed"
            icon={<ThunderboltOutlined />}
            onClick={() => setIsSmartParseModalOpen(true)}
            style={{ borderColor: token.colorPrimary, color: token.colorPrimary }}
          >
            AI 智能生成
          </Button>
        </div>
        <RuleTreeNodeWrapper node={internalRoot} level={0} onChange={handleChange} />
      </Space>

      <Modal
        title={
          <span>
            <RobotOutlined style={{ color: token.colorPrimary, marginRight: 8 }} />
            智能生成业务规则
          </span>
        }
        open={isSmartParseModalOpen}
        onOk={handleSmartParse}
        onCancel={() => setIsSmartParseModalOpen(false)}
        confirmLoading={isParsing}
        okText="立即生成"
        cancelText="取消"
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            请用通俗的语言描述您想要的判断逻辑，系统会自动为您拼装 AST 树。
          </Text>
        </div>
        <Input.TextArea
          placeholder="例如：只要大豆新闻大于0条，并且信心超过一半就算及格，绝不能出现高风险..."
          value={smartParseInput}
          onChange={(e) => setSmartParseInput(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 8 }}
        />
      </Modal>
    </div>
  );
};

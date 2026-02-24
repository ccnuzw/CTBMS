import React from 'react';
import type { ParameterItemDto, ParameterType } from '@packages/types';
import {
  App,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useParameterSetDetail, useParameterSets } from '../../../workflow-parameter-center/api';

const { Text } = Typography;

interface ParameterOverrideBuilderProps {
  paramOverrideMode: 'INHERIT' | 'PRIVATE_OVERRIDE';
  paramOverrides: Record<string, unknown>;
  defaultParameterSetCodes?: string[];
  onModeChange: (mode: 'INHERIT' | 'PRIVATE_OVERRIDE') => void;
  onOverridesChange: (overrides: Record<string, unknown>) => void;
}

interface OverrideEntry {
  id: string;
  paramCode: string;
  valueText: string;
}

const createEntry = (paramCode = '', valueText = ''): OverrideEntry => ({
  id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  paramCode,
  valueText,
});

const stringifyValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const parseValueByType = (valueText: string, paramType?: ParameterType): unknown => {
  const raw = valueText.trim();
  if (!raw) return '';

  if (paramType === 'number') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (paramType === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }
  if (paramType === 'json') {
    try {
      return JSON.parse(raw);
    } catch {
      return valueText;
    }
  }

  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return valueText;
  }
};

const toEntries = (overrides: Record<string, unknown>): OverrideEntry[] => {
  return Object.entries(overrides).map(([paramCode, value]) =>
    createEntry(paramCode, stringifyValue(value)),
  );
};

const toOverrides = (
  entries: OverrideEntry[],
  parameterMap: Map<string, ParameterItemDto>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  entries.forEach((entry) => {
    const paramCode = entry.paramCode.trim();
    if (!paramCode) return;
    const paramType = parameterMap.get(paramCode)?.paramType;
    result[paramCode] = parseValueByType(entry.valueText, paramType);
  });
  return result;
};

const renderValueEditor = (
  entry: OverrideEntry,
  parameterItem: ParameterItemDto | undefined,
  onChange: (valueText: string) => void,
): React.ReactNode => {
  const type = parameterItem?.paramType;

  if (type === 'number') {
    const numericValue = Number(entry.valueText);
    return (
      <InputNumber
        style={{ width: '100%' }}
        value={Number.isFinite(numericValue) ? numericValue : undefined}
        onChange={(value) => onChange(value === null || value === undefined ? '' : String(value))}
        placeholder="输入数字"
      />
    );
  }

  if (type === 'boolean') {
    const boolValue =
      entry.valueText === 'true'
        ? true
        : entry.valueText === 'false'
          ? false
          : Boolean(parameterItem?.value);
    return (
      <Switch
        checked={boolValue}
        onChange={(checked) => onChange(checked ? 'true' : 'false')}
        checkedChildren="true"
        unCheckedChildren="false"
      />
    );
  }

  if (type === 'json') {
    return (
      <Input.TextArea
        value={entry.valueText}
        onChange={(event) => onChange(event.target.value)}
        autoSize={{ minRows: 3, maxRows: 8 }}
        placeholder='输入 JSON，例如 {"limit": 10}'
        style={{ fontFamily: 'monospace' }}
      />
    );
  }

  return (
    <Input
      value={entry.valueText}
      onChange={(event) => onChange(event.target.value)}
      placeholder={type === 'expression' ? '输入表达式' : '输入参数值'}
    />
  );
};

export const ParameterOverrideBuilder: React.FC<ParameterOverrideBuilderProps> = ({
  paramOverrideMode,
  paramOverrides,
  defaultParameterSetCodes = [],
  onModeChange,
  onOverridesChange,
}) => {
  const { message } = App.useApp();
  const [selectedSetCode, setSelectedSetCode] = React.useState<string>();
  const [entries, setEntries] = React.useState<OverrideEntry[]>(toEntries(paramOverrides));

  const { data: parameterSetPage, isLoading: isLoadingParameterSets } = useParameterSets({
    includePublic: true,
    isActive: true,
    page: 1,
    pageSize: 200,
  });

  const parameterSetOptions = React.useMemo(
    () =>
      (parameterSetPage?.data || []).map((setItem) => ({
        label: `${setItem.name} (${setItem.setCode})`,
        value: setItem.setCode,
        id: setItem.id,
      })),
    [parameterSetPage?.data],
  );

  React.useEffect(() => {
    if (!parameterSetOptions.length) {
      setSelectedSetCode(undefined);
      return;
    }
    if (selectedSetCode && parameterSetOptions.some((item) => item.value === selectedSetCode)) {
      return;
    }
    const preferredCode = defaultParameterSetCodes.find((code) =>
      parameterSetOptions.some((option) => option.value === code),
    );
    setSelectedSetCode(preferredCode ?? parameterSetOptions[0].value);
  }, [defaultParameterSetCodes, parameterSetOptions, selectedSetCode]);

  React.useEffect(() => {
    setEntries(toEntries(paramOverrides));
  }, [paramOverrides]);

  const selectedSet = React.useMemo(
    () => parameterSetOptions.find((item) => item.value === selectedSetCode),
    [parameterSetOptions, selectedSetCode],
  );

  const { data: selectedSetDetail, isLoading: isLoadingSetDetail } = useParameterSetDetail(
    selectedSet?.id,
  );

  const parameterItemMap = React.useMemo(() => {
    const map = new Map<string, ParameterItemDto>();
    (selectedSetDetail?.items || []).forEach((item) => {
      map.set(item.paramCode, item);
    });
    return map;
  }, [selectedSetDetail?.items]);

  const applyEntries = (nextEntries: OverrideEntry[]) => {
    setEntries(nextEntries);
    onOverridesChange(toOverrides(nextEntries, parameterItemMap));
  };

  const addEntry = () => {
    applyEntries([...entries, createEntry()]);
  };

  const removeEntry = (entryId: string) => {
    applyEntries(entries.filter((entry) => entry.id !== entryId));
  };

  const updateEntry = (entryId: string, patch: Partial<OverrideEntry>) => {
    const nextEntries = entries.map((entry) =>
      entry.id === entryId ? { ...entry, ...patch } : entry,
    );
    applyEntries(nextEntries);
  };

  const usedParamCodes = new Set(entries.map((entry) => entry.paramCode).filter(Boolean));

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text strong>独立定制节点参数</Text>
            <Switch
              size="small"
              checked={paramOverrideMode === 'PRIVATE_OVERRIDE'}
              onChange={(checked) => {
                const mode = checked ? 'PRIVATE_OVERRIDE' : 'INHERIT';
                onModeChange(mode);
                if (mode === 'INHERIT') {
                  setEntries([]);
                }
              }}
            />
          </Space>
          {paramOverrideMode === 'PRIVATE_OVERRIDE' ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              已开启参数定制。节点将优先使用本文定制的参数，其余按全局参数包继承。
            </Text>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              当前节点直接继承流程全局参数包。
            </Text>
          )}
        </Space>
      </Card>

      {paramOverrideMode === 'PRIVATE_OVERRIDE' ? (
        <Card
          size="small"
          title={
            <Space>
              <Text style={{ fontSize: 14 }}>设置定制项</Text>
              <Select
                size="small"
                bordered={false}
                placeholder="参数包"
                style={{ width: 140 }}
                value={selectedSetCode}
                loading={isLoadingParameterSets}
                options={parameterSetOptions.map((item) => ({
                  label: item.label,
                  value: item.value,
                }))}
                onChange={(value) => setSelectedSetCode(value)}
              />
            </Space>
          }
          extra={
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addEntry}>
              新增
            </Button>
          }
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>

            {!selectedSet ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用参数包" />
            ) : null}

            {selectedSet && entries.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未添加节点参数覆盖项" />
            ) : null}

            {selectedSet &&
              entries.map((entry) => {
                const selectedParameter = parameterItemMap.get(entry.paramCode);
                const duplicateCount = entries.filter(
                  (item) => item.paramCode === entry.paramCode,
                ).length;
                const isDuplicate = !!entry.paramCode && duplicateCount > 1;

                return (
                  <Card key={entry.id} size="small">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Select
                          showSearch
                          loading={isLoadingSetDetail}
                          style={{ width: '70%' }}
                          value={entry.paramCode || undefined}
                          placeholder="选择参数编码"
                          options={(selectedSetDetail?.items || []).map((item) => ({
                            label: `${item.paramName} (${item.paramCode})`,
                            value: item.paramCode,
                            disabled:
                              item.paramCode !== entry.paramCode &&
                              usedParamCodes.has(item.paramCode),
                          }))}
                          onChange={(value) => {
                            const parameterItem = parameterItemMap.get(value);
                            updateEntry(entry.id, {
                              paramCode: value,
                              valueText:
                                entry.valueText ||
                                stringifyValue(parameterItem?.value ?? parameterItem?.defaultValue),
                            });
                          }}
                        />

                        <Space>
                          {selectedParameter ? (
                            <Tag color="blue">{selectedParameter.paramType}</Tag>
                          ) : null}
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => removeEntry(entry.id)}
                          />
                        </Space>
                      </Space>

                      {selectedParameter ? (
                        renderValueEditor(entry, selectedParameter, (valueText) =>
                          updateEntry(entry.id, { valueText }),
                        )
                      ) : (
                        <Input
                          value={entry.valueText}
                          onChange={(event) =>
                            updateEntry(entry.id, { valueText: event.target.value })
                          }
                          placeholder="请输入参数值"
                        />
                      )}

                      {selectedParameter ? (
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            默认值: {stringifyValue(selectedParameter.defaultValue)}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            当前基线值: {stringifyValue(selectedParameter.value)}
                          </Text>
                        </Space>
                      ) : null}

                      {isDuplicate ? (
                        <Text type="danger" style={{ fontSize: 12 }}>
                          参数编码重复，请保留一条覆盖项。
                        </Text>
                      ) : null}
                    </Space>
                  </Card>
                );
              })}
          </Space>
        </Card>
      ) : null}
    </Space>
  );
};

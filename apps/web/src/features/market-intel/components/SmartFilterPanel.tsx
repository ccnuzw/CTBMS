import React, { useMemo } from 'react';
import {
  Card,
  Flex,
  Select,
  DatePicker,
  Tag,
  Segmented,
  Button,
  Space,
  Divider,
  Typography,
  theme,
} from 'antd';
import {
  FilterOutlined,
  CalendarOutlined,
  GlobalOutlined,
  AppstoreOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useFilterOptions } from '../api/hooks';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

export interface FilterState {
  timeRange: '7D' | '30D' | 'YTD' | 'CUSTOM';
  customDateRange?: [dayjs.Dayjs, dayjs.Dayjs] | null;
  commodities: string[];
  regions: string[];
  eventTypes: string[];
}

interface SmartFilterPanelProps {
  filterState: FilterState;
  onChange: (newState: FilterState) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const SmartFilterPanel: React.FC<SmartFilterPanelProps> = ({
  filterState,
  onChange,
  className,
  style,
}) => {
  const { token } = theme.useToken();
  const { data: options, isLoading } = useFilterOptions();

  const handleTimeRangeChange = (value: string | number) => {
    onChange({ ...filterState, timeRange: value as any });
  };

  const handleDateRangeChange = (dates: any) => {
    onChange({
      ...filterState,
      timeRange: 'CUSTOM',
      customDateRange: dates,
    });
  };

  const handleClear = () => {
    onChange({
      timeRange: '7D',
      customDateRange: null,
      commodities: [],
      regions: [],
      eventTypes: [],
    });
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterState.commodities.length > 0) count++;
    if (filterState.regions.length > 0) count++;
    if (filterState.eventTypes.length > 0) count++;
    if (filterState.timeRange === 'CUSTOM' || filterState.timeRange !== '7D') count++;
    return count;
  }, [filterState]);

  return (
    <Card className={className} style={style} bodyStyle={{ padding: '16px 24px' }} bordered={false}>
      <Flex vertical gap={16}>
        {/* 第一行：时间切片与主要操作 */}
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Flex align="center" gap={16}>
            <Flex align="center" gap={8}>
              <FilterOutlined style={{ fontSize: 16 }} />
              <Text strong>智能切片</Text>
              {activeFilterCount > 0 && <Tag color="blue">{activeFilterCount}</Tag>}
            </Flex>

            <Divider type="vertical" />

            <Flex align="center" gap={8}>
              <CalendarOutlined style={{ color: token.colorTextSecondary }} />
              <Segmented
                options={[
                  { label: '近7天', value: '7D' },
                  { label: '近30天', value: '30D' },
                  { label: '今年', value: 'YTD' },
                  { label: '自定义', value: 'CUSTOM' },
                ]}
                value={filterState.timeRange}
                onChange={handleTimeRangeChange}
                size="small"
              />
              {filterState.timeRange === 'CUSTOM' && (
                <RangePicker
                  size="small"
                  value={filterState.customDateRange}
                  onChange={handleDateRangeChange}
                  style={{ width: 240 }}
                />
              )}
            </Flex>
          </Flex>

          {activeFilterCount > 0 && (
            <Button type="text" size="small" icon={<ClearOutlined />} onClick={handleClear}>
              重置筛选
            </Button>
          )}
        </Flex>

        {/* 第二行：多维属性切片 */}
        <Flex gap={24} wrap="wrap">
          {/* 品种筛选 */}
          <Space direction="vertical" size={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              关注品种
            </Text>
            <Select
              mode="multiple"
              placeholder="全品种"
              style={{ minWidth: 160, maxWidth: 300 }}
              allowClear
              loading={isLoading}
              value={filterState.commodities}
              onChange={(vals) => onChange({ ...filterState, commodities: vals })}
              options={options?.commodities.map((c) => ({ label: c, value: c }))}
              maxTagCount="responsive"
            />
          </Space>

          {/* 区域筛选 */}
          <Space direction="vertical" size={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {' '}
              <GlobalOutlined /> 区域维度
            </Text>
            <Select
              mode="multiple"
              placeholder="全区域"
              style={{ minWidth: 160, maxWidth: 300 }}
              allowClear
              loading={isLoading}
              value={filterState.regions}
              onChange={(vals) => onChange({ ...filterState, regions: vals })}
              options={options?.regions.map((r) => ({ label: r, value: r }))}
              maxTagCount="responsive"
            />
          </Space>

          {/* 事件类型筛选 */}
          <Space direction="vertical" size={2}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {' '}
              <AppstoreOutlined /> 事件类型的
            </Text>
            <Select
              mode="multiple"
              placeholder="全类型"
              style={{ minWidth: 160, maxWidth: 300 }}
              allowClear
              loading={isLoading}
              value={filterState.eventTypes}
              onChange={(vals) => onChange({ ...filterState, eventTypes: vals })}
              options={options?.eventTypes.map((t) => ({ label: t.name, value: t.id }))}
              maxTagCount="responsive"
            />
          </Space>
        </Flex>
      </Flex>
    </Card>
  );
};

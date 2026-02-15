import { ReloadOutlined } from '@ant-design/icons';
import { Button, Radio, Segmented, Space } from 'antd';

type Props = {
  days: number;
  mode: 'compact' | 'full';
  loading?: boolean;
  onDaysChange: (value: number) => void;
  onModeChange: (value: 'compact' | 'full') => void;
  onRefresh: () => void;
};

export const WorkbenchHeaderBar: React.FC<Props> = ({
  days,
  mode,
  loading,
  onDaysChange,
  onModeChange,
  onRefresh,
}) => {
  return (
    <Space>
      <Segmented
        value={mode}
        onChange={(value) => onModeChange(value as 'compact' | 'full')}
        options={[
          { label: '精简模式', value: 'compact' },
          { label: '完整模式', value: 'full' },
        ]}
      />
      <Radio.Group value={days} onChange={(event) => onDaysChange(event.target.value)}>
        <Radio.Button value={7}>近7天</Radio.Button>
        <Radio.Button value={30}>近30天</Radio.Button>
      </Radio.Group>
      <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
        刷新
      </Button>
    </Space>
  );
};

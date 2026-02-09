import { BarChartOutlined, DatabaseOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Radio, Segmented, Space, Typography } from 'antd';

const { Text, Title } = Typography;

type Props = {
  days: number;
  mode: 'compact' | 'full';
  loading?: boolean;
  onDaysChange: (value: number) => void;
  onModeChange: (value: 'compact' | 'full') => void;
  onRefresh: () => void;
  onOpenLibrary: () => void;
  onOpenDashboard: () => void;
};

export const WorkbenchHeaderBar: React.FC<Props> = ({
  days,
  mode,
  loading,
  onDaysChange,
  onModeChange,
  onRefresh,
  onOpenLibrary,
  onOpenDashboard,
}) => {
  return (
    <Card style={{ borderRadius: 14, borderColor: '#e9edf5' }} bodyStyle={{ padding: '16px 18px' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            商情工作台
          </Title>
          <Text type="secondary">优先完成今日任务，分析内容按需展开</Text>
        </div>

        <Space wrap>
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
          <Button icon={<DatabaseOutlined />} onClick={onOpenLibrary}>
            知识库
          </Button>
          <Button icon={<BarChartOutlined />} onClick={onOpenDashboard}>
            分析看板
          </Button>
          <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
            刷新
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

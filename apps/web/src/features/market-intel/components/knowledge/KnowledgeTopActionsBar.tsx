import { BookOutlined, FormOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Card, Space, Typography } from 'antd';

const { Text } = Typography;

type Props = {
  onBackLibrary?: () => void;
  onQuickEntry?: () => void;
  onOpenDashboard?: () => void;
  onCreateReport?: () => void;
  onGenerateWeekly?: () => void;
  contextBackLabel?: string;
  onContextBack?: () => void;
  generatingWeekly?: boolean;
  rightExtra?: React.ReactNode;
};

export const KnowledgeTopActionsBar: React.FC<Props> = ({
  onBackLibrary,
  onQuickEntry,
  onOpenDashboard,
  onCreateReport,
  onGenerateWeekly,
  contextBackLabel,
  onContextBack,
  generatingWeekly,
  rightExtra,
}) => {
  return (
    <Card style={{ marginBottom: 16, borderRadius: 12, borderColor: '#e9edf5' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space wrap>
          {contextBackLabel && onContextBack ? (
            <Button onClick={onContextBack}>{contextBackLabel}</Button>
          ) : null}
          {onBackLibrary ? (
            <Button icon={<BookOutlined />} onClick={onBackLibrary}>
              返回知识库
            </Button>
          ) : null}
          {onQuickEntry ? <Button onClick={onQuickEntry}>快速采集</Button> : null}
          {onCreateReport ? (
            <Button icon={<FormOutlined />} onClick={onCreateReport}>
              新建研报
            </Button>
          ) : null}
          {onGenerateWeekly ? (
            <Button
              icon={<ThunderboltOutlined />}
              type="primary"
              loading={generatingWeekly}
              onClick={onGenerateWeekly}
            >
              生成本周周报
            </Button>
          ) : null}
          {onOpenDashboard ? <Button onClick={onOpenDashboard}>分析看板</Button> : null}
        </Space>
        <Text type="secondary">统一操作栏：沉淀、生成、回查</Text>
        {rightExtra}
      </Space>
    </Card>
  );
};

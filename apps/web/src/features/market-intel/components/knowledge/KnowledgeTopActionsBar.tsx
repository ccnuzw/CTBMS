import { BookOutlined, FormOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Card, Space, Typography } from 'antd';

const { Text } = Typography;

type Props = {
  onBackLibrary: () => void;
  onCreateReport: () => void;
  onGenerateWeekly: () => void;
  generatingWeekly?: boolean;
  rightExtra?: React.ReactNode;
};

export const KnowledgeTopActionsBar: React.FC<Props> = ({
  onBackLibrary,
  onCreateReport,
  onGenerateWeekly,
  generatingWeekly,
  rightExtra,
}) => {
  return (
    <Card style={{ marginBottom: 16, borderRadius: 12, borderColor: '#e9edf5' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space wrap>
          <Button icon={<BookOutlined />} onClick={onBackLibrary}>
            返回知识库
          </Button>
          <Button icon={<FormOutlined />} onClick={onCreateReport}>
            新建研报
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            type="primary"
            loading={generatingWeekly}
            onClick={onGenerateWeekly}
          >
            生成本周周报
          </Button>
        </Space>
        <Text type="secondary">统一操作栏：沉淀、生成、回查</Text>
        {rightExtra}
      </Space>
    </Card>
  );
};

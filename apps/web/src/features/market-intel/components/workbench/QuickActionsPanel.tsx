import { BookOutlined, FileAddOutlined, FileSearchOutlined, FormOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Space, Typography, theme } from 'antd';

const { Paragraph, Text } = Typography;

type ActionItem = {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
};

type Props = {
  onUploadDoc: () => void;
  onGenerateFromDoc: () => void;
  onCreateReport: () => void;
  onOpenKnowledge: () => void;
};

export const QuickActionsPanel: React.FC<Props> = ({
  onUploadDoc,
  onGenerateFromDoc,
  onCreateReport,
  onOpenKnowledge,
}) => {
  const { token } = theme.useToken();
  const actions: ActionItem[] = [
    {
      key: 'upload',
      title: '上传文档',
      description: '上传 PDF/Word，自动解析入库',
      icon: <FileAddOutlined />,
      onClick: onUploadDoc,
    },
    {
      key: 'doc2report',
      title: '文档转研报',
      description: '从知识文档快速生成结构化研报',
      icon: <FileSearchOutlined />,
      onClick: onGenerateFromDoc,
    },
    {
      key: 'create',
      title: '新建研报',
      description: '直接创建专题研报',
      icon: <FormOutlined />,
      onClick: onCreateReport,
    },
  ];

  return (
    <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 12, borderColor: token.colorBorderSecondary }}>
      <Space size={16} wrap>
        <Text strong style={{ marginRight: 8 }}>快捷操作：</Text>
        {actions.map((action) => (
          <Button key={action.key} icon={action.icon} onClick={action.onClick}>
            {action.title}
          </Button>
        ))}
      </Space>
    </Card>
  );
};

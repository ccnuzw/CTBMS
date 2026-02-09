import { BookOutlined, FileAddOutlined, FileSearchOutlined, FormOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Typography } from 'antd';

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
  const actions: ActionItem[] = [
    {
      key: 'upload',
      title: '上传文档入库',
      description: '上传 PDF/Word，自动解析入库。',
      icon: <FileAddOutlined />,
      onClick: onUploadDoc,
    },
    {
      key: 'doc2report',
      title: '从文档生成研报',
      description: '从知识文档快速生成结构化研报。',
      icon: <FileSearchOutlined />,
      onClick: onGenerateFromDoc,
    },
    {
      key: 'create',
      title: '新建研报',
      description: '直接创建专题研报并进入编辑。',
      icon: <FormOutlined />,
      onClick: onCreateReport,
    },
    {
      key: 'knowledge',
      title: '进入知识库',
      description: '查看日报、周报、研报与政策库。',
      icon: <BookOutlined />,
      onClick: onOpenKnowledge,
    },
  ];

  return (
    <Card title="快捷入口" style={{ borderRadius: 14, borderColor: '#e9edf5' }}>
      <Row gutter={[12, 12]}>
        {actions.map((action) => (
          <Col xs={24} sm={12} key={action.key}>
            <Card
              size="small"
              hoverable
              style={{ borderRadius: 12, borderColor: '#edf1f7', height: '100%' }}
            >
              <Text strong>
                {action.icon} {action.title}
              </Text>
              <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 12 }}>
                {action.description}
              </Paragraph>
              <Button type="link" onClick={action.onClick} style={{ paddingInline: 0 }}>
                立即进入
              </Button>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
};

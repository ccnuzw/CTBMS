import { Button, Card, Empty, List, Space, Tag, Typography, theme } from 'antd';

const { Text } = Typography;

type PendingItem = {
  id: string;
  title: string;
  source?: string | null;
};

type Props = {
  loading?: boolean;
  items: PendingItem[];
  onOpen: (id: string) => void;
};

export const PendingQueuePanel: React.FC<Props> = ({ loading, items, onOpen }) => {
  const { token } = theme.useToken();
  return (
    <Card
      title="待审核队列"
      extra={<Text type="secondary">优先处理最新提交</Text>}
      style={{ borderRadius: 14, borderColor: token.colorBorderSecondary, height: '100%' }}
      bodyStyle={{ minHeight: 220 }}
    >
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Text type="secondary">加载中...</Text>
        </div>
      ) : items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待审核研报" />
      ) : (
        <List
          dataSource={items}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="open" type="link" size="small" onClick={() => onOpen(item.id)}>
                  去审核
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={item.title}
                description={
                  <Space size={8} wrap>
                    <Tag color="orange">待审核</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.source || '未知来源'}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};

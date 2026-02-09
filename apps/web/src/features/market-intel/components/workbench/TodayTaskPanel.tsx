import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';

const { Text } = Typography;

type Props = {
  todayDocs: number;
  weeklyReports: number;
  pendingReports: number;
  weeklyReady: boolean;
  weeklyReportId?: string;
  onQuickEntry: () => void;
  onGenerateWeekly: () => void;
  onOpenWeeklyReport?: (id: string) => void;
  generatingWeekly?: boolean;
};

export const TodayTaskPanel: React.FC<Props> = ({
  todayDocs,
  weeklyReports,
  pendingReports,
  weeklyReady,
  weeklyReportId,
  onQuickEntry,
  onGenerateWeekly,
  onOpenWeeklyReport,
  generatingWeekly,
}) => {
  return (
    <Card
      title="今日任务"
      extra={<Text type="secondary">优先完成高频操作</Text>}
      style={{ borderRadius: 14, borderColor: '#e9edf5', height: '100%' }}
      bodyStyle={{ paddingBottom: 14 }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Statistic title="今日采集" value={todayDocs} suffix="条" prefix={<FileTextOutlined />} />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title="近7天研报"
            value={weeklyReports}
            suffix="篇"
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title="待审核"
            value={pendingReports}
            suffix="篇"
            prefix={<ClockCircleOutlined />}
          />
        </Col>
      </Row>

      <Space style={{ marginTop: 16 }} wrap size={[8, 8]}>
        <Button type="primary" onClick={onQuickEntry}>
          快速采集
        </Button>
        <Button
          icon={<ThunderboltOutlined />}
          loading={generatingWeekly}
          onClick={onGenerateWeekly}
          type={weeklyReady ? 'default' : 'primary'}
        >
          生成本周周报
        </Button>
        {weeklyReady && weeklyReportId && onOpenWeeklyReport ? (
          <Button onClick={() => onOpenWeeklyReport(weeklyReportId)}>查看本周周报</Button>
        ) : null}
        <Tag color={weeklyReady ? 'success' : 'orange'}>
          {weeklyReady ? '本周周报已生成' : '本周周报未生成'}
        </Tag>
      </Space>
    </Card>
  );
};

import { SearchOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Col,
  Grid,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useGenerateWeeklyRollup, useKnowledgeItems, useKnowledgeReportStats } from '../api/knowledge-hooks';
import { useDocumentStats } from '../api/hooks';
import { KNOWLEDGE_TYPE_LABELS } from '../constants/knowledge-labels';
import { StatsOverviewBar } from './StatsOverviewBar';

dayjs.extend(isoWeek);

const { Text } = Typography;
const FILTER_STORAGE_KEY = 'knowledge-center-filters-v1';

const readStoredFilters = () => {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as any) : null;
  } catch {
    return null;
  }
};

export const KnowledgeCenterPage: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stored = useMemo(() => readStoredFilters(), []);

  const content = searchParams.get('content');
  const from = searchParams.get('from');
  const initialType = content === 'reports' ? 'RESEARCH' : undefined;

  const [type, setType] = useState<string | undefined>(initialType || stored?.type);
  const [status, setStatus] = useState<string | undefined>(stored?.status || undefined);
  const [quickRange, setQuickRange] = useState<'ALL' | 'THIS_WEEK' | 'THIS_MONTH'>(
    stored?.quickRange || 'ALL',
  );
  const [keywordInput, setKeywordInput] = useState(stored?.keywordInput || '');
  const [keyword, setKeyword] = useState(stored?.keyword || '');
  const [page, setPage] = useState(stored?.page || 1);
  const [pageSize, setPageSize] = useState(stored?.pageSize || 20);

  useEffect(() => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ type, status, quickRange, keywordInput, keyword, page, pageSize }),
    );
  }, [type, status, quickRange, keywordInput, keyword, page, pageSize]);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (quickRange === 'ALL') return { startDate: undefined, endDate: undefined };

    if (quickRange === 'THIS_WEEK') {
      const day = now.getDay() || 7;
      const start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }

    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [quickRange]);

  const { data, isLoading } = useKnowledgeItems({
    type,
    status,
    keyword: keyword || undefined,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    page,
    pageSize,
  });
  const weeklyRollupMutation = useGenerateWeeklyRollup();

  const { data: docStats } = useDocumentStats(1); // 传入 1 获取今日数据
  const { data: reportStats } = useKnowledgeReportStats();

  const handleGenerateWeekly = async () => {
    try {
      const res = await weeklyRollupMutation.mutateAsync({});
      message.success('后台已开始尝试生成周报，请稍后刷新列表查看。');
      if (res.reportId) {
        navigate(`/intel/knowledge/items/${res.reportId}`);
      }
    } catch (err: any) {
      console.error(err);
      message.error(err.message || '由于可用数据不足或网络问题，生成失败');
    }
  };

  const rows = data?.data || [];
  const total = data?.total || 0;

  const statusStats = useMemo(() => {
    // 获取当周编号，例如 08 
    const currentWeekIso = dayjs().isoWeek().toString().padStart(2, '0');
    // 获取当周开头和结尾时间，用于辅助判定
    const startOfWeek = dayjs().startOf('isoWeek');
    const endOfWeek = dayjs().endOf('isoWeek');

    const isCurrentWeekReport = (item: any) => {
      if (item.type !== 'WEEKLY') return false;
      // 匹配 periodKey 包含 W08 （格式可能为 2026-W08 或前端默认的 W08）
      if (item.periodKey && item.periodKey.includes(`W${currentWeekIso}`)) {
        return true;
      }
      // 降级判断：如果在 periodKey 缺失或是不规范格式如 2026-02-16_W，则通过 publishAt 验证是否为本周发布的周报
      if (item.publishAt) {
        const pubDate = dayjs(item.publishAt);
        return pubDate.isAfter(startOfWeek) && pubDate.isBefore(endOfWeek);
      }
      return false;
    };

    const weeklyReady = rows.some(isCurrentWeekReport);
    const weeklyReportId = rows.find(isCurrentWeekReport)?.id;

    return { weeklyReady, weeklyReportId };
  }, [rows]);

  const activeTypeLabel = useMemo(() => {
    if (!type) return '全部类型';
    return KNOWLEDGE_TYPE_LABELS[type] || type;
  }, [type]);

  const columns = useMemo(
    () => [
      {
        title: '标题',
        dataIndex: 'title',
        key: 'title',
        width: 520,
        render: (_: string, record: any) => (
          <Button
            type="link"
            onClick={() =>
              navigate(`/intel/knowledge/items/${record.id}`)
            }
            style={{
              paddingInline: 0,
              display: 'block',
              textAlign: 'left',
              maxWidth: '100%',
              whiteSpace: 'normal',
              lineHeight: 1.35,
            }}
          >
            <span
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
              title={record.title}
            >
              {record.title}
            </span>
          </Button>
        ),
      },
      {
        title: '类型',
        dataIndex: 'type',
        key: 'type',
        width: 110,
        render: (_value: string, record: any) => <Tag>{record.typeLabel || record.type}</Tag>,
      },
      {
        title: '周期',
        key: 'period',
        width: 180,
        render: (_: unknown, record: any) => (
          <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
            {record.periodTypeLabel || record.periodType}
            {record.periodKey ? ` / ${record.periodKey}` : ''}
          </Text>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (_value: string, record: any) => (
          <Tag color={record.statusColor || 'default'}>{record.statusLabel || record.status}</Tag>
        ),
      },
      {
        title: '发布时间',
        dataIndex: 'publishAt',
        key: 'publishAt',
        width: 170,
        render: (value: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '-'),
      },
    ],
    [navigate],
  );

  const triggerSearch = () => {
    setKeyword(keywordInput.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setType(initialType);
    setStatus(undefined);
    setQuickRange('ALL');
    setKeywordInput('');
    setKeyword('');
    setPage(1);
    localStorage.removeItem(FILTER_STORAGE_KEY);
  };


  return (
    <PageContainer title={false}>
      <StatsOverviewBar
        todayDocs={docStats?.daily || 0}
        weeklyReports={reportStats?.weeklyReportsCount || reportStats?.byReportType?.WEEKLY || 0}
        weeklyReady={statusStats.weeklyReady}
        weeklyReportId={statusStats.weeklyReportId}
        generatingWeekly={weeklyRollupMutation.isPending}
        onGenerateWeekly={handleGenerateWeekly}
      />
      <Card bodyStyle={{ paddingBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <Segmented
              value={type || 'ALL'}
              onChange={(value) => {
                const next = String(value);
                setType(next === 'ALL' ? undefined : next);
                setPage(1);
              }}
              options={[
                { label: '全部', value: 'ALL' },
                { label: '日报', value: 'DAILY' },
                { label: '周报', value: 'WEEKLY' },
                { label: '月报', value: 'MONTHLY' },
                { label: '研报', value: 'RESEARCH' },
                { label: 'AI报告', value: 'AI_REPORT' },
              ]}
            />
            <Space wrap>
              <b>检索结果：</b> <Text type="secondary">共 {total} 条</Text>
            </Space>
          </div>

          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} lg={24}>
              <Space wrap style={{ width: '100%' }}>
                <Select
                  allowClear
                  placeholder="状态"
                  style={{ width: 150 }}
                  value={status}
                  onChange={(value) => {
                    setStatus(value);
                    setPage(1);
                  }}
                  options={[
                    { label: '已发布', value: 'PUBLISHED' },
                    { label: '草稿', value: 'DRAFT' },
                  ]}
                />
                <Select
                  value={quickRange}
                  style={{ width: 150 }}
                  onChange={(value) => {
                    setQuickRange(value);
                    setPage(1);
                  }}
                  options={[
                    { label: '全部时间', value: 'ALL' },
                    { label: '本周', value: 'THIS_WEEK' },
                    { label: '本月', value: 'THIS_MONTH' },
                  ]}
                />
                <Input
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  onPressEnter={triggerSearch}
                  placeholder="输入标题或正文关键词"
                  style={{ width: 320 }}
                  prefix={<SearchOutlined />}
                  allowClear
                />
                <Button onClick={triggerSearch} type="primary">
                  查询
                </Button>
                <Button onClick={resetFilters}>重置</Button>
              </Space>
            </Col>
          </Row>
        </Space>
      </Card>

      <Card style={{ marginTop: 16 }} bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns as any}
          dataSource={rows}
          size="middle"
          scroll={{ x: 980 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
        />
      </Card>
    </PageContainer>
  );
};

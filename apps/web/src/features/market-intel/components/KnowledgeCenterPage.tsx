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
import { useGenerateWeeklyRollup, useKnowledgeItems } from '../api/knowledge-hooks';
import { KNOWLEDGE_TYPE_LABELS } from '../constants/knowledge-labels';
import { KnowledgeTopActionsBar } from './knowledge/KnowledgeTopActionsBar';

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
  const [status, setStatus] = useState<string | undefined>(stored?.status || 'PUBLISHED');
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

  const rows = data?.data || [];
  const total = data?.total || 0;

  const statusStats = useMemo(() => {
    const weekly = rows.filter((item) => item.type === 'WEEKLY').length;
    return { weekly };
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
              navigate(`/intel/knowledge/items/${record.id}`, {
                state: {
                  from:
                    from === 'workbench'
                      ? 'workbench'
                      : from === 'dashboard'
                        ? 'dashboard'
                        : 'library',
                  returnTo: `${location.pathname}${location.search}`,
                },
              })
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
    setStatus('PUBLISHED');
    setQuickRange('ALL');
    setKeywordInput('');
    setKeyword('');
    setPage(1);
    localStorage.removeItem(FILTER_STORAGE_KEY);
  };

  return (
    <PageContainer title="知识中心 V2" subTitle="统一沉淀日报、周报、研报与政策内容">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="总匹配条数" value={total} suffix="条" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="当前页条数" value={rows.length} suffix="条" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="周报（当前页）" value={statusStats.weekly} suffix="条" />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} bodyStyle={{ paddingBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Segmented
            block={screens.xs}
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
              { label: '政策', value: 'POLICY' },
            ]}
          />
          <Text type="secondary">当前视图：{activeTypeLabel}，默认仅展示已发布内容。</Text>
        </Space>
      </Card>

      <KnowledgeTopActionsBar
        contextBackLabel={
          from === 'workbench' ? '返回工作台' : from === 'dashboard' ? '返回看板' : undefined
        }
        onContextBack={
          from === 'workbench'
            ? () => navigate('/intel/knowledge?tab=workbench')
            : from === 'dashboard'
              ? () => navigate('/intel/knowledge/dashboard?from=dashboard')
              : undefined
        }
        onBackLibrary={() => navigate('/intel/knowledge?tab=library')}
        onQuickEntry={() => navigate('/intel/entry')}
        onCreateReport={() => navigate('/intel/knowledge/reports/create')}
        onOpenDashboard={() =>
          navigate(
            from === 'workbench'
              ? '/intel/knowledge/dashboard?from=workbench'
              : from === 'dashboard'
                ? '/intel/knowledge/dashboard?from=dashboard'
                : '/intel/knowledge/dashboard',
          )
        }
        generatingWeekly={weeklyRollupMutation.isPending}
        onGenerateWeekly={async () => {
          try {
            await weeklyRollupMutation.mutateAsync({ triggerAnalysis: true });
            message.success('周报已生成并完成关联');
          } catch (error) {
            message.error('周报生成失败，请稍后重试');
            console.error(error);
          }
        }}
      />

      <Card style={{ marginTop: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} lg={15}>
            <Space wrap style={{ width: '100%' }}>
              <Select
                allowClear
                placeholder="状态"
                style={{ width: 170 }}
                value={status}
                onChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
                options={[
                  { label: '已发布', value: 'PUBLISHED' },
                  { label: '审核中', value: 'PENDING_REVIEW' },
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
                style={{ width: screens.xs ? '100%' : 320 }}
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
      </Card>

      <Card style={{ marginTop: 16 }} bodyStyle={{ paddingTop: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">
            检索结果：共 {total} 条，当前页 {rows.length} 条
          </Text>
        </div>
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

import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Col, Row, Space, message } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReviewStatus } from '@packages/types';
import {
  useDocumentStats,
  useHotTopics,
  useResearchReportStats,
  useResearchReports,
} from '../api/hooks';
import { useGenerateWeeklyRollup, useKnowledgeItems } from '../api/knowledge-hooks';
import { AnalysisPreviewPanel } from './workbench/AnalysisPreviewPanel';
import { PendingQueuePanel } from './workbench/PendingQueuePanel';
import { QuickActionsPanel } from './workbench/QuickActionsPanel';
import { TodayTaskPanel } from './workbench/TodayTaskPanel';
import { WorkbenchHeaderBar } from './workbench/WorkbenchHeaderBar';

type Mode = 'compact' | 'full';

export const Workbench: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const persistedMode = (localStorage.getItem('knowledge-workbench-mode') as Mode | null) || null;
  const initialMode = ((searchParams.get('mode') as Mode) || persistedMode || 'compact') as Mode;
  const [mode, setMode] = useState<Mode>(initialMode === 'full' ? 'full' : 'compact');
  const [days, setDays] = useState(30);
  const [showPreview, setShowPreview] = useState(initialMode === 'full');

  const { data: reportStats, isLoading: reportLoading, refetch } = useResearchReportStats({ days });
  const { data: docStats, isLoading: docLoading } = useDocumentStats(days);
  const { data: hotTopics } = useHotTopics(12);

  const { data: pendingReports, isLoading: pendingLoading } = useResearchReports({
    page: 1,
    pageSize: 5,
    reviewStatus: ReviewStatus.PENDING,
  });

  const weeklyRollupMutation = useGenerateWeeklyRollup();

  const weekRange = useMemo(() => {
    const now = new Date();
    const day = now.getDay() || 7;
    const start = new Date(now);
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, []);

  const { data: weeklyItems } = useKnowledgeItems({
    type: 'WEEKLY',
    status: 'PUBLISHED',
    startDate: weekRange.startDate,
    endDate: weekRange.endDate,
    page: 1,
    pageSize: 1,
  });

  const todayDocs =
    docStats?.trend?.length > 0 ? Number(docStats.trend[docStats.trend.length - 1]?.count || 0) : 0;
  const weeklyReports =
    reportStats?.trend
      ?.slice(-7)
      ?.reduce((sum: number, item: any) => sum + Number(item.count || 0), 0) || 0;
  const pendingCount = Number(reportStats?.byStatus?.PENDING || 0);
  const weeklyReady = (weeklyItems?.total || 0) > 0;
  const weeklyReportId = weeklyItems?.data?.[0]?.id;

  const isLoading = reportLoading || docLoading;

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === 'full') {
      setShowPreview(true);
    }
    localStorage.setItem('knowledge-workbench-mode', nextMode);
    const next = new URLSearchParams(searchParams);
    next.set('mode', nextMode);
    setSearchParams(next, { replace: true });
  };

  const handleGenerateWeekly = async () => {
    try {
      await weeklyRollupMutation.mutateAsync({ triggerAnalysis: true });
      message.success('本周周报已生成');
    } catch (error) {
      message.error('周报生成失败，请稍后重试');
      console.error(error);
    }
  };

  return (
    <div style={{ padding: 20, background: '#f5f7fb', minHeight: '100%' }}>
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div style={{ width: '100%', maxWidth: 1440, margin: '0 auto' }}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <WorkbenchHeaderBar
              days={days}
              mode={mode}
              loading={isLoading}
              onDaysChange={setDays}
              onModeChange={handleModeChange}
              onRefresh={refetch}
              onOpenLibrary={() => navigate('/intel/knowledge?tab=library&from=workbench')}
              onOpenDashboard={() => navigate('/intel/knowledge/dashboard?from=workbench')}
            />

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={16}>
                <TodayTaskPanel
                  todayDocs={todayDocs}
                  weeklyReports={weeklyReports}
                  pendingReports={pendingCount}
                  weeklyReady={weeklyReady}
                  weeklyReportId={weeklyReportId}
                  generatingWeekly={weeklyRollupMutation.isPending}
                  onQuickEntry={() => navigate('/intel/entry')}
                  onGenerateWeekly={handleGenerateWeekly}
                  onOpenWeeklyReport={(id) =>
                    navigate(`/intel/knowledge/items/${id}`, { state: { from: 'workbench' } })
                  }
                />
              </Col>
              <Col xs={24} lg={8}>
                <PendingQueuePanel
                  loading={pendingLoading}
                  items={(pendingReports?.data || []).map((item) => ({
                    id: item.id,
                    title: item.title,
                    source: item.source,
                  }))}
                  onOpen={(id) => navigate(`/intel/knowledge/legacy/report/${id}?from=workbench`)}
                />
              </Col>
            </Row>

            <QuickActionsPanel
              onUploadDoc={() => navigate('/intel/entry')}
              onGenerateFromDoc={() =>
                navigate('/intel/knowledge?tab=library&from=workbench&content=reports')
              }
              onCreateReport={() => navigate('/intel/knowledge/reports/create')}
              onOpenKnowledge={() => navigate('/intel/knowledge?tab=library&from=workbench')}
            />

            {mode === 'compact' && (
              <Button
                type="default"
                icon={showPreview ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setShowPreview((prev) => !prev)}
              >
                {showPreview ? '收起分析预览' : '展开分析预览'}
              </Button>
            )}

            {(mode === 'full' || showPreview) && (
              <AnalysisPreviewPanel
                trend={docStats?.trend || []}
                sourceData={docStats?.bySource || []}
                hotTopics={hotTopics || []}
                loading={isLoading}
                onOpenDashboard={() => navigate('/intel/knowledge/dashboard?from=workbench')}
                onOpenSearchTopic={(topic) =>
                  navigate(`/intel/search?q=${encodeURIComponent(topic)}`)
                }
              />
            )}
          </Space>
        </div>
      </Space>
    </div>
  );
};

export default Workbench;

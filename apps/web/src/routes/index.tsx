import { createBrowserRouter, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { UserList } from '../features/users/components/UserList';
import { RoleList } from '../features/users/components/RoleList';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CategoryList } from '../features/market-info/components/CategoryList';
import { InfoList } from '../features/market-info/components/InfoList';
import { InfoEditor } from '../features/market-info/components/InfoEditor';
import { OrgList, DeptList, OrgUserManagement } from '../features/organization';
import { GlobalTagList, TagGroupList } from '../features/tags';
import { EnterpriseDashboard } from '../features/enterprise';
import {
  SuperDashboard,
  DataEntry,
  Leaderboard,
  AlertCenterPage,
  IntelFeedDashboard,
  MarketData,
  UniversalSearch,
  CollectionPointConfigCenter,
  RegionManager,
  TaskDistributionPage,
  ResearchReportCreatePage,
  KnowledgeLayout,
  KnowledgeDefaultRedirect,
  KnowledgeCenterPage,
  KnowledgeDetailPage,
  ComprehensiveDashboard,
  LegacyKnowledgeRedirectPage,
  ReviewWorkbench,
} from '../features/market-intel';
import { ExtractionConfigPage } from '../features/extraction-config';
import { systemConfigRoutes } from '../features/system-config';
import {
  PriceReportingDashboard,
  PriceEntryForm,
  PriceReviewPanel,
  BatchPriceEntryTable,
} from '../features/price-reporting';
import { WorkflowDefinitionPage } from '../features/workflow-studio';
import { WorkflowHubPage } from '../features/workflow-studio/components/WorkflowHubPage';
import { WorkflowConfigPage } from '../features/workflow-studio/components/WorkflowConfigPage';
import { AgentChatPanel } from '../features/agent-chat';
import { ConversationalWorkbench } from '../features/workflow-studio/components/ConversationalWorkbench';

// Backward-compatible redirect: /workstation/report/:type -> unified editor
const WorkstationReportRedirect = () => {
  const { type } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const knowledgeType = (type || 'daily').toUpperCase();
  const taskId = searchParams.get('taskId');
  const reportId = searchParams.get('reportId');

  let target = `/intel/knowledge/reports/create?knowledgeType=${knowledgeType}`;
  if (taskId) target += `&taskId=${taskId}`;
  if (reportId) target += `&reportId=${reportId}`;

  return <Navigate to={target} replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },

      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'users',
        element: <UserList />,
      },
      {
        path: 'roles',
        element: <RoleList />,
      },
      {
        path: 'market/categories',
        element: <CategoryList />,
      },
      {
        path: 'market/info',
        children: [
          { index: true, element: <InfoList /> },
          { path: 'new', element: <InfoEditor /> },
          { path: 'edit/:id', element: <InfoEditor /> },
        ],
      },
      {
        path: 'organization',
        children: [
          { index: true, element: <OrgList /> },
          { path: 'departments', element: <DeptList /> },
          { path: 'manage', element: <OrgUserManagement /> },
        ],
      },
      {
        path: 'enterprise',
        element: <EnterpriseDashboard />,
      },
      {
        path: 'workflow/definitions',
        element: <WorkflowDefinitionPage />,
      },
      {
        path: 'workflow/hub',
        element: <WorkflowHubPage />,
      },
      {
        path: 'workflow/config',
        element: <WorkflowConfigPage />,
      },
      {
        path: 'workflow/insight',
        element: <Navigate to="/workflow/hub?tab=analytics" replace />,
      },
      {
        path: 'workflow/assistant',
        element: (
          <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)' }}>
            <ConversationalWorkbench />
          </div>
        ),
      },
      {
        path: 'workflow/metrics',
        element: <Navigate to="/workflow/hub?tab=analytics" replace />,
      },
      {
        path: 'workflow/quality',
        element: <Navigate to="/workflow/hub?tab=connectors" replace />,
      },
      // ── 兼容重定向（精简保留关键入口） ──
      { path: 'workflow/agents', element: <Navigate to="/workflow/config?tab=agents" replace /> },
      { path: 'workflow/prompts', element: <Navigate to="/workflow/config?tab=prompts" replace /> },
      {
        path: 'system',
        children: [
          { path: 'tags', element: <GlobalTagList /> },
          { path: 'tag-groups', element: <TagGroupList /> },
          { path: 'regions', element: <RegionManager /> },
          ...systemConfigRoutes, // [NEW] Add System Config Routes
        ],
      },
      {
        path: 'intel',
        children: [
          { index: true, element: <SuperDashboard /> },
          { path: 'dashboard', element: <Navigate to="/intel" replace /> },
          { path: 'workbench', element: <Navigate to="/intel/feed" replace /> },
          { path: 'search', element: <UniversalSearch /> },

          { path: 'entry', element: <DataEntry /> },
          { path: 'market-data', element: <MarketData /> },
          { path: 'alerts', element: <AlertCenterPage /> },
          { path: 'feed', element: <IntelFeedDashboard /> },
          { path: 'feed/:id', element: <IntelFeedDashboard /> },

          {
            path: 'knowledge',
            children: [
              { index: true, element: <KnowledgeDefaultRedirect /> },
              {
                path: 'items',
                element: (
                  <KnowledgeLayout>
                    <KnowledgeCenterPage />
                  </KnowledgeLayout>
                ),
              },
              {
                path: 'dashboard',
                element: (
                  <KnowledgeLayout>
                    <ComprehensiveDashboard />
                  </KnowledgeLayout>
                ),
              },
              { path: 'items/:id', element: <KnowledgeDetailPage /> },
              { path: 'legacy/:source/:id', element: <LegacyKnowledgeRedirectPage /> },
              { path: 'documents/:id', element: <LegacyKnowledgeRedirectPage source="intel" /> },
              { path: 'reports/create', element: <ResearchReportCreatePage /> },
              { path: 'reports/:id', element: <LegacyKnowledgeRedirectPage source="report" /> },

              { path: 'reports/:id/edit', element: <ResearchReportCreatePage /> },
            ],
          },
          { path: 'leaderboard', element: <Leaderboard /> },
          { path: 'collection-points', element: <CollectionPointConfigCenter /> },
          { path: 'tasks', element: <TaskDistributionPage /> },
          { path: 'monitor', element: <Navigate to="/intel/tasks" replace /> },
          { path: 'extraction-config', element: <ExtractionConfigPage /> },
        ],
      },
      // 审核管理路由
      {
        path: 'review',
        children: [
          { path: 'price', element: <PriceReviewPanel /> },
          { path: 'reports', element: <ReviewWorkbench /> },
        ],
      },
      // Legacy redirects kept for bookmark compatibility
      { path: 'intel/research-reports', element: <Navigate to="/intel/knowledge?tab=library&content=reports" replace /> },
      { path: 'intel/research-reports/:id', element: <LegacyKnowledgeRedirectPage source="report" /> },
      // 我的工作台路由
      {
        path: 'workstation',
        children: [
          { index: true, element: <PriceReportingDashboard /> },
          { path: 'bulk', element: <BatchPriceEntryTable /> },
          { path: 'submit/:pointId', element: <PriceEntryForm /> },
          { path: 'review', element: <Navigate to="/review/price" replace /> },
          {
            path: 'report/:type',
            element: <WorkstationReportRedirect />,
          },
        ],
      },
      // 价格填报模块路由（兼容旧路径，重定向到 /workstation）
      {
        path: 'price-reporting',
        children: [
          { index: true, element: <Navigate to="/workstation" replace /> },
          { path: 'bulk', element: <Navigate to="/workstation/bulk" replace /> },
          { path: 'submit/:pointId', element: <PriceEntryForm /> },
          { path: 'review', element: <Navigate to="/review/price" replace /> },
        ],
      },
      // 历史设置中心路由兼容（菜单/书签）
      {
        path: 'settings',
        children: [
          { path: 'general', element: <Navigate to="/system/config/rules" replace /> },
          { path: 'security', element: <Navigate to="/system/config/ai-models" replace /> },
        ],
      },
      // 全局兜底，避免 React Router 默认 ErrorBoundary 报 no route matched
      {
        path: '*',
        element: <Navigate to="/dashboard" replace />,
      },
    ],
  },
]);

import { createBrowserRouter, Navigate } from 'react-router-dom';
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
  Dashboard,
  DataEntry,
  Leaderboard,
  AlertCenterPage,
  IntelligenceFeed,
  MarketData,
  KnowledgeBase,
  OperationalWorkbench,
  UniversalSearch,
  CollectionPointConfigCenter,
  RegionManager,
  TaskDistributionPage,
  TaskMonitor,
  ResearchReportListPage,
  ResearchReportDashboard,
  ResearchReportCreatePage,
  KnowledgeLayout,
  KnowledgeDefaultRedirect,
  Workbench,
  KnowledgeCenterPage,
  KnowledgeDetailPage,
  KnowledgeDashboardPage,
  LegacyKnowledgeRedirectPage,
  ReportEntryForm,
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
import { WorkflowExecutionPage } from '../features/workflow-runtime';
import { DecisionRulePackPage } from '../features/workflow-rule-center';
import { AgentProfilePage } from '../features/workflow-agent-center';
import { ParameterSetPage } from '../features/workflow-parameter-center';
import { DataConnectorPage } from '../features/workflow-data-connector';
import { TriggerGatewayPage } from '../features/trigger-gateway';
import { DecisionRecordPage } from '../features/decision-record';
import { ReportExportPage } from '../features/report-export';
import { ExperimentEvaluationPage } from '../features/workflow-experiment';
import { ExecutionAnalyticsDashboard } from '../features/execution-analytics';
import { AgentWorkbenchPage } from '../features/agent-workbench';
import { TemplateMarketPage } from '../features/template-market';
import { FuturesSimPage } from '../features/futures-sim';

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
        path: 'workflow/executions',
        element: <WorkflowExecutionPage />,
      },
      {
        path: 'workflow/rules',
        element: <DecisionRulePackPage />,
      },
      {
        path: 'workflow/agents',
        element: <AgentProfilePage />,
      },
      {
        path: 'workflow/parameters',
        element: <ParameterSetPage />,
      },
      {
        path: 'workflow/connectors',
        element: <DataConnectorPage />,
      },
      {
        path: 'workflow/triggers',
        element: <TriggerGatewayPage />,
      },
      {
        path: 'workflow/decisions',
        element: <DecisionRecordPage />,
      },
      {
        path: 'workflow/exports',
        element: <ReportExportPage />,
      },
      {
        path: 'workflow/experiments',
        element: <ExperimentEvaluationPage />,
      },
      {
        path: 'workflow/analytics',
        element: <ExecutionAnalyticsDashboard />,
      },
      {
        path: 'workflow/workbench',
        element: <AgentWorkbenchPage />,
      },
      {
        path: 'workflow/templates',
        element: <TemplateMarketPage />,
      },
      {
        path: 'workflow/futures',
        element: <FuturesSimPage />,
      },
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
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'workbench', element: <OperationalWorkbench /> },
          { path: 'search', element: <UniversalSearch /> },

          { path: 'entry', element: <DataEntry /> },
          { path: 'market-data', element: <MarketData /> },
          { path: 'alerts', element: <AlertCenterPage /> },
          { path: 'feed', element: <IntelligenceFeed /> },
          { path: 'feed/:id', element: <IntelligenceFeed /> },

          {
            path: 'knowledge',
            children: [
              { index: true, element: <KnowledgeDefaultRedirect /> },
              {
                path: 'workbench',
                element: (
                  <KnowledgeLayout>
                    <Workbench />
                  </KnowledgeLayout>
                ),
              },
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
                    <KnowledgeDashboardPage />
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
          { path: 'monitor', element: <TaskMonitor /> },
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
      {
        path: 'intel/research-reports',
        element: <Navigate to="/intel/knowledge?tab=library&content=reports" replace />,
      },
      {
        path: 'intel/research-reports/:id',
        element: <LegacyKnowledgeRedirectPage source="report" />,
      },
      // 我的工作台路由
      {
        path: 'workstation',
        children: [
          { index: true, element: <PriceReportingDashboard /> },
          { path: 'bulk', element: <BatchPriceEntryTable /> },
          { path: 'submit/:pointId', element: <PriceEntryForm /> },
          { path: 'review', element: <Navigate to="/review/price" replace /> },
          { path: 'report/:type', element: <ReportEntryForm /> },
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

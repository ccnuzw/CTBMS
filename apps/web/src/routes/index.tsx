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
    IntelligenceFeed,
    MarketData,
    KnowledgeBase,
    OperationalWorkbench,
    UniversalSearch,
    CollectionPointManager,
    RegionManager,
    TaskDistributionPage,
    TaskMonitor,
    ResearchReportListPage,
    ResearchReportDetailPage,
    ResearchReportDashboard,
    ResearchReportCreatePage,
    KnowledgePortal,
    KnowledgeTabs,
    Workbench,
    DocumentDetailPage,
} from '../features/market-intel';
import { ExtractionConfigPage } from '../features/extraction-config';
import { systemConfigRoutes } from '../features/system-config';
import {
    PriceReportingDashboard,
    PriceEntryForm,
    PriceReviewPanel,
    TaskTemplateManager,
    BatchPriceEntryTable,
} from '../features/price-reporting';
import { TaskAllocationWorkbench, CollectionPointAllocationCenter } from '../features/market-intel';

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
                path: 'admin',
                children: [
                    { path: 'task-allocation', element: <TaskAllocationWorkbench /> },
                ]
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
                ]
            },
            {
                path: 'organization',
                children: [
                    { index: true, element: <OrgList /> },
                    { path: 'departments', element: <DeptList /> },
                    { path: 'manage', element: <OrgUserManagement /> },
                ]
            },
            {
                path: 'enterprise',
                element: <EnterpriseDashboard />,
            },
            {
                path: 'system',
                children: [
                    { path: 'tags', element: <GlobalTagList /> },
                    { path: 'tag-groups', element: <TagGroupList /> },
                    { path: 'regions', element: <RegionManager /> },
                    ...systemConfigRoutes, // [NEW] Add System Config Routes
                ]
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
                    { path: 'feed', element: <IntelligenceFeed /> },
                    { path: 'feed/:id', element: <IntelligenceFeed /> },

                    {
                        path: 'knowledge',
                        children: [
                            { index: true, element: <KnowledgeTabs /> },
                            { path: 'workbench', element: <Workbench /> },
                            { path: 'documents/:id', element: <DocumentDetailPage /> },
                            { path: 'reports/create', element: <ResearchReportCreatePage /> },
                            { path: 'reports/:id', element: <ResearchReportDetailPage /> },
                            { path: 'reports/:id/edit', element: <ResearchReportCreatePage /> },
                        ]
                    },
                    { path: 'leaderboard', element: <Leaderboard /> },
                    { path: 'collection-points', element: <CollectionPointManager /> },
                    { path: 'tasks', element: <TaskDistributionPage /> },
                    { path: 'monitor', element: <TaskMonitor /> },
                    { path: 'extraction-config', element: <ExtractionConfigPage /> },
                ]
            },
            // 价格填报模块路由
            {
                path: 'price-reporting',
                children: [
                    { index: true, element: <PriceReportingDashboard /> },
                    { path: 'bulk', element: <BatchPriceEntryTable /> },
                    { path: 'submit/:pointId', element: <PriceEntryForm /> },
                    { path: 'allocation', element: <CollectionPointAllocationCenter defaultMode="POINT_COVERAGE" /> },
                    { path: 'review', element: <PriceReviewPanel /> },
                    { path: 'templates', element: <TaskTemplateManager /> },
                ]
            },
        ],
    },
]);

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
                path: 'system',
                children: [
                    { path: 'tags', element: <GlobalTagList /> },
                    { path: 'tag-groups', element: <TagGroupList /> },
                ]
            },
        ],
    },
]);


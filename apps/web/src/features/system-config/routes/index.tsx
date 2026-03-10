
import { RouteObject } from 'react-router-dom';
import { LogicRulesPage } from '../components/LogicRulesPage';
import { AIModelConfigPage } from '../components/AIModelConfigPage';
import { PromptTemplatePage } from '../components/PromptTemplatePage';
import { DataSeeding } from '../components/DataSeeding';
import { DataDictionaryPage } from '../components/DataDictionaryPage';
import { FeatureFlagPage } from '../components/FeatureFlagPage';
import { ConnectorHealthDashboard } from '../components/ConnectorHealthDashboard';
import { AuditTracePanel } from '../components/AuditTracePanel';

export const systemConfigRoutes: RouteObject[] = [
    {
        path: 'config',
        children: [
            {
                path: 'rules',
                element: <LogicRulesPage />,
            },
            {
                path: 'ai-models',
                element: <AIModelConfigPage />,
            },
            {
                path: 'prompts',
                element: <PromptTemplatePage />,
            },
            {
                path: 'dictionaries',
                element: <DataDictionaryPage />,
            },
            {
                path: 'seeding',
                element: <DataSeeding />,
            },
            {
                path: 'feature-flags',
                element: <FeatureFlagPage />,
            },
            {
                path: 'connector-health',
                element: <ConnectorHealthDashboard />,
            },
            {
                path: 'audit-trace',
                element: <AuditTracePanel />,
            },
        ],
    },
];

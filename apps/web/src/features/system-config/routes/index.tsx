
import { RouteObject } from 'react-router-dom';
import { LogicRulesPage } from '../components/LogicRulesPage';
import { AIModelConfigPage } from '../components/AIModelConfigPage';
import { PromptTemplatePage } from '../components/PromptTemplatePage';
import { DataSeeding } from '../components/DataSeeding';

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
                path: 'seeding',
                element: <DataSeeding />,
            },
        ],
    },
];

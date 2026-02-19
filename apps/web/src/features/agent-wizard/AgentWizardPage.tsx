
import React from 'react';
import { WizardLayout } from './WizardLayout';
import { PageContainer } from '@ant-design/pro-components';

export const AgentWizardPage = () => {
    return (
        <PageContainer
            header={{
                title: 'Create Agent (Wizard)',
                breadcrumb: {
                    items: [
                        { path: '/workflow/agents', title: 'Agents' },
                        { title: 'Create Wizard' },
                    ],
                },
            }}
        >
            <WizardLayout />
        </PageContainer>
    );
};

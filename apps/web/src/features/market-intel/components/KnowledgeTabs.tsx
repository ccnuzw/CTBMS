import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    DatabaseOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { UnifiedKnowledgeBase } from './UnifiedKnowledgeBase';
import { Workbench } from './Workbench';

export const KnowledgeTabs: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab');

    const items = [
        {
            key: 'workbench',
            label: (
                <span>
                    <ThunderboltOutlined />
                    工作台
                </span>
            ),
            children: <Workbench />
        },
        {
            key: 'library',
            label: (
                <span>
                    <DatabaseOutlined />
                    知识库
                </span>
            ),
            children: <UnifiedKnowledgeBase />
        },
    ];
    const validTabs = ['workbench', 'library'];

    React.useEffect(() => {
        const legacyContent = searchParams.get('type') ||
            (rawTab === 'reports' ? 'reports' : rawTab === 'documents' ? 'documents' : null);

        if (legacyContent) {
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'library');
            next.set('content', legacyContent);
            next.delete('type');
            if (next.toString() !== searchParams.toString()) {
                setSearchParams(next, { replace: true });
            }
            return;
        }

        if (rawTab === 'analytics' || rawTab === 'overview') {
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'workbench');
            if (next.toString() !== searchParams.toString()) {
                setSearchParams(next, { replace: true });
            }
            return;
        }

        if (rawTab && !validTabs.includes(rawTab)) {
            const next = new URLSearchParams(searchParams);
            next.set('tab', 'workbench');
            if (next.toString() !== searchParams.toString()) {
                setSearchParams(next, { replace: true });
            }
        }
    }, [searchParams, rawTab, setSearchParams]);

    const tab = rawTab && validTabs.includes(rawTab) ? rawTab : 'workbench';

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'auto', background: '#f5f5f5' }}>
                {items.find(item => item.key === tab)?.children}
            </div>
        </div>
    );
};

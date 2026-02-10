import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    BarChartOutlined,
    DatabaseOutlined,
    FormOutlined,
    ThunderboltOutlined,
    CloudUploadOutlined,
} from '@ant-design/icons';
import { Button, Card, Segmented, Space, theme } from 'antd';

export const KnowledgeLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { token } = theme.useToken();

    // Determine active tab based on current path
    const activeTab = React.useMemo(() => {
        const path = location.pathname;
        if (path.includes('/intel/knowledge/workbench')) return 'workbench';
        if (path.includes('/intel/knowledge/items')) return 'items';
        if (path.includes('/intel/knowledge/dashboard')) return 'dashboard';
        return 'workbench';
    }, [location.pathname]);

    const handleTabChange = (value: string | number) => {
        switch (String(value)) {
            case 'workbench':
                navigate('/intel/knowledge/workbench');
                break;
            case 'items':
                navigate('/intel/knowledge/items');
                break;
            case 'dashboard':
                navigate('/intel/knowledge/dashboard');
                break;
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f7fb' }}>
            <div style={{ padding: '16px 24px 0 24px', flexShrink: 0 }}>
                <Card
                    bodyStyle={{ padding: '12px 16px' }}
                    style={{ borderRadius: 12, marginBottom: 16, borderColor: '#e9edf5' }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Segmented
                            value={activeTab}
                            onChange={handleTabChange}
                            options={[
                                {
                                    label: (
                                        <Space>
                                            <ThunderboltOutlined />
                                            工作台
                                        </Space>
                                    ),
                                    value: 'workbench',
                                },
                                {
                                    label: (
                                        <Space>
                                            <DatabaseOutlined />
                                            知识列表
                                        </Space>
                                    ),
                                    value: 'items',
                                },
                                {
                                    label: (
                                        <Space>
                                            <BarChartOutlined />
                                            分析看板
                                        </Space>
                                    ),
                                    value: 'dashboard',
                                },
                            ]}
                        />
                        <Space>
                            <Button icon={<CloudUploadOutlined />} onClick={() => navigate('/intel/entry')}>
                                快速采集
                            </Button>
                            <Button
                                type="primary"
                                icon={<FormOutlined />}
                                onClick={() => navigate('/intel/knowledge/reports/create')}
                            >
                                新建研报
                            </Button>
                        </Space>
                    </div>
                </Card>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {children || <Outlet />}
            </div>
        </div>
    );
};

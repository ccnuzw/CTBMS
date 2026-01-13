import React from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import theme from './theme/themeConfig';
import { router } from './routes';

const queryClient = new QueryClient();

const App: React.FC = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <ConfigProvider theme={theme}>
                <AntdApp>
                    <RouterProvider router={router} />
                </AntdApp>
            </ConfigProvider>
        </QueryClientProvider>
    );
}

export default App;

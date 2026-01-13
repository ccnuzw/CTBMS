import React from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext';
import { router } from './routes';

const queryClient = new QueryClient();

const App: React.FC = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <AntdApp>
                    <RouterProvider router={router} />
                </AntdApp>
            </ThemeProvider>
        </QueryClientProvider>
    );
}

export default App;

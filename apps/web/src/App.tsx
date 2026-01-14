import React from 'react';
import { App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeContext';
import { router } from './routes';

const queryClient = new QueryClient({
    defaultOptions: {
        mutations: {
            retry: false, // Don't retry failed mutations
        },
        queries: {
            retry: 1, // Only retry queries once
            staleTime: 5000, // Consider data fresh for 5 seconds
        },
    },
});

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


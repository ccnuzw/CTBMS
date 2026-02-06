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
            // 优化：仅忽略 400 类业务错误（通常由 UI 处理），保留 500 系统错误以便调试
            onError: (error: any) => {
                const status = error?.response?.status;
                // 如果不是 4xx 错误（如 500 服务器错误或网络故障），则打印日志
                if (!status || status < 400 || status >= 500) {
                    console.error('[Mutation Error]', error);
                }
            },
        },
        queries: {
            retry: 1, // Only retry queries once
            staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes (reduced for better UX)
            cacheTime: 10 * 60 * 1000, // Cache for 10 minutes before garbage collection (v4 syntax)
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


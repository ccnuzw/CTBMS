import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
    baseURL: '/api', // Use relative path to work with Vite proxy and Nginx
    timeout: 120000, // 120秒超时，复杂日报 AI 分析可能需要较长时间
});

apiClient.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        try {
            const raw = window.localStorage.getItem('ctbms_virtual_login_user');
            if (raw) {
                const parsed = JSON.parse(raw) as { id?: string };
                if (parsed?.id) {
                    config.headers = {
                        ...config.headers,
                        'x-virtual-user-id': parsed.id,
                    };
                }
            } else if (config.headers && 'x-virtual-user-id' in config.headers) {
                delete (config.headers as Record<string, unknown>)['x-virtual-user-id'];
            }
        } catch {
            // Ignore localStorage errors
        }
    }
    return config;
});

// 响应错误信息提取
export const getErrorMessage = (error: unknown): string => {
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ message?: string | string[] }>;
        const data = axiosError.response?.data;
        if (data?.message) {
            // NestJS 可能返回数组形式的验证错误
            return Array.isArray(data.message) ? data.message.join('; ') : data.message;
        }
        return axiosError.message || '请求失败';
    }
    return '请求失败';
};

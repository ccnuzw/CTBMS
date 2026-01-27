import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
    baseURL: '/api', // Use relative path to work with Vite proxy and Nginx
    timeout: 120000, // 120秒超时，复杂日报 AI 分析可能需要较长时间
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


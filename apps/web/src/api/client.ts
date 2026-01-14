import axios, { AxiosError } from 'axios';

export const apiClient = axios.create({
    baseURL: 'http://localhost:3000', // Should be env variable ideally
    timeout: 10000,
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


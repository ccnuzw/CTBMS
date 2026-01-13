import axios from 'axios';
import { message } from 'antd';

export const apiClient = axios.create({
    baseURL: 'http://localhost:3000', // Should be env variable ideally
    timeout: 10000,
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        // const msg = error.response?.data?.message || '请求失败';
        // message.error(msg); // Removed to avoid static usage warning. 
        // Errors should be handled by the caller or a global error handler component.
        return Promise.reject(error);
    }
);

import type { ThemeConfig } from 'antd';

const theme: ThemeConfig = {
    token: {
        fontSize: 14,
        colorPrimary: '#0A74DA',
        borderRadius: 6,
        colorBgLayout: '#F0F2F5',
    },
    components: {
        Layout: {
            bodyBg: '#F0F2F5',
            headerBg: '#FFFFFF',
            siderBg: '#FFFFFF',
        },
        Menu: {
            itemSelectedColor: '#0A74DA',
            itemSelectedBg: '#E6F7FF',
        },
    },
};

export default theme;

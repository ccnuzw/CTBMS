import type { ThemeConfig } from 'antd';

const theme: ThemeConfig = {
    token: {
        fontSize: 14,
        colorPrimary: '#0A74DA',
        borderRadius: 6,
    },
    components: {
        Menu: {
            itemSelectedColor: '#0A74DA',
        },
    },
};

export default theme;

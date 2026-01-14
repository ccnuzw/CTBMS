import React from 'react';
import { Segmented, ConfigProvider, theme } from 'antd';
import { SunOutlined, MoonOutlined, DesktopOutlined } from '@ant-design/icons';
import { useTheme } from '../theme/ThemeContext';

export const ThemeSwitcher: React.FC = () => {
    const { themeMode, setThemeMode } = useTheme();
    const { token } = theme.useToken();

    return (
        <ConfigProvider
            theme={{
                components: {
                    Segmented: {
                        itemSelectedBg: token.colorPrimary,
                        // itemSelectedColor: '#fff',
                        // trackBg: token.colorFillTertiary,
                    }
                }
            }}
        >
            <Segmented
                value={themeMode}
                onChange={(value) => setThemeMode(value as 'light' | 'dark' | 'system')}
                options={[
                    {
                        value: 'light',
                        icon: <SunOutlined />,
                    },
                    {
                        value: 'dark',
                        icon: <MoonOutlined />,
                    },
                    {
                        value: 'system',
                        icon: <DesktopOutlined />,
                    },
                ]}
                style={{
                    borderRadius: 20, // Rounded style as per image
                    padding: 2
                }}
            />
        </ConfigProvider>
    );
};

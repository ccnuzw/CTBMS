import React, { createContext, useContext, useEffect, useState } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import baseTheme from './themeConfig';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    themeMode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => void;
    isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem('themeMode');
        return (saved as ThemeMode) || 'system';
    });

    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        localStorage.setItem('themeMode', themeMode);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const updateTheme = () => {
            const isDarkMatches = themeMode === 'system' ? mediaQuery.matches : themeMode === 'dark';
            setIsDark(isDarkMatches);

            if (isDarkMatches) {
                document.body.classList.add('dark');
            } else {
                document.body.classList.remove('dark');
            }
        };

        updateTheme();

        const handler = () => {
            if (themeMode === 'system') {
                updateTheme();
            }
        };

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, [themeMode]);

    return (
        <ThemeContext.Provider value={{ themeMode, setThemeMode, isDarkMode: isDark }}>
            <ConfigProvider
                locale={zhCN}
                theme={{
                    ...baseTheme,
                    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
                    token: {
                        ...baseTheme.token,
                        // Override specific tokens for dark mode if needed here, 
                        // or rely on the algorithm + base tokens
                    }
                }}
            >
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
};

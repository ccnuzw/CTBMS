import React from 'react';
import { ConfigProvider, App as AntdApp } from 'antd';
import theme from './theme/themeConfig';

const App: React.FC = () => {
    return (
        <ConfigProvider theme={theme}>
            <AntdApp>
                <div className="App">
                    <h1>CTBMS Frontend Initialized</h1>
                </div>
            </AntdApp>
        </ConfigProvider>
    );
}

export default App;

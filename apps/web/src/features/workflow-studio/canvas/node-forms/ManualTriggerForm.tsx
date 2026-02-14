import React from 'react';
import { Alert, Form } from 'antd';

export const ManualTriggerForm: React.FC = () => {
    return (
        <Form layout="vertical" size="small">
            <Alert message="该节点将在手动点击运行时触发，无需配置" type="info" showIcon />
        </Form>
    );
};

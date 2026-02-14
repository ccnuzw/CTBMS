import React from 'react';
import { Tag, Tooltip } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';

interface ParameterInheritanceStatusProps {
    defaultValue: unknown;
    currentValue: unknown;
    hasDefault: boolean;
}

export const ParameterInheritanceStatus: React.FC<ParameterInheritanceStatusProps> = ({
    defaultValue,
    currentValue,
    hasDefault,
}) => {
    if (!hasDefault) {
        return (
            <Tooltip title="此参数为当前集合独有，未在模板中定义">
                <Tag color="geekblue" icon={<InfoCircleOutlined />}>
                    自有参数
                </Tag>
            </Tooltip>
        );
    }

    const isOverridden = JSON.stringify(currentValue) !== JSON.stringify(defaultValue);

    if (isOverridden) {
        return (
            <Tooltip title="当前值与模板默认值不同">
                <Tag color="orange" icon={<ExclamationCircleOutlined />}>
                    已覆盖
                </Tag>
            </Tooltip>
        );
    }

    return (
        <Tooltip title="当前值继承自模板默认值">
            <Tag color="green" icon={<CheckCircleOutlined />}>
                继承
            </Tag>
        </Tooltip>
    );
};

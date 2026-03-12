import React, { useEffect } from 'react';
import { Segmented, Tooltip, theme } from 'antd';
import {
    useWorkflowUxMode,
    type WorkflowUxMode,
} from '../hooks/useWorkflowUxMode';

const MODE_OPTIONS: Array<{
    value: WorkflowUxMode;
    label: string;
    tip: string;
}> = [
        {
            value: 'simple',
            label: '🟢 简洁',
            tip: '隐藏技术细节，只显示必要的业务操作',
        },
        {
            value: 'standard',
            label: '🔵 标准',
            tip: '包含核心画布功能和常用配置项',
        },
        {
            value: 'expert',
            label: '🟣 专家',
            tip: '显示全部功能：版本管理、运行策略、高级校验等',
        },
    ];

export const WorkflowUxModeSwitcher: React.FC = () => {
    const { token } = theme.useToken();
    const mode = useWorkflowUxMode((s) => s.mode);
    const setMode = useWorkflowUxMode((s) => s.setMode);
    const syncFromServer = useWorkflowUxMode((s) => s.syncFromServer);

    useEffect(() => {
        syncFromServer();
    }, [syncFromServer]);

    return (
        <Tooltip title="切换界面复杂度级别" placement="bottomRight">
            <Segmented
                size="small"
                value={mode}
                onChange={(value) => setMode(value as WorkflowUxMode)}
                options={MODE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: (
                        <Tooltip title={option.tip} placement="bottom">
                            <span>{option.label}</span>
                        </Tooltip>
                    ),
                }))}
                style={{
                    backgroundColor: token.colorFillAlter,
                }}
            />
        </Tooltip>
    );
};

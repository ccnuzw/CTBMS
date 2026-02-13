import React from 'react';
import { Button, Divider, Space, Tooltip, theme, Popconfirm } from 'antd';
import {
    UndoOutlined,
    RedoOutlined,
    ZoomInOutlined,
    ZoomOutOutlined,
    FullscreenOutlined,
    ApartmentOutlined,
    SaveOutlined,
    DownloadOutlined,
    DeleteOutlined,
} from '@ant-design/icons';
import { useReactFlow } from '@xyflow/react';

interface CanvasToolbarProps {
    onSave: () => void;
    onExportDsl: () => void;
    onAutoLayout: () => void;
    onClearCanvas: () => void;
    isSaving?: boolean;
    hasUnsavedChanges?: boolean;
}

/**
 * 画布工具栏
 *
 * 位于画布顶部，提供操作按钮：
 * - 缩放控制（放大/缩小/适应画布）
 * - 自动布局
 * - 保存 DSL / 导出 DSL JSON
 * - 清空画布
 */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
    onSave,
    onExportDsl,
    onAutoLayout,
    onClearCanvas,
    isSaving = false,
    hasUnsavedChanges = false,
}) => {
    const { token } = theme.useToken();
    const { zoomIn, zoomOut, fitView } = useReactFlow();

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                background: token.colorBgContainer,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            <Space size={4}>
                <Tooltip title="放大">
                    <Button
                        type="text"
                        size="small"
                        icon={<ZoomInOutlined />}
                        onClick={() => zoomIn()}
                    />
                </Tooltip>
                <Tooltip title="缩小">
                    <Button
                        type="text"
                        size="small"
                        icon={<ZoomOutOutlined />}
                        onClick={() => zoomOut()}
                    />
                </Tooltip>
                <Tooltip title="适应画布">
                    <Button
                        type="text"
                        size="small"
                        icon={<FullscreenOutlined />}
                        onClick={() => fitView({ padding: 0.2, duration: 300 })}
                    />
                </Tooltip>

                <Divider type="vertical" />

                <Tooltip title="自动布局">
                    <Button
                        type="text"
                        size="small"
                        icon={<ApartmentOutlined />}
                        onClick={onAutoLayout}
                    />
                </Tooltip>
            </Space>

            <Space size={8}>
                <Tooltip title="导出 DSL JSON">
                    <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={onExportDsl}
                    >
                        导出
                    </Button>
                </Tooltip>

                <Popconfirm
                    title="确定清空画布？"
                    description="此操作将删除所有节点和连线"
                    onConfirm={onClearCanvas}
                    okText="确定"
                    cancelText="取消"
                >
                    <Tooltip title="清空画布">
                        <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                        />
                    </Tooltip>
                </Popconfirm>

                <Button
                    type="primary"
                    size="small"
                    icon={<SaveOutlined />}
                    loading={isSaving}
                    onClick={onSave}
                >
                    保存{hasUnsavedChanges ? ' *' : ''}
                </Button>
            </Space>
        </div>
    );
};

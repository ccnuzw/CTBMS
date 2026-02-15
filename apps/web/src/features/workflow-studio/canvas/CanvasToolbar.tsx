import React from 'react';
import { Button, Divider, Space, Tooltip, Segmented, theme, Popconfirm, Select, Typography } from 'antd';
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
    PlayCircleOutlined,
    CodeOutlined,
    DragOutlined,
    SelectOutlined,
    LayoutOutlined,
    AlignLeftOutlined,
    AlignCenterOutlined,
    AlignRightOutlined,
    VerticalAlignTopOutlined,
    VerticalAlignMiddleOutlined,
    VerticalAlignBottomOutlined,
    TableOutlined,
} from '@ant-design/icons';
import { useReactFlow } from '@xyflow/react';

interface CanvasToolbarProps {
    onSave: () => void;
    onExportDsl: () => void;
    onAutoLayout?: () => void;
    onClearCanvas?: () => void;
    isSaving?: boolean;
    hasUnsavedChanges?: boolean;
    onRun?: () => void;
    onToggleLogs?: () => void;
    selectionMode?: 'hand' | 'pointer';
    onSelectionModeChange?: (mode: 'hand' | 'pointer') => void;
    snapToGrid?: boolean;
    onToggleSnapToGrid?: () => void;
    onAlign?: (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    workflowMode?: 'linear' | 'dag' | 'debate';
    onWorkflowModeChange?: (mode: 'linear' | 'dag' | 'debate') => void;
    onToggleDebatePanel?: () => void;
    onPublish?: () => void;
    onApplyRuntimePreset?: (preset: 'FAST' | 'BALANCED' | 'ROBUST') => void;
    viewLevel?: 'business' | 'enhanced' | 'expert';
    onViewLevelChange?: (level: 'business' | 'enhanced' | 'expert') => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

const { Text } = Typography;

/**
 * 画布工具栏
 *
 * 位于画布顶部，提供操作按钮：
 * - 缩放控制（放大/缩小/适应画布）
 * - 自动布局
 * - 保存 DSL / 导出 DSL JSON
 * - 清空画布
 * - 运行/日志 (如果提供)
 * - 模式切换 (移动/选择)
 */
export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
    onSave,
    onExportDsl,
    onAutoLayout,
    onClearCanvas,
    isSaving = false,
    hasUnsavedChanges = false,
    onRun,
    onToggleLogs,
    selectionMode = 'hand',
    onSelectionModeChange,
    snapToGrid = true,
    onToggleSnapToGrid,
    onAlign,
    workflowMode = 'dag',
    onWorkflowModeChange,
    onToggleDebatePanel,
    onPublish,
    onApplyRuntimePreset,
    viewLevel = 'business',
    onViewLevelChange,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
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
                position: 'relative',
                flexWrap: 'wrap',
                gap: 8,
            }}
        >
            <Space size={4} wrap>
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

                <Space size={8} align="center">
                    <Text type="secondary" style={{ fontSize: 12 }}>模式:</Text>
                    <Select
                        value={workflowMode}
                        onChange={onWorkflowModeChange}
                        size="small"
                        options={[
                            { value: 'linear', label: '线性流' },
                            { value: 'dag', label: 'DAG' },
                            { value: 'debate', label: '辩论模式' },
                        ]}
                        style={{ width: 100 }}
                        bordered={false}
                    />
                </Space>

                <Space size={8} align="center">
                    <Text type="secondary" style={{ fontSize: 12 }}>视图:</Text>
                    <Segmented
                        size="small"
                        value={viewLevel}
                        onChange={(value) => onViewLevelChange?.(value as 'business' | 'enhanced' | 'expert')}
                        options={[
                            { label: '业务', value: 'business' },
                            { label: '增强', value: 'enhanced' },
                            { label: '专家', value: 'expert' },
                        ]}
                    />
                </Space>

                <Divider type="vertical" />

                <Segmented
                    value={selectionMode}
                    onChange={(val) => onSelectionModeChange?.(val as 'hand' | 'pointer')}
                    options={[
                        {
                            value: 'pointer',
                            icon: <SelectOutlined />,
                            label: '选择',
                        },
                        {
                            value: 'hand',
                            icon: <DragOutlined />,
                            label: '移动',
                        },
                    ]}
                    size="small"
                />

                <Tooltip title="自动布局 (Auto Layout)">
                    <Button
                        type="text"
                        size="small"
                        icon={<LayoutOutlined />}
                        onClick={onAutoLayout}
                    />
                </Tooltip>

                <Divider type="vertical" />

                <Tooltip title={`网格吸附 ${snapToGrid ? '开' : '关'}`}>
                    <Button
                        type={snapToGrid ? 'primary' : 'text'}
                        size="small"
                        icon={<TableOutlined />}
                        onClick={onToggleSnapToGrid}
                        ghost={snapToGrid}
                        style={snapToGrid ? { color: token.colorPrimary } : undefined}
                    />
                </Tooltip>

                {onAlign && (
                    <>
                        <Divider type="vertical" />
                        <Space size={2}>
                            <Tooltip title="左对齐">
                                <Button size="small" type="text" icon={<AlignLeftOutlined />} onClick={() => onAlign('left')} />
                            </Tooltip>
                            <Tooltip title="水平居中">
                                <Button size="small" type="text" icon={<AlignCenterOutlined />} onClick={() => onAlign('center')} />
                            </Tooltip>
                            <Tooltip title="右对齐">
                                <Button size="small" type="text" icon={<AlignRightOutlined />} onClick={() => onAlign('right')} />
                            </Tooltip>
                            <Tooltip title="顶对齐">
                                <Button size="small" type="text" icon={<VerticalAlignTopOutlined />} onClick={() => onAlign('top')} />
                            </Tooltip>
                            <Tooltip title="垂直居中">
                                <Button size="small" type="text" icon={<VerticalAlignMiddleOutlined />} onClick={() => onAlign('middle')} />
                            </Tooltip>
                            <Tooltip title="底对齐">
                                <Button size="small" type="text" icon={<VerticalAlignBottomOutlined />} onClick={() => onAlign('bottom')} />
                            </Tooltip>
                        </Space>
                    </>
                )}
                <Divider type="vertical" />
                <Tooltip title="撤销 (Undo)">
                    <Button
                        type="text"
                        size="small"
                        icon={<UndoOutlined />}
                        onClick={onUndo}
                        disabled={!canUndo}
                    />
                </Tooltip>
                <Tooltip title="重做 (Redo)">
                    <Button
                        type="text"
                        size="small"
                        icon={<RedoOutlined />}
                        onClick={onRedo}
                        disabled={!canRedo}
                    />
                </Tooltip>

                {onRun && (
                    <>
                        <Divider type="vertical" />
                        <Tooltip title="运行调试">
                            <Button
                                type="text"
                                size="small"
                                icon={<PlayCircleOutlined />}
                                onClick={onRun}
                            />
                        </Tooltip>
                    </>
                )}

                {onToggleLogs && (
                    <Tooltip title="查看日志">
                        <Button
                            type="text"
                            size="small"
                            icon={<CodeOutlined />}
                            onClick={onToggleLogs}
                        />
                    </Tooltip>
                )}

                {workflowMode === 'debate' && onToggleDebatePanel && (
                    <>
                        <Divider type="vertical" />
                        <Tooltip title="辩论时间线">
                            <Button
                                type="text"
                                size="small"
                                icon={<CodeOutlined />}
                                onClick={onToggleDebatePanel}
                            />
                        </Tooltip>
                    </>
                )}

                {viewLevel !== 'business' && onApplyRuntimePreset ? (
                    <>
                        <Divider type="vertical" />
                        <Space size={6} align="center">
                            <Text type="secondary" style={{ fontSize: 12 }}>批量策略:</Text>
                            <Select
                                size="small"
                                defaultValue="BALANCED"
                                options={[
                                    { label: '快速', value: 'FAST' },
                                    { label: '平衡', value: 'BALANCED' },
                                    { label: '稳健', value: 'ROBUST' },
                                ]}
                                onChange={(value) => onApplyRuntimePreset(value as 'FAST' | 'BALANCED' | 'ROBUST')}
                                style={{ width: 88 }}
                                bordered={false}
                            />
                        </Space>
                    </>
                ) : null}
            </Space>

            <Space size={8} wrap>
                <Tooltip title="撤销">
                    <Button
                        icon={<UndoOutlined />}
                        onClick={onUndo}
                        disabled={!canUndo}
                        size="small"
                        type="text"
                    />
                </Tooltip>
                <Tooltip title="重做">
                    <Button
                        icon={<RedoOutlined />}
                        onClick={onRedo}
                        disabled={!canRedo}
                        size="small"
                        type="text"
                    />
                </Tooltip>
                <Divider type="vertical" />
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
                {onPublish && (
                    <Tooltip title="另存为模板">
                        <Button
                            type="default"
                            size="small"
                            icon={<ApartmentOutlined />}
                            onClick={onPublish}
                        >
                            存为模板
                        </Button>
                    </Tooltip>
                )}
            </Space>
        </div >
    );
};

import React from 'react';
import {
  Button,
  Divider,
  Space,
  Tooltip,
  Segmented,
  theme,
  Popconfirm,
  Select,
  Typography,
  Dropdown,
  type MenuProps,
} from 'antd';
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
  BarChartOutlined,
  MoreOutlined,
  SettingOutlined,
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
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onOpenTelemetrySummary?: () => void;
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

  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onOpenTelemetrySummary,
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
          <Button type="text" size="small" icon={<ZoomInOutlined />} onClick={() => zoomIn()} />
        </Tooltip>
        <Tooltip title="缩小">
          <Button type="text" size="small" icon={<ZoomOutOutlined />} onClick={() => zoomOut()} />
        </Tooltip>
        <Tooltip title="适应全景视图">
          <Button
            type="text"
            size="small"
            icon={<FullscreenOutlined />}
            onClick={() => fitView({ padding: 0.2, duration: 300 })}
          />
        </Tooltip>

        <Divider type="vertical" />

        <Space size={8} align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>
            编排模式:
          </Text>
          <Select
            value={workflowMode}
            onChange={onWorkflowModeChange}
            size="small"
            options={[
              { value: 'linear', label: '顺序执行' },
              { value: 'dag', label: '自由连接' },
              { value: 'debate', label: '多方讨论' },
            ]}
            style={{ width: 100 }}
            bordered={false}
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

        <Tooltip title="自动整理布局">
          <Button type="text" size="small" icon={<LayoutOutlined />} onClick={onAutoLayout} />
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
            <Dropdown
              menu={{
                items: [
                  { key: 'left', label: '左对齐', icon: <AlignLeftOutlined />, onClick: () => onAlign('left') },
                  { key: 'center', label: '水平居中', icon: <AlignCenterOutlined />, onClick: () => onAlign('center') },
                  { key: 'right', label: '右对齐', icon: <AlignRightOutlined />, onClick: () => onAlign('right') },
                  { key: 'top', label: '顶对齐', icon: <VerticalAlignTopOutlined />, onClick: () => onAlign('top') },
                  { key: 'middle', label: '垂直居中', icon: <VerticalAlignMiddleOutlined />, onClick: () => onAlign('middle') },
                  { key: 'bottom', label: '底对齐', icon: <VerticalAlignBottomOutlined />, onClick: () => onAlign('bottom') },
                ],
              }}
              placement="bottomRight"
            >
              <Button type="text" size="small" icon={<AlignCenterOutlined />} />
            </Dropdown>
          </>
        )}
        <Divider type="vertical" />
        <Tooltip title={canUndo ? "撤销上一步" : "没有可撤销的操作"}>
          <Button
            type="text"
            size="small"
            icon={<UndoOutlined />}
            onClick={onUndo}
            disabled={!canUndo}
          />
        </Tooltip>
        <Tooltip title={canRedo ? "重新应用撤销" : "没有可重做的操作"}>
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
            <Tooltip title="试运行">
              <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={onRun} />
            </Tooltip>
          </>
        )}

        {onToggleLogs && (
          <Tooltip title="运行日志">
            <Button type="text" size="small" icon={<CodeOutlined />} onClick={onToggleLogs} />
          </Tooltip>
        )}

        {workflowMode === 'debate' && onToggleDebatePanel && (
          <>
            <Divider type="vertical" />
            <Tooltip title="讨论过程">
              <Button
                type="text"
                size="small"
                icon={<CodeOutlined />}
                onClick={onToggleDebatePanel}
              />
            </Tooltip>
          </>
        )}

      </Space>

      <Space size={8} wrap>
        <Dropdown
          menu={{
            items: [
              onApplyRuntimePreset ? {
                key: 'preset',
                label: '运行方案 (当前: 平衡)',
                icon: <SettingOutlined />,
                children: [
                  { key: 'FAST', label: '快速', onClick: () => onApplyRuntimePreset('FAST') },
                  { key: 'BALANCED', label: '平衡', onClick: () => onApplyRuntimePreset('BALANCED') },
                  { key: 'ROBUST', label: '稳健', onClick: () => onApplyRuntimePreset('ROBUST') },
                ],
              } : null,
              { key: 'export', label: '导出配置', icon: <DownloadOutlined />, onClick: onExportDsl },
              { key: 'telemetry', label: '运行统计', icon: <BarChartOutlined />, onClick: onOpenTelemetrySummary },
              onPublish ? { key: 'publish', label: '存为模板', icon: <ApartmentOutlined />, onClick: onPublish } : null,
              { type: 'divider' },
              {
                key: 'clear',
                label: '清空画布',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => {
                  if (window.confirm('确定清空画布？此操作将删除所有节点和连线')) {
                    onClearCanvas?.();
                  }
                },
              },
            ].filter(Boolean) as MenuProps['items'],
          }}
          placement="bottomRight"
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>

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

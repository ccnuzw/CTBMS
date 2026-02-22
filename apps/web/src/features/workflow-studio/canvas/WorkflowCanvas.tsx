import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type NodeTypes,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, Tag } from 'antd';

import { WorkflowNodeComponent } from './WorkflowNodeComponent';
import { GroupNode } from './GroupNode';
import { NodePalette } from './NodePalette';
import { CanvasToolbar } from './CanvasToolbar';
import { WorkflowPreviewTelemetryDrawer } from './WorkflowPreviewTelemetryDrawer';
import { PropertyPanel } from './PropertyPanel';
import { RunLogPanel } from './RunLogPanel';
import { DebateTimelinePanel } from './DebateTimelinePanel';
import { NodeContextMenu } from './NodeContextMenu';
import { SaveTemplateModal } from './SaveTemplateModal';
import { SmartLinkMenu } from './SmartLinkMenu';
import { CanvasErrorList } from './CanvasErrorList';
import { useWorkflowCanvasViewModel, type WorkflowCanvasProps } from './useWorkflowCanvasViewModel';

const WorkflowCanvasInner: React.FC<WorkflowCanvasProps> = (props) => {
  const vm = useWorkflowCanvasViewModel(props);
  const { state, computed, setters, actions, refs, flowProps } = vm;

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      workflowNode: WorkflowNodeComponent,
      group: GroupNode,
    }),
    [],
  );

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {!props.isReadOnly && <NodePalette viewLevel={state.currentViewLevel} />}

      <div
        ref={refs.canvasRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: computed.token.colorBgLayout,
          position: 'relative',
        }}
      >
        {!props.isReadOnly && (
          <CanvasToolbar
            onSave={actions.handleSave}
            onExportDsl={actions.handleExportDsl}
            onClearCanvas={actions.handleClearCanvas}
            isSaving={state.isSaving}
            onRun={actions.handleRun}
            onToggleLogs={() => setters.setShowLogPanel((v) => !v)}
            selectionMode={state.selectionMode}
            onSelectionModeChange={setters.setSelectionMode}
            workflowMode={state.workflowMode}
            onWorkflowModeChange={setters.setWorkflowMode}
            viewLevel={state.currentViewLevel}
            onViewLevelChange={(level) => {
              setters.setLocalViewLevel(level);
              props.onViewLevelChange?.(level);
            }}
            onUndo={actions.undo}
            onRedo={actions.redo}
            canUndo={computed.canUndo}
            canRedo={computed.canRedo}
            onAutoLayout={actions.onLayout}
            onToggleDebatePanel={() => setters.setShowDebatePanel((v) => !v)}
            snapToGrid={state.snapToGrid}
            onToggleSnapToGrid={() => setters.setSnapToGrid((v) => !v)}
            onAlign={actions.alignNodes}
            onPublish={props.currentVersionId ? () => setters.setIsTemplateModalOpen(true) : undefined}
            onApplyRuntimePreset={actions.handleApplyRuntimePreset}
            onOpenTelemetrySummary={() => setters.setTelemetryDrawerOpen(true)}
          />
        )}

        <div
          style={{ flex: 1, position: 'relative' }}
          onDragOver={actions.handleDragOver}
          onDrop={actions.handleDrop}
        >
          {state.validationErrors.length > 0 && (
            <CanvasErrorList
              errors={state.validationErrors}
              onAutoFix={actions.handleAutoFixValidationIssues}
              autoFixEnabled={computed.hasAutoFixable}
              onStepAutoFix={actions.handleStepAutoFixValidationIssues}
              stepAutoFixEnabled={computed.hasAutoFixable}
              stepAutoFixLoading={state.stepAutoFixLoading}
              stepAutoFixReport={state.stepAutoFixReport}
              onClearStepAutoFixReport={() => setters.setStepAutoFixReport(null)}
              onPreviewAutoFix={actions.handlePreviewAutoFixValidationIssues}
              previewAutoFixEnabled={computed.hasAutoFixable}
              previewAutoFixLoading={state.previewAutoFixLoading}
              autoFixPreview={state.autoFixPreview}
              onClearAutoFixPreview={() => setters.setAutoFixPreview(null)}
              autoFixCodeOptions={computed.autoFixableIssueCodes}
              selectedAutoFixCodes={state.selectedAutoFixCodes}
              onSelectedAutoFixCodesChange={setters.setSelectedAutoFixCodes}
              lastAutoFixActions={state.lastAutoFixActions}
              onClearAutoFixActions={() => setters.setLastAutoFixActions([])}
              onFocusNode={actions.focusNode}
              onFocusEdge={actions.focusEdge}
            />
          )}

          <ReactFlow
            nodes={computed.displayNodes}
            edges={computed.displayEdges}
            onNodesChange={props.isReadOnly ? undefined : flowProps.onNodesChange}
            onEdgesChange={props.isReadOnly ? undefined : flowProps.onEdgesChange}
            onConnect={props.isReadOnly ? undefined : flowProps.onConnect}
            onNodeClick={actions.handleNodeClick}
            onEdgeClick={actions.handleEdgeClick}
            onPaneClick={actions.handlePaneClick}
            onNodeContextMenu={props.isReadOnly ? undefined : actions.onNodeContextMenu}
            onNodeDragStop={props.isReadOnly ? undefined : actions.handleNodeDragStop}
            onConnectStart={props.isReadOnly ? undefined : actions.onConnectStart}
            onConnectEnd={props.isReadOnly ? undefined : actions.onConnectEnd}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid={state.snapToGrid}
            snapGrid={[16, 16]}
            deleteKeyCode={props.isReadOnly ? null : 'Delete'}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { strokeWidth: 2 },
            }}
            proOptions={{ hideAttribution: true }}
            panOnDrag={state.selectionMode === 'hand'}
            selectionOnDrag={state.selectionMode === 'pointer'}
            selectionMode={state.selectionMode === 'pointer' ? SelectionMode.Partial : undefined}
          >
            <Background gap={16} size={1} color={computed.token.colorBorderSecondary} />
            <Controls showInteractive={!props.isReadOnly && props.viewMode === 'edit'} />
            <MiniMap
              nodeStrokeWidth={3}
              style={{
                background: computed.token.colorBgContainer,
                border: `1px solid ${computed.token.colorBorderSecondary}`,
              }}
              maskColor={`${computed.token.colorBgLayout}80`}
            />
          </ReactFlow>

          {/* Execution Legend Overlay */}
          {props.viewMode === 'replay' && (
            <div
              style={{
                position: 'absolute',
                bottom: 32,
                left: 16,
                zIndex: 10,
                background: computed.token.colorBgContainer,
                padding: 8,
                borderRadius: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                boxShadow: computed.token.boxShadowSecondary,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, background: computed.token.colorSuccessBg, border: `1px solid ${computed.token.colorSuccess}`, borderRadius: 2 }}></span> <span>成功</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, background: computed.token.colorErrorBg, border: `1px solid ${computed.token.colorError}`, borderRadius: 2 }}></span> <span>失败</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, background: computed.token.colorBgContainer, border: `1px solid ${computed.token.colorBorder}`, borderRadius: 2 }}></span> <span>未执行</span>
              </div>
            </div>
          )}
        </div>

        {state.showLogPanel && (
          <RunLogPanel
            executionId={state.executionId}
            height={state.logPanelHeight}
            onHeightChange={setters.setLogPanelHeight}
            onClose={() => setters.setShowLogPanel(false)}
            onLogClick={actions.focusNode}
          />
        )}

        {state.showDebatePanel && (
          <div
            style={{
              position: 'absolute',
              top: 60,
              right: 320,
              bottom: state.showLogPanel ? state.logPanelHeight : 0,
              width: 350,
              zIndex: 90,
              boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
            }}
          >
            <DebateTimelinePanel
              executionId={state.executionId}
              height={state.debatePanelHeight}
              onHeightChange={setters.setDebatePanelHeight}
              onClose={() => setters.setShowDebatePanel(false)}
            />
          </div>
        )}

        <WorkflowPreviewTelemetryDrawer
          open={state.telemetryDrawerOpen}
          onClose={() => setters.setTelemetryDrawerOpen(false)}
          onFocusNode={actions.focusNode}
        />
      </div>

      {!props.isReadOnly && (computed.selectedNode || computed.selectedEdge) ? (
        <PropertyPanel
          selectedNode={computed.selectedNode}
          selectedEdge={computed.selectedEdge}
          onUpdateNode={actions.updateNodeData}
          onUpdateEdge={actions.updateEdgeData}
          viewLevel={state.currentViewLevel}
          paramSetBindings={props.initialDsl?.paramSetBindings ?? []}
          currentDsl={computed.currentDslSnapshot}
          onFocusNode={actions.focusNode}
          onClose={actions.resetSelection}
        />
      ) : null}

      {props.viewMode === 'replay' && (computed.selectedNode || computed.selectedEdge) ? (
        <div
          style={{
            width: 320,
            borderLeft: `1px solid ${computed.token.colorBorderSecondary}`,
            background: computed.token.colorBgContainer,
            padding: 16,
            overflowY: 'auto',
          }}
        >
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', fontSize: 16 }}>
              {computed.selectedNode ? '节点执行详情' : '连线信息'}
            </span>
            <a onClick={actions.resetSelection} style={{ cursor: 'pointer' }}>关闭</a>
          </div>
          {computed.selectedNode && (
            <div>
              <p style={{ marginBottom: 8 }}>
                <Tag color="blue">{String(computed.selectedNode.data.type)}</Tag>{' '}
                <strong>{String(computed.selectedNode.data.name)}</strong>
              </p>
              <div style={{ marginBottom: 16 }}>
                <Alert
                  message={computed.executionStatusMap.get(computed.selectedNode.id) || 'PENDING'}
                  type={
                    computed.executionStatusMap.get(computed.selectedNode.id) === 'SUCCESS'
                      ? 'success'
                      : computed.executionStatusMap.get(computed.selectedNode.id) === 'FAILED'
                        ? 'error'
                        : 'info'
                  }
                  showIcon
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: computed.token.colorTextSecondary }}>Node ID: </span>
                <span style={{ fontFamily: 'monospace' }}>{computed.selectedNode.id}</span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {state.menuState ? (
        <NodeContextMenu
          id={state.menuState.id}
          top={state.menuState.top}
          left={state.menuState.left}
          onCopy={actions.handleContextCopy}
          onDelete={actions.handleContextDelete}
          onSaveTemplate={actions.handleContextSaveTemplate}
          onToggleEnable={actions.handleContextToggleEnable}
          isEnabled={(computed.displayNodes.find((n) => n.id === state.menuState?.id)?.data.enabled as boolean) ?? true}
          onToggleBreakpoint={actions.handleToggleBreakpoint}
          hasBreakpoint={state.menuState ? state.breakpoints.has(state.menuState.id) : false}
          onClose={() => setters.setMenuState(null)}
        />
      ) : null}

      {props.currentVersionId ? (
        <SaveTemplateModal
          open={state.isTemplateModalOpen}
          onClose={() => setters.setIsTemplateModalOpen(false)}
          sourceVersionId={props.currentVersionId}
          sourceWorkflowDefinitionId={props.currentDefinitionId}
          initialName={props.initialDsl?.name}
          initialCode={props.initialDsl?.workflowId !== 'new' ? props.initialDsl?.workflowId : undefined}
        />
      ) : null}

      {state.smartLinkMenu && !props.isReadOnly ? (
        <SmartLinkMenu
          top={state.smartLinkMenu.top}
          left={state.smartLinkMenu.left}
          sourceNodeType={computed.displayNodes.find((n) => n.id === state.smartLinkMenu?.sourceNodeId)?.type ?? ''}
          onSelect={actions.handleSmartLinkSelect}
          onClose={() => setters.setSmartLinkMenu(null)}
        />
      ) : null}
    </div>
  );
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
};

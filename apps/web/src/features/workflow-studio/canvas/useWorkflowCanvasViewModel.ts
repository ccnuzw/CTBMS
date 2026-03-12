import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow, type Node, type Edge } from '@xyflow/react';
import { message, theme } from 'antd';
import {
    canonicalizeWorkflowDsl,
    normalizeWorkflowModeValue,
    toWorkflowModeUi,
    type WorkflowDsl,
} from '@packages/types';

import { useDslSync } from './useDslSync';
import { validateGraph } from './graphValidation';
import { useUndoRedo } from './useUndoRedo';
import { useCopyPaste } from './useCopyPaste';
import { useAutoLayout } from './useAutoLayout';
import { useCanvasAlignment } from './useCanvasAlignment';
import { type ValidationError } from './CanvasErrorList';
import { useCanvasAutoFix } from './useCanvasAutoFix';
import { useCanvasReplay } from './useCanvasReplay';
import { useCanvasInteractions } from './useCanvasInteractions';

export {
    WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY,
    runtimePresetPolicyMap,
    AUTO_FIX_STEP_SEQUENCE,
} from './workflowCanvasTypes';
export type {
    WorkflowStudioViewLevel,
    RuntimePreset,
    AutoFixPreviewState,
    StepAutoFixReportStep,
    StepAutoFixReportState,
    WorkflowCanvasProps,
} from './workflowCanvasTypes';

import {
    WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY,
    runtimePresetPolicyMap,
    type WorkflowStudioViewLevel,
    type RuntimePreset,
    type WorkflowCanvasProps,
} from './workflowCanvasTypes';

/**
 * 工作流画布 ViewModel（聚合层）
 *
 * 拆分为 3 个子 Hook 后，本文件仅做组合和胶水逻辑：
 * - useCanvasAutoFix   → 自动修复（预览/一键/分步）
 * - useCanvasReplay    → 执行回放样式
 * - useCanvasInteractions → 拖放/右键菜单/智能连线/分组/聚焦
 */
export function useWorkflowCanvasViewModel(props: WorkflowCanvasProps) {
    const {
        initialDsl,
        onSave,
        onValidate,
        isReadOnly = false,
        onRun,
        currentVersionId,
        currentDefinitionId,
        viewLevel,
        onViewLevelChange,
        viewMode = 'edit',
        executionData,
    } = props;

    const { token } = theme.useToken();
    const reactFlow = useReactFlow();
    const canvasRef = useRef<HTMLDivElement>(null);

    // ── Core State ──
    const [isSaving, setIsSaving] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [showLogPanel, setShowLogPanel] = useState(false);
    const [showDebatePanel, setShowDebatePanel] = useState(false);
    const [logPanelHeight, setLogPanelHeight] = useState(300);
    const [debatePanelHeight, setDebatePanelHeight] = useState(400);
    const [executionId, setExecutionId] = useState<string | undefined>();
    const [selectionMode, setSelectionMode] = useState<'hand' | 'pointer'>('hand');
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const [workflowMode, setWorkflowMode] = useState<'linear' | 'dag' | 'debate'>(
        toWorkflowModeUi(initialDsl?.mode ?? 'DAG'),
    );
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [telemetryDrawerOpen, setTelemetryDrawerOpen] = useState(false);
    const [localViewLevel, setLocalViewLevel] = useState<WorkflowStudioViewLevel>(() => {
        if (typeof window === 'undefined') return 'business';
        const raw = window.localStorage.getItem(WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY);
        if (raw === 'business' || raw === 'enhanced' || raw === 'expert') return raw;
        return 'business';
    });

    const currentViewLevel = viewLevel ?? localViewLevel;

    // ── Undo/Redo ──
    const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo();

    // ── DSL Sync ──
    const defaultDsl: WorkflowDsl = useMemo(
        () => ({
            workflowId: 'new',
            name: 'New Workflow',
            version: '1.0.0',
            mode: 'DAG',
            status: 'DRAFT',
            usageMethod: 'ON_DEMAND',
            nodes: [],
            edges: [],
        }),
        [],
    );

    useEffect(() => {
        if (initialDsl?.mode) setWorkflowMode(toWorkflowModeUi(initialDsl.mode));
    }, [initialDsl?.mode]);

    useEffect(() => {
        if (viewLevel) setLocalViewLevel(viewLevel);
    }, [viewLevel]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY, currentViewLevel);
    }, [currentViewLevel]);

    const onValidateRef = useRef(onValidate);
    useEffect(() => { onValidateRef.current = onValidate; }, [onValidate]);

    const {
        nodes, edges, onNodesChange, onEdgesChange, onConnect,
        addNode, updateNodeData, updateEdgeData, exportDsl, loadDsl, setNodes, setEdges,
    } = useDslSync(initialDsl || defaultDsl, undefined, takeSnapshot);

    useCopyPaste(nodes, edges, setNodes, setEdges, () => takeSnapshot(nodes, edges));

    const { onLayout } = useAutoLayout();
    const { alignNodes } = useCanvasAlignment();

    // ── Computed ──
    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId) ?? null,
        [nodes, selectedNodeId],
    );
    const selectedEdge = useMemo(
        () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
        [edges, selectedEdgeId],
    );
    const currentDslSnapshot = useMemo(() => exportDsl(), [exportDsl, nodes, edges]);

    // ── Build DSL & Validation ──
    const buildCurrentDsl = useCallback((): WorkflowDsl => {
        const dsl = exportDsl();
        const positionMap = new Map(
            reactFlow.getNodes().map((node) => [node.id, node.position] as const),
        );
        return canonicalizeWorkflowDsl({
            ...dsl,
            mode: normalizeWorkflowModeValue(workflowMode),
            nodes: dsl.nodes.map((node) => ({
                ...node,
                config: {
                    ...(node.config ?? {}),
                    _position:
                        positionMap.get(node.id) ??
                        (node.config as Record<string, unknown> | undefined)?._position,
                },
            })),
        });
    }, [exportDsl, reactFlow, workflowMode]);

    const runValidation = useCallback(
        async (dsl: WorkflowDsl): Promise<ValidationError[]> => {
            if (onValidateRef.current) {
                const remoteResult = await onValidateRef.current(dsl, 'SAVE');
                if (remoteResult) {
                    return remoteResult.issues
                        .filter((issue) => issue.severity === 'ERROR')
                        .map((issue) => ({
                            message: `${issue.code}: ${issue.message}`,
                            nodeId: issue.nodeId,
                            edgeId: issue.edgeId,
                            severity: 'ERROR',
                        }));
                }
            }
            const fallback = validateGraph(nodes, edges, workflowMode);
            return fallback.errors;
        },
        [nodes, edges, workflowMode],
    );

    // Periodic validation
    useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            try {
                const dsl = buildCurrentDsl();
                const errors = await runValidation(dsl);
                if (active) setValidationErrors(errors);
            } catch {
                if (active) {
                    setValidationErrors([{ message: '校验服务异常，请稍后重试', severity: 'ERROR' }]);
                }
            }
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [nodes, edges, workflowMode, buildCurrentDsl, runValidation]);

    // ── Sub-Hook: AutoFix ──
    const autoFix = useCanvasAutoFix({
        nodes, edges, workflowMode,
        buildCurrentDsl, runValidation, loadDsl,
        validationErrors, setValidationErrors,
    });

    // ── Sub-Hook: Replay ──
    const replay = useCanvasReplay({
        nodes, edges, viewMode, executionData,
    });

    // ── Sub-Hook: Interactions ──
    const interactions = useCanvasInteractions({
        nodes, edges, setNodes, setEdges,
        addNode, updateNodeData, takeSnapshot,
        selectedNodeId, setSelectedNodeId,
        selectedEdgeId, setSelectedEdgeId,
        canvasRef,
    });

    // ── Save ──
    const handleSave = useCallback(async () => {
        if (!onSave) return;
        setIsSaving(true);
        try {
            const dsl = buildCurrentDsl();
            const errors = await runValidation(dsl);
            if (errors.length > 0) {
                setValidationErrors(errors);
                message.error('保存失败：请先修复校验问题');
                return;
            }
            await onSave(dsl);
            message.success('保存成功');
        } catch {
            message.error('保存失败');
        } finally {
            setIsSaving(false);
        }
    }, [onSave, buildCurrentDsl, runValidation]);

    // ── Export DSL ──
    const handleExportDsl = useCallback(() => {
        const dsl = buildCurrentDsl();
        const blob = new Blob([JSON.stringify(dsl, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow-dsl-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        message.success('DSL 已导出');
    }, [buildCurrentDsl]);

    // ── Clear Canvas ──
    const handleClearCanvas = useCallback(() => {
        takeSnapshot(nodes, edges);
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [takeSnapshot, nodes, edges, setNodes, setEdges]);

    // ── Runtime Preset ──
    const handleApplyRuntimePreset = useCallback(
        (preset: RuntimePreset) => {
            const policy = runtimePresetPolicyMap[preset];
            const nonRuntimeNodeTypes = new Set([
                'manual-trigger', 'cron-trigger', 'api-trigger', 'event-trigger', 'group',
            ]);
            takeSnapshot(nodes, edges);
            setNodes((items) =>
                items.map((node) => {
                    const nodeType = String(node.data.type || node.type);
                    if (nonRuntimeNodeTypes.has(nodeType)) return node;
                    const currentRuntimePolicy = (node.data.runtimePolicy as Record<string, unknown>) ?? {};
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            runtimePolicy: {
                                ...currentRuntimePolicy,
                                timeoutSeconds: policy.timeoutSeconds,
                                retryCount: policy.retryCount,
                                retryIntervalSeconds: policy.retryIntervalSeconds,
                                onError: policy.onError,
                            },
                        },
                    };
                }),
            );
            message.success(`已批量应用${preset === 'FAST' ? '快速' : preset === 'ROBUST' ? '稳健' : '平衡'}运行策略`);
        },
        [takeSnapshot, nodes, edges, setNodes],
    );

    // ── Keyboard shortcut ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);

    // ── Run ──
    const handleRun = useCallback(async () => {
        if (!onRun) {
            setShowLogPanel(true);
            return;
        }
        try {
            const dsl = buildCurrentDsl();
            const errors = await runValidation(dsl);
            if (errors.length > 0) {
                setValidationErrors(errors);
                message.error('运行失败：请先修复校验问题');
                return;
            }
            const id = await onRun(dsl);
            if (id) setExecutionId(id);
            setShowLogPanel(true);
            if (workflowMode === 'debate') {
                setShowDebatePanel(true);
            }
        } catch {
            message.error('运行失败');
        }
    }, [onRun, buildCurrentDsl, runValidation, workflowMode]);

    // ── Return (merged from sub-hooks) ──
    return {
        state: {
            isSaving,
            selectedNodeId,
            selectedEdgeId,
            showLogPanel,
            showDebatePanel,
            logPanelHeight,
            debatePanelHeight,
            executionId,
            selectionMode,
            snapToGrid,
            validationErrors,
            workflowMode,
            isTemplateModalOpen,
            telemetryDrawerOpen,
            localViewLevel,
            currentViewLevel,
            // From autoFix
            ...autoFix.state,
            // From interactions
            ...interactions.state,
        },
        computed: {
            selectedNode,
            selectedEdge,
            currentDslSnapshot,
            displayNodes: replay.displayNodes,
            displayEdges: replay.displayEdges,
            executionStatusMap: replay.executionStatusMap,
            canUndo,
            canRedo,
            token,
            // From autoFix
            ...autoFix.computed,
        },
        setters: {
            setShowLogPanel,
            setShowDebatePanel,
            setLogPanelHeight,
            setDebatePanelHeight,
            setSelectionMode,
            setSnapToGrid,
            setWorkflowMode,
            setIsTemplateModalOpen,
            setTelemetryDrawerOpen,
            setLocalViewLevel,
            setSelectedNodeId,
            setSelectedEdgeId,
            // From autoFix
            ...autoFix.setters,
            // From interactions
            ...interactions.setters,
        },
        actions: {
            undo: () => undo(nodes, edges, setNodes, setEdges),
            redo: () => redo(nodes, edges, setNodes, setEdges),
            onLayout: () => onLayout('LR'),
            alignNodes,
            handleSave,
            handleExportDsl,
            handleClearCanvas,
            handleApplyRuntimePreset,
            handleRun,
            updateNodeData,
            updateEdgeData,
            // From autoFix
            ...autoFix.actions,
            // From interactions
            ...interactions.actions,
        },
        refs: {
            canvasRef,
        },
        flowProps: {
            onNodesChange,
            onEdgesChange,
            onConnect,
        },
    };
}

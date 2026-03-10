import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useReactFlow, type Node, type Edge, type Connection } from '@xyflow/react';
import { message, notification, theme } from 'antd';
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
import { listNodeTemplates, saveNodeTemplate } from './nodeTemplateStore';
import { type ValidationError } from './CanvasErrorList';
import {
    applyAutoFixesToDsl,
    extractIssueCode,
    getAutoFixableIssueCodes,
    hasAutoFixableIssues,
} from './workflowAutoFix';
import {
    summarizeWorkflowDslChange,
    type WorkflowDslChangeSummary,
} from './workflowDslChangeSummary';

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
    AUTO_FIX_STEP_SEQUENCE,
    type WorkflowStudioViewLevel,
    type RuntimePreset,
    type AutoFixPreviewState,
    type StepAutoFixReportStep,
    type StepAutoFixReportState,
    type WorkflowCanvasProps,
} from './workflowCanvasTypes';

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
    const [autoFixPreview, setAutoFixPreview] = useState<AutoFixPreviewState | null>(null);
    const [previewAutoFixLoading, setPreviewAutoFixLoading] = useState(false);
    const [lastAutoFixActions, setLastAutoFixActions] = useState<string[]>([]);
    const [selectedAutoFixCodes, setSelectedAutoFixCodes] = useState<string[]>([]);
    const [stepAutoFixLoading, setStepAutoFixLoading] = useState(false);
    const [stepAutoFixReport, setStepAutoFixReport] = useState<StepAutoFixReportState | null>(null);
    const [workflowMode, setWorkflowMode] = useState<'linear' | 'dag' | 'debate'>(
        toWorkflowModeUi(initialDsl?.mode ?? 'DAG'),
    );
    const [menuState, setMenuState] = useState<{ id: string; top: number; left: number } | null>(null);
    const [smartLinkMenu, setSmartLinkMenu] = useState<{
        top: number;
        left: number;
        sourceNodeId: string;
        sourceHandleId?: string | null;
    } | null>(null);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [telemetryDrawerOpen, setTelemetryDrawerOpen] = useState(false);
    const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set());
    const [localViewLevel, setLocalViewLevel] = useState<WorkflowStudioViewLevel>(() => {
        if (typeof window === 'undefined') {
            return 'business';
        }
        const raw = window.localStorage.getItem(WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY);
        if (raw === 'business' || raw === 'enhanced' || raw === 'expert') {
            return raw;
        }
        return 'business';
    });

    const connectingNodeId = useRef<string | null>(null);
    const connectingHandleId = useRef<string | null>(null);
    const currentViewLevel = viewLevel ?? localViewLevel;

    const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo();

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
        if (initialDsl?.mode) {
            setWorkflowMode(toWorkflowModeUi(initialDsl.mode));
        }
    }, [initialDsl?.mode]);

    useEffect(() => {
        if (viewLevel) {
            setLocalViewLevel(viewLevel);
        }
    }, [viewLevel]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY, currentViewLevel);
    }, [currentViewLevel]);

    const onValidateRef = useRef(onValidate);
    useEffect(() => {
        onValidateRef.current = onValidate;
    }, [onValidate]);

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        updateNodeData,
        updateEdgeData,
        exportDsl,
        loadDsl,
        setNodes,
        setEdges,
    } = useDslSync(initialDsl || defaultDsl, undefined, takeSnapshot);

    useCopyPaste(nodes, edges, setNodes, setEdges, () => takeSnapshot(nodes, edges));

    const { onLayout } = useAutoLayout();
    const { alignNodes } = useCanvasAlignment();

    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId) ?? null,
        [nodes, selectedNodeId],
    );

    const selectedEdge = useMemo(
        () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
        [edges, selectedEdgeId],
    );

    const currentDslSnapshot = useMemo(() => exportDsl(), [exportDsl, nodes, edges]);

    const executionStatusMap = useMemo(() => {
        if (viewMode !== 'replay' || !executionData) {
            return new Map<string, string>();
        }
        const statusMap = new Map<string, string>();
        const history = executionData.history || [];

        history.forEach((step: any) => {
            if (step.nodeId) {
                statusMap.set(step.nodeId, step.status);
            }
        });
        return statusMap;
    }, [viewMode, executionData]);

    const getEdgeStyle = useCallback(

        (edge: any) => {
            if (viewMode !== 'replay') return {};
            const sourceStatus = executionStatusMap.get(edge.source);
            const targetStatus = executionStatusMap.get(edge.target);
            const isTraversed =
                sourceStatus === 'SUCCESS' && (targetStatus === 'SUCCESS' || targetStatus === 'FAILED');

            if (isTraversed) {
                return { stroke: token.colorSuccess, strokeWidth: 2, animated: true };
            }
            return { stroke: token.colorBorder, opacity: 0.2 };
        },
        [viewMode, executionStatusMap, token],
    );

    const getNodeStyle = useCallback(
        (node: Node) => {
            if (viewMode !== 'replay') return {};
            const status = executionStatusMap.get(node.id);
            let borderColor = token.colorBorder;
            let background = token.colorBgContainer;
            let opacity = 1;

            if (status === 'SUCCESS') {
                borderColor = token.colorSuccess;
                background = token.colorSuccessBg;
            } else if (status === 'FAILED') {
                borderColor = token.colorError;
                background = token.colorErrorBg;
            } else if (status === 'SKIPPED') {
                borderColor = token.colorTextQuaternary;
                opacity = 0.6;
            } else if (!status) {
                opacity = 0.4;
            }

            return {
                border: `2px solid ${borderColor}`,
                background,
                opacity,
                transition: 'all 0.3s ease',
            };
        },
        [viewMode, executionStatusMap, token],
    );

    const displayNodes = useMemo(() => {
        if (viewMode !== 'replay') return nodes;
        return nodes.map((node) => ({
            ...node,
            style: { ...node.style, ...getNodeStyle(node) },
            draggable: false,
            connectable: false,
            selectable: true,
        }));
    }, [nodes, viewMode, getNodeStyle]);

    const displayEdges = useMemo(() => {
        if (viewMode !== 'replay') return edges;
        return edges.map((edge) => ({
            ...edge,
            style: { ...edge.style, ...getEdgeStyle(edge) },
            animated: getEdgeStyle(edge).animated,
        }));
    }, [edges, viewMode, getEdgeStyle]);

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

    const autoFixableIssueCodes = useMemo(
        () => getAutoFixableIssueCodes(validationErrors),
        [validationErrors],
    );

    useEffect(() => {
        setSelectedAutoFixCodes((prev) => {
            const kept = prev.filter((code) => autoFixableIssueCodes.includes(code));
            if (kept.length > 0) return kept;
            return autoFixableIssueCodes;
        });
    }, [autoFixableIssueCodes]);

    const selectedAutoFixIssues = useMemo(() => {
        if (selectedAutoFixCodes.length === 0) return [];
        const selectedCodeSet = new Set(selectedAutoFixCodes);
        return validationErrors.filter((item) => {
            const code = extractIssueCode(item.message);
            return Boolean(code && selectedCodeSet.has(code));
        });
    }, [validationErrors, selectedAutoFixCodes]);

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

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [nodes, edges, workflowMode, buildCurrentDsl, runValidation]);

    const handleAutoFixValidationIssues = useCallback(async () => {
        if (selectedAutoFixIssues.length === 0) {
            message.info('请先选择要修复的问题类型');
            return;
        }
        const dsl = buildCurrentDsl();
        const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(dsl, selectedAutoFixIssues, selectedAutoFixCodes);
        if (actions.length === 0) {
            setStepAutoFixReport(null);
            setAutoFixPreview(null);
            setLastAutoFixActions([]);
            message.info('当前问题暂不支持自动修复，请根据提示手动处理');
            return;
        }
        setStepAutoFixReport(null);
        setAutoFixPreview(null);
        setLastAutoFixActions(actions);
        const canonicalFixedDsl = canonicalizeWorkflowDsl(fixedDsl);
        const changeSummary = summarizeWorkflowDslChange(dsl, canonicalFixedDsl);
        loadDsl(canonicalFixedDsl);
        message.success(`已自动修复 ${actions.length} 项问题`);

        // Ant Design notification API isn't easy to format perfectly as ReactNode in a string file without React import, 
        // Wait, React element is supported as description. We'll use a simpler message format for the notification.
        let descriptionText = `节点 +${changeSummary.addedNodeIds.length} / -${changeSummary.removedNodeIds.length}，`;
        descriptionText += `连线 +${changeSummary.addedEdgeIds.length} / -${changeSummary.removedEdgeIds.length}，`;
        descriptionText += `策略更新 ${changeSummary.updatedRuntimePolicyNodeIds.length}。\n`;
        descriptionText += actions.map((a, i) => `${i + 1}. ${a}`).join('\n');

        notification.success({
            message: `自动修复明细（${actions.length} 项）`,
            duration: 5,
            description: descriptionText,
            style: { whiteSpace: 'pre-wrap' },
        });
        const nextErrors = await runValidation(canonicalFixedDsl);
        setValidationErrors(nextErrors);
    }, [buildCurrentDsl, loadDsl, runValidation, selectedAutoFixIssues, selectedAutoFixCodes]);

    const handlePreviewAutoFixValidationIssues = useCallback(async () => {
        if (selectedAutoFixIssues.length === 0) {
            message.info('请先选择要预览修复的问题类型');
            return;
        }
        const dsl = buildCurrentDsl();
        const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(dsl, selectedAutoFixIssues, selectedAutoFixCodes);
        if (actions.length === 0) {
            setStepAutoFixReport(null);
            setAutoFixPreview(null);
            message.info('当前问题暂不支持预览修复');
            return;
        }
        setStepAutoFixReport(null);
        setPreviewAutoFixLoading(true);
        try {
            const canonicalFixedDsl = canonicalizeWorkflowDsl(fixedDsl);
            const nextErrors = await runValidation(canonicalFixedDsl);
            const changeSummary = summarizeWorkflowDslChange(dsl, canonicalFixedDsl);
            setAutoFixPreview({
                actions,
                remainingIssueCount: nextErrors.length,
                generatedAt: new Date().toLocaleString(),
                changeSummary,
            });
            message.success('已生成修复预览');
        } finally {
            setPreviewAutoFixLoading(false);
        }
    }, [buildCurrentDsl, runValidation, selectedAutoFixIssues, selectedAutoFixCodes]);

    const handleStepAutoFixValidationIssues = useCallback(async () => {
        if (selectedAutoFixCodes.length === 0) {
            message.info('请先选择要分步修复的问题类型');
            return;
        }
        setStepAutoFixLoading(true);
        try {
            let workingDsl = buildCurrentDsl();
            let workingErrors = validationErrors;
            const stepReports: StepAutoFixReportStep[] = [];

            for (const step of AUTO_FIX_STEP_SEQUENCE) {
                const stepCodes = step.codes.filter((code) => selectedAutoFixCodes.includes(code));
                if (stepCodes.length === 0) continue;
                const stepCodeSet = new Set(stepCodes);
                const stepIssues = workingErrors.filter((issue) => {
                    const code = extractIssueCode(issue.message);
                    return Boolean(code && stepCodeSet.has(code));
                });
                if (stepIssues.length === 0) continue;

                const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(workingDsl, stepIssues, stepCodes);
                if (actions.length === 0) continue;

                const canonicalFixedDsl = canonicalizeWorkflowDsl(fixedDsl);
                const nextErrors = await runValidation(canonicalFixedDsl);
                const changeSummary = summarizeWorkflowDslChange(workingDsl, canonicalFixedDsl);
                workingDsl = canonicalFixedDsl;
                workingErrors = nextErrors;

                stepReports.push({
                    title: step.title,
                    codes: stepCodes,
                    actions,
                    remainingIssueCount: nextErrors.length,
                    changeSummary,
                });
            }

            if (stepReports.length === 0) {
                setStepAutoFixReport(null);
                setAutoFixPreview(null);
                message.info('所选问题暂无可执行的分步修复');
                return;
            }

            loadDsl(workingDsl);
            setValidationErrors(workingErrors);
            setAutoFixPreview(null);
            const mergedActions = stepReports.flatMap((item) => item.actions);
            setLastAutoFixActions(mergedActions);
            setStepAutoFixReport({
                generatedAt: new Date().toLocaleString(),
                finalIssueCount: workingErrors.length,
                steps: stepReports,
            });
            message.success(`分步修复完成，共执行 ${stepReports.length} 步`);

            const descriptionText = stepReports.map((item, index) =>
                `${index + 1}. ${item.title}，执行 ${item.actions.length} 项，剩余 ${item.remainingIssueCount} 项`
            ).join('\n');

            notification.success({
                message: `分步修复报告（${stepReports.length} 步）`,
                duration: 6,
                description: descriptionText,
                style: { whiteSpace: 'pre-wrap' },
            });
        } finally {
            setStepAutoFixLoading(false);
        }
    }, [buildCurrentDsl, loadDsl, runValidation, selectedAutoFixCodes, validationErrors]);

    useEffect(() => {
        setAutoFixPreview(null);
    }, [nodes, edges, workflowMode, selectedAutoFixCodes]);

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();

            const position = reactFlow.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const templateId = event.dataTransfer.getData('application/workflow-node-template-id');
            if (templateId) {
                const template = listNodeTemplates().find((item) => item.id === templateId);
                if (!template) {
                    message.error('模板不存在或已删除');
                    return;
                }
                const newNodeId = addNode(template.nodeType, position, {
                    name: template.data.name,
                    enabled: template.data.enabled,
                    config: template.data.config,
                    runtimePolicy: template.data.runtimePolicy,
                    inputBindings: template.data.inputBindings,
                    outputSchema: template.data.outputSchema,
                });
                setSelectedNodeId(newNodeId);
                setSelectedEdgeId(null);
                return;
            }

            const nodeType = event.dataTransfer.getData('application/workflow-node-type');
            if (!nodeType) return;

            const newNodeId = addNode(nodeType, position);
            setSelectedNodeId(newNodeId);
            setSelectedEdgeId(null);
        },
        [reactFlow, addNode],
    );

    const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
    }, []);

    const handleEdgeClick = useCallback((_: React.MouseEvent, edge: { id: string }) => {
        setSelectedEdgeId(edge.id);
        setSelectedNodeId(null);
    }, []);

    const handlePaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setMenuState(null);
        setSmartLinkMenu(null);
    }, []);

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();
        const pane = canvasRef.current?.getBoundingClientRect();
        setMenuState({
            id: node.id,
            top: event.clientY - (pane?.top || 0),
            left: event.clientX - (pane?.left || 0),
        });
    }, []);

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

    const handleClearCanvas = useCallback(() => {
        takeSnapshot(nodes, edges);
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [takeSnapshot, nodes, edges, setNodes, setEdges]);

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

    const onConnectStart = useCallback(
        (_: unknown, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
            connectingNodeId.current = nodeId;
            connectingHandleId.current = handleId;
        },
        [],
    );

    const onConnectEnd = useCallback((event: any) => {
        if (!connectingNodeId.current) return;
        const targetIsPane = event.target.classList.contains('react-flow__pane');
        if (targetIsPane) {
            const { top, left } = canvasRef.current?.getBoundingClientRect() ?? { top: 0, left: 0 };
            const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX;
            const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY;
            setSmartLinkMenu({
                top: clientY - top,
                left: clientX - left,
                sourceNodeId: connectingNodeId.current,
                sourceHandleId: connectingHandleId.current,
            });
        }
        connectingNodeId.current = null;
        connectingHandleId.current = null;
    }, []);

    const handleSmartLinkSelect = useCallback(
        (nodeType: string) => {
            if (!smartLinkMenu) return;
            const { top, left, sourceNodeId, sourceHandleId } = smartLinkMenu;
            const position = reactFlow.screenToFlowPosition({
                x: left + (canvasRef.current?.getBoundingClientRect().left ?? 0),
                y: top + (canvasRef.current?.getBoundingClientRect().top ?? 0),
            });

            const newNodeId = addNode(nodeType, position);
            const sourceNode = nodes.find((n) => n.id === sourceNodeId);
            if (sourceNode && newNodeId) {
                const newEdge = {
                    id: `e_${sourceNodeId}_${newNodeId}_${Date.now()}`,
                    source: sourceNodeId,
                    target: newNodeId,
                    sourceHandle: sourceHandleId,
                    type: 'default',
                };
                setEdges((eds) => [...eds, newEdge]);
            }
            setSmartLinkMenu(null);
            setSelectedNodeId(newNodeId);
        },
        [smartLinkMenu, reactFlow, addNode, nodes, setEdges],
    );

    const handleNodeDragStop = useCallback(
        (_: React.MouseEvent, node: Node) => {
            const intersections = reactFlow.getIntersectingNodes(node).filter((item) => item.type === 'group');
            const groupNode = intersections.at(-1);

            if (groupNode && node.parentId !== groupNode.id) {
                const parentPos = groupNode.position;
                const newPosition = {
                    x: node.position.x - parentPos.x,
                    y: node.position.y - parentPos.y,
                };
                setNodes((items) =>
                    items.map((item) =>
                        item.id === node.id
                            ? { ...item, position: newPosition, parentId: groupNode.id, extent: 'parent' }
                            : item,
                    ),
                );
                return;
            }

            if (!groupNode && node.parentId) {
                const parent = nodes.find((item) => item.id === node.parentId);
                if (!parent) return;
                const absolutePosition = {
                    x: node.position.x + parent.position.x,
                    y: node.position.y + parent.position.y,
                };
                setNodes((items) =>
                    items.map((item) =>
                        item.id === node.id
                            ? { ...item, position: absolutePosition, parentId: undefined, extent: undefined }
                            : item,
                    ),
                );
            }
        },
        [reactFlow, setNodes, nodes],
    );

    const handleContextCopy = useCallback(() => {
        if (!menuState) return;
        const source = nodes.find((node) => node.id === menuState.id);
        if (!source) return;

        takeSnapshot(nodes, edges);
        const duplicatedNodeId = `${source.data.type}_${Date.now()}`;
        const duplicatedData = JSON.parse(JSON.stringify(source.data)) as Node['data'];

        setNodes((items) => [
            ...items.map((item) => ({ ...item, selected: false })),
            {
                ...source,
                id: duplicatedNodeId,
                position: { x: source.position.x + 48, y: source.position.y + 48 },
                data: duplicatedData,
                selected: true,
            },
        ]);

        setSelectedNodeId(duplicatedNodeId);
        setSelectedEdgeId(null);
        message.success('节点已复制');
    }, [menuState, nodes, edges, setNodes, takeSnapshot]);

    const handleContextDelete = useCallback(() => {
        if (!menuState) return;
        takeSnapshot(nodes, edges);
        setNodes((items) => items.filter((item) => item.id !== menuState.id));
        setEdges((items) => items.filter((item) => item.source !== menuState.id && item.target !== menuState.id));
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [menuState, nodes, edges, takeSnapshot, setNodes, setEdges]);

    const handleContextSaveTemplate = useCallback(() => {
        if (!menuState) return;
        const node = nodes.find((item) => item.id === menuState.id);
        if (!node) return;
        saveNodeTemplate({
            name: String(node.data.name ?? node.data.type ?? '未命名模板'),
            nodeType: String(node.data.type ?? ''),
            description: `来自节点 ${node.id}`,
            data: {
                type: String(node.data.type ?? ''),
                name: String(node.data.name ?? node.data.type ?? ''),
                config: (node.data.config as Record<string, unknown>) ?? {},
                runtimePolicy: node.data.runtimePolicy as Record<string, unknown> | undefined,
                inputBindings: node.data.inputBindings as Record<string, unknown> | undefined,
                outputSchema: node.data.outputSchema as string | Record<string, unknown> | undefined,
                enabled: (node.data.enabled as boolean) ?? true,
            },
        });
        message.success('节点模板已保存到本地模板库');
    }, [menuState, nodes]);

    const handleContextToggleEnable = useCallback(() => {
        if (!menuState) return;
        const node = nodes.find((n) => n.id === menuState.id);
        if (!node) return;

        const isEnabled = (node.data.enabled as boolean) ?? true;
        updateNodeData(node.id, { enabled: !isEnabled });
        message.success(isEnabled ? '节点已禁用' : '节点已启用');
        setMenuState(null);
    }, [menuState, nodes, updateNodeData]);

    const handleToggleBreakpoint = useCallback(() => {
        if (!menuState) return;
        const newBreakpoints = new Set(breakpoints);
        if (newBreakpoints.has(menuState.id)) {
            newBreakpoints.delete(menuState.id);
        } else {
            newBreakpoints.add(menuState.id);
        }
        setBreakpoints(newBreakpoints);
        updateNodeData(menuState.id, { isBreakpoint: !breakpoints.has(menuState.id) });
        message.success(newBreakpoints.has(menuState.id) ? '断点已启用' : '断点已移除');
        setMenuState(null);
    }, [menuState, breakpoints, updateNodeData]);

    const focusNode = useCallback((nodeId: string) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
            setSelectedNodeId(nodeId);
            setSelectedEdgeId(null);
            reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 800, padding: 0.5 });
        } else {
            message.warning(`节点 ${nodeId} 不在当前画布（可能已删除/跨版本）`);
        }
    }, [nodes, reactFlow, setSelectedNodeId, setSelectedEdgeId]);

    const focusEdge = useCallback((edgeId: string) => {
        const edge = edges.find((e) => e.id === edgeId);
        if (edge) {
            setSelectedEdgeId(edgeId);
            const source = nodes.find((n) => n.id === edge.source);
            const target = nodes.find((n) => n.id === edge.target);
            if (source && target) {
                reactFlow.fitView({
                    nodes: [{ id: source.id }, { id: target.id }],
                    duration: 800,
                    padding: 0.5,
                });
            }
        } else {
            message.warning(`连线 ${edgeId} 不在当前画布（可能已删除）`);
        }
    }, [edges, nodes, reactFlow, setSelectedEdgeId]);

    const resetSelection = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [setSelectedNodeId, setSelectedEdgeId]);


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
            autoFixPreview,
            previewAutoFixLoading,
            lastAutoFixActions,
            selectedAutoFixCodes,
            stepAutoFixLoading,
            stepAutoFixReport,
            workflowMode,
            menuState,
            smartLinkMenu,
            isTemplateModalOpen,
            telemetryDrawerOpen,
            breakpoints,
            localViewLevel,
            currentViewLevel,
        },
        computed: {
            selectedNode,
            selectedEdge,
            currentDslSnapshot,
            displayNodes,
            displayEdges,
            executionStatusMap,
            canUndo,
            canRedo,
            token,
            hasAutoFixable: hasAutoFixableIssues(selectedAutoFixIssues),
            autoFixableIssueCodes
        },
        setters: {
            setShowLogPanel,
            setShowDebatePanel,
            setLogPanelHeight,
            setDebatePanelHeight,
            setSelectionMode,
            setSnapToGrid,
            setWorkflowMode,
            setMenuState,
            setSmartLinkMenu,
            setIsTemplateModalOpen,
            setTelemetryDrawerOpen,
            setLocalViewLevel,
            setSelectedAutoFixCodes,
            setStepAutoFixReport,
            setAutoFixPreview,
            setLastAutoFixActions,
            setSelectedNodeId,
            setSelectedEdgeId,
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
            handleAutoFixValidationIssues,
            handleStepAutoFixValidationIssues,
            handlePreviewAutoFixValidationIssues,
            handleDragOver,
            handleDrop,
            handleNodeClick,
            handleEdgeClick,
            handlePaneClick,
            onNodeContextMenu,
            onConnectStart,
            onConnectEnd,
            handleSmartLinkSelect,
            handleNodeDragStop,
            handleContextCopy,
            handleContextDelete,
            handleContextSaveTemplate,
            handleContextToggleEnable,
            handleToggleBreakpoint,
            updateNodeData,
            updateEdgeData,
            focusNode,
            focusEdge,
            resetSelection,
        },
        refs: {
            canvasRef
        },
        flowProps: {
            onNodesChange,
            onEdgesChange,
            onConnect,
        }
    };
}

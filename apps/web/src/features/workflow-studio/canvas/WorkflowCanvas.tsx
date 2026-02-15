import React, { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    type NodeTypes,
    type Node,
    useReactFlow,
    SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, message, notification, theme, Tag } from 'antd';
import {
    canonicalizeWorkflowDsl,
    normalizeWorkflowModeValue,
    toWorkflowModeUi,
    type WorkflowDsl,
    type WorkflowValidationResult,
} from '@packages/types';
import { WorkflowNodeComponent } from './WorkflowNodeComponent';
import { GroupNode } from './GroupNode';
import { NodePalette } from './NodePalette';
import { CanvasToolbar } from './CanvasToolbar';
import { PropertyPanel } from './PropertyPanel';
import { RunLogPanel } from './RunLogPanel';
import { DebateTimelinePanel } from './DebateTimelinePanel';
import { useDslSync } from './useDslSync';
import { validateGraph } from './graphValidation';
import { useUndoRedo } from './useUndoRedo';
import { useCopyPaste } from './useCopyPaste';
import { useAutoLayout } from './useAutoLayout';
import { useCanvasAlignment } from './useCanvasAlignment';
import { NodeContextMenu } from './NodeContextMenu';
import { SaveTemplateModal } from './SaveTemplateModal';
import { listNodeTemplates, saveNodeTemplate } from './nodeTemplateStore';
import { SmartLinkMenu } from './SmartLinkMenu';
import { CanvasErrorList, type ValidationError } from './CanvasErrorList';
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

const WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY = 'ctbms.workflow-studio.view-level.v1';

type WorkflowStudioViewLevel = 'business' | 'enhanced' | 'expert';
type RuntimePreset = 'FAST' | 'BALANCED' | 'ROBUST';

const runtimePresetPolicyMap: Record<RuntimePreset, { timeoutMs: number; retryCount: number; retryBackoffMs: number; onError: 'FAIL_FAST' | 'CONTINUE' | 'ROUTE_TO_ERROR' }> = {
    FAST: {
        timeoutMs: 15000,
        retryCount: 0,
        retryBackoffMs: 0,
        onError: 'FAIL_FAST',
    },
    BALANCED: {
        timeoutMs: 30000,
        retryCount: 1,
        retryBackoffMs: 2000,
        onError: 'CONTINUE',
    },
    ROBUST: {
        timeoutMs: 60000,
        retryCount: 3,
        retryBackoffMs: 3000,
        onError: 'ROUTE_TO_ERROR',
    },
};

const AUTO_FIX_STEP_SEQUENCE: Array<{ title: string; codes: string[] }> = [
    { title: '结构连线修复', codes: ['WF003', 'WF004', 'WF005'] },
    { title: '编排骨架修复', codes: ['WF101', 'WF102'] },
    { title: '策略与风控修复', codes: ['WF106', 'WF104'] },
];

type AutoFixPreviewState = {
    actions: string[];
    remainingIssueCount: number;
    generatedAt: string;
    changeSummary: WorkflowDslChangeSummary;
};

type StepAutoFixReportStep = {
    title: string;
    codes: string[];
    actions: string[];
    remainingIssueCount: number;
    changeSummary: WorkflowDslChangeSummary;
};

type StepAutoFixReportState = {
    generatedAt: string;
    finalIssueCount: number;
    steps: StepAutoFixReportStep[];
};

interface WorkflowCanvasProps {
    initialDsl?: WorkflowDsl;
    onSave?: (dsl: WorkflowDsl) => void | Promise<void>;
    onValidate?: (
        dsl: WorkflowDsl,
        stage?: 'SAVE' | 'PUBLISH',
    ) => Promise<WorkflowValidationResult | undefined>;
    isReadOnly?: boolean;
    onRun?: (dsl: WorkflowDsl) => Promise<string | undefined>;
    currentVersionId?: string;
    currentDefinitionId?: string;
    viewLevel?: WorkflowStudioViewLevel;
    onViewLevelChange?: (level: WorkflowStudioViewLevel) => void;
    viewMode?: 'edit' | 'replay';
    executionData?: any; // We'll refine this type later
}

const WorkflowCanvasInner: React.FC<WorkflowCanvasProps> = ({
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
}) => {
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

    React.useEffect(() => {
        if (initialDsl?.mode) {
            setWorkflowMode(toWorkflowModeUi(initialDsl.mode));
        }
    }, [initialDsl?.mode]);

    React.useEffect(() => {
        if (viewLevel) {
            setLocalViewLevel(viewLevel);
        }
    }, [viewLevel]);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(WORKFLOW_STUDIO_VIEW_LEVEL_STORAGE_KEY, currentViewLevel);
    }, [currentViewLevel]);

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

    const nodeTypes: NodeTypes = useMemo(
        () => ({
            workflowNode: WorkflowNodeComponent,
            group: GroupNode,
        }),
        [],
    );

    const selectedNode = useMemo(
        () => nodes.find((node) => node.id === selectedNodeId) ?? null,
        [nodes, selectedNodeId],
    );

    const selectedEdge = useMemo(
        () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
        [edges, selectedEdgeId],
    );

    // Execution Overlay Logic
    const executionStatusMap = useMemo(() => {
        if (viewMode !== 'replay' || !executionData) {
            return new Map<string, string>();
        }
        const statusMap = new Map<string, string>();
        const history = executionData.history || [];

        // Mark executed nodes
        history.forEach((step: any) => {
            if (step.nodeId) {
                statusMap.set(step.nodeId, step.status);
            }
        });

        return statusMap;
    }, [viewMode, executionData]);

    const getEdgeStyle = useCallback((edge: any) => {
        if (viewMode !== 'replay') return {};
        const sourceStatus = executionStatusMap.get(edge.source);
        const targetStatus = executionStatusMap.get(edge.target);

        // Heuristic: if source and target are executed, edge might be traversed.
        // For better accuracy, we would need edge traversal data from backend.
        const isTraversed = sourceStatus === 'SUCCESS' && (targetStatus === 'SUCCESS' || targetStatus === 'FAILED');

        if (isTraversed) {
            return {
                stroke: token.colorSuccess,
                strokeWidth: 2,
                animated: true,
            };
        }
        return {
            stroke: token.colorBorder,
            opacity: 0.2,
        };
    }, [viewMode, executionStatusMap, token]);

    const getNodeStyle = useCallback((node: Node) => {
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
            // Not executed yet or unreachable
            opacity = 0.4;
        }

        return {
            border: `2px solid ${borderColor}`,
            background,
            opacity,
            transition: 'all 0.3s ease',
        };
    }, [viewMode, executionStatusMap, token]);

    // Apply styles to nodes and edges in replay mode
    const displayNodes = useMemo(() => {
        if (viewMode !== 'replay') return nodes;
        return nodes.map(node => ({
            ...node,
            style: { ...node.style, ...getNodeStyle(node) },
            draggable: false,
            connectable: false,
            selectable: true, // Allow selection to see details
        }));
    }, [nodes, viewMode, getNodeStyle]);

    const displayEdges = useMemo(() => {
        if (viewMode !== 'replay') return edges;
        return edges.map(edge => ({
            ...edge,
            style: { ...edge.style, ...getEdgeStyle(edge) },
            animated: getEdgeStyle(edge).animated,
        }));
    }, [edges, viewMode, getEdgeStyle]);

    const buildCurrentDsl = useCallback((): WorkflowDsl => {
        const dsl = exportDsl();
        const positionMap = new Map(reactFlow.getNodes().map((node) => [node.id, node.position] as const));

        return canonicalizeWorkflowDsl({
            ...dsl,
            mode: normalizeWorkflowModeValue(workflowMode),
            nodes: dsl.nodes.map((node) => ({
                ...node,
                config: {
                    ...(node.config ?? {}),
                    _position:
                        positionMap.get(node.id)
                        ?? (node.config as Record<string, unknown> | undefined)?._position,
                },
            })),
        });
    }, [exportDsl, reactFlow, workflowMode]);

    const runValidation = useCallback(
        async (dsl: WorkflowDsl): Promise<ValidationError[]> => {
            if (onValidate) {
                const remoteResult = await onValidate(dsl, 'SAVE');
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
        [onValidate, nodes, edges, workflowMode],
    );

    const autoFixableIssueCodes = useMemo(
        () => getAutoFixableIssueCodes(validationErrors),
        [validationErrors],
    );

    React.useEffect(() => {
        setSelectedAutoFixCodes((prev) => {
            const kept = prev.filter((code) => autoFixableIssueCodes.includes(code));
            if (kept.length > 0) {
                return kept;
            }
            return autoFixableIssueCodes;
        });
    }, [autoFixableIssueCodes]);

    const selectedAutoFixIssues = useMemo(() => {
        if (selectedAutoFixCodes.length === 0) {
            return [];
        }
        const selectedCodeSet = new Set(selectedAutoFixCodes);
        return validationErrors.filter((item) => {
            const code = extractIssueCode(item.message);
            return Boolean(code && selectedCodeSet.has(code));
        });
    }, [validationErrors, selectedAutoFixCodes]);

    React.useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            try {
                const dsl = buildCurrentDsl();
                const errors = await runValidation(dsl);
                if (active) {
                    setValidationErrors(errors);
                }
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
        const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(
            dsl,
            selectedAutoFixIssues,
            selectedAutoFixCodes,
        );
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
        notification.success({
            message: `自动修复明细（${actions.length} 项）`,
            duration: 5,
            description: (
                <div>
                    <div>
                        节点 +{changeSummary.addedNodeIds.length} / -{changeSummary.removedNodeIds.length}，
                        连线 +{changeSummary.addedEdgeIds.length} / -{changeSummary.removedEdgeIds.length}，
                        策略更新 {changeSummary.updatedRuntimePolicyNodeIds.length}
                    </div>
                    {actions.map((action, index) => (
                        <div key={`${action}-${index}`}>
                            {index + 1}. {action}
                        </div>
                    ))}
                </div>
            ),
        });
        const nextErrors = await runValidation(canonicalFixedDsl);
        setValidationErrors(nextErrors);
    }, [
        buildCurrentDsl,
        loadDsl,
        runValidation,
        selectedAutoFixIssues,
        selectedAutoFixCodes,
    ]);

    const handlePreviewAutoFixValidationIssues = useCallback(async () => {
        if (selectedAutoFixIssues.length === 0) {
            message.info('请先选择要预览修复的问题类型');
            return;
        }
        const dsl = buildCurrentDsl();
        const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(
            dsl,
            selectedAutoFixIssues,
            selectedAutoFixCodes,
        );
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
                if (stepCodes.length === 0) {
                    continue;
                }
                const stepCodeSet = new Set(stepCodes);
                const stepIssues = workingErrors.filter((issue) => {
                    const code = extractIssueCode(issue.message);
                    return Boolean(code && stepCodeSet.has(code));
                });
                if (stepIssues.length === 0) {
                    continue;
                }

                const { dsl: fixedDsl, actions } = applyAutoFixesToDsl(workingDsl, stepIssues, stepCodes);
                if (actions.length === 0) {
                    continue;
                }

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
            notification.success({
                message: `分步修复报告（${stepReports.length} 步）`,
                duration: 6,
                description: (
                    <div>
                        {stepReports.map((item, index) => (
                            <div key={`${item.title}-${index}`}>
                                {index + 1}. {item.title}，执行 {item.actions.length} 项，剩余 {item.remainingIssueCount} 项
                            </div>
                        ))}
                    </div>
                ),
            });
        } finally {
            setStepAutoFixLoading(false);
        }
    }, [buildCurrentDsl, loadDsl, runValidation, selectedAutoFixCodes, validationErrors]);

    React.useEffect(() => {
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
            if (!nodeType) {
                return;
            }

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
        if (!onSave) {
            return;
        }

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
            const nonRuntimeNodeTypes = new Set(['manual-trigger', 'cron-trigger', 'api-trigger', 'event-trigger', 'group']);
            takeSnapshot(nodes, edges);
            setNodes((items) =>
                items.map((node) => {
                    const nodeType = String(node.data.type || node.type);
                    if (nonRuntimeNodeTypes.has(nodeType)) {
                        return node;
                    }
                    const currentRuntimePolicy = (node.data.runtimePolicy as Record<string, unknown>) ?? {};
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            runtimePolicy: {
                                ...currentRuntimePolicy,
                                timeoutMs: policy.timeoutMs,
                                retryCount: policy.retryCount,
                                retryBackoffMs: policy.retryBackoffMs,
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

    // Keyboard shortcuts
    React.useEffect(() => {
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
            if (id) {
                setExecutionId(id);
            }
            setShowLogPanel(true);
            if (workflowMode === 'debate') {
                setShowDebatePanel(true);
            }
        } catch {
            message.error('运行失败');
        }
    }, [onRun, buildCurrentDsl, runValidation, workflowMode]);



    const onConnectStart = useCallback(
        (_: any, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
            connectingNodeId.current = nodeId;
            connectingHandleId.current = handleId;
        },
        [],
    );

    const onConnectEnd = useCallback(
        (event: any) => {
            if (!connectingNodeId.current) {
                return;
            }

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
        },
        [],
    );

    const handleSmartLinkSelect = useCallback(
        (nodeType: string) => {
            if (!smartLinkMenu) {
                return;
            }

            const { top, left, sourceNodeId, sourceHandleId } = smartLinkMenu;
            const position = reactFlow.screenToFlowPosition({
                x: left + (canvasRef.current?.getBoundingClientRect().left ?? 0),
                y: top + (canvasRef.current?.getBoundingClientRect().top ?? 0),
            });

            // Add new node
            const newNodeId = addNode(nodeType, position);

            // Connect source to new node
            // Assuming default handles for now, or letting onConnect handle logic if we triggered it
            // But here we manually create edge
            const sourceNode = nodes.find((n) => n.id === sourceNodeId);
            if (sourceNode && newNodeId) {
                const newEdge = {
                    id: `e_${sourceNodeId}_${newNodeId}_${Date.now()}`,
                    source: sourceNodeId,
                    target: newNodeId,
                    sourceHandle: sourceHandleId,
                    type: 'default', // or smoothstep based on preference
                };
                // We need to use onConnect or setEdges to add the edge.
                // onConnect is usually for Connection object.
                // Let's manually add edge
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
                            ? {
                                ...item,
                                position: newPosition,
                                parentId: groupNode.id,
                                extent: 'parent',
                            }
                            : item,
                    ),
                );
                return;
            }

            if (!groupNode && node.parentId) {
                const parent = nodes.find((item) => item.id === node.parentId);
                if (!parent) {
                    return;
                }
                const absolutePosition = {
                    x: node.position.x + parent.position.x,
                    y: node.position.y + parent.position.y,
                };
                setNodes((items) =>
                    items.map((item) =>
                        item.id === node.id
                            ? {
                                ...item,
                                position: absolutePosition,
                                parentId: undefined,
                                extent: undefined,
                            }
                            : item,
                    ),
                );
            }
        },
        [reactFlow, setNodes, nodes],
    );

    const handleContextCopy = useCallback(() => {
        if (!menuState) {
            return;
        }
        const source = nodes.find((node) => node.id === menuState.id);
        if (!source) {
            return;
        }

        takeSnapshot(nodes, edges);
        const duplicatedNodeId = `${source.data.type}_${Date.now()}`;
        const duplicatedData = JSON.parse(JSON.stringify(source.data)) as Node['data'];

        setNodes((items) => [
            ...items.map((item) => ({ ...item, selected: false })),
            {
                ...source,
                id: duplicatedNodeId,
                position: {
                    x: source.position.x + 48,
                    y: source.position.y + 48,
                },
                data: duplicatedData,
                selected: true,
            },
        ]);

        setSelectedNodeId(duplicatedNodeId);
        setSelectedEdgeId(null);
        message.success('节点已复制');
    }, [menuState, nodes, edges, setNodes, takeSnapshot]);

    const handleContextDelete = useCallback(() => {
        if (!menuState) {
            return;
        }
        takeSnapshot(nodes, edges);
        setNodes((items) => items.filter((item) => item.id !== menuState.id));
        setEdges((items) =>
            items.filter((item) => item.source !== menuState.id && item.target !== menuState.id),
        );
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
    }, [menuState, nodes, edges, takeSnapshot, setNodes, setEdges]);

    const handleContextSaveTemplate = useCallback(() => {
        if (!menuState) {
            return;
        }
        const node = nodes.find((item) => item.id === menuState.id);
        if (!node) {
            return;
        }
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

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {!isReadOnly && <NodePalette viewLevel={currentViewLevel} />}

            <div
                ref={canvasRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    background: token.colorBgLayout,
                    position: 'relative',
                }}
            >
                {!isReadOnly && (
                    <CanvasToolbar
                        onSave={handleSave}
                        onExportDsl={handleExportDsl}
                        onClearCanvas={handleClearCanvas}
                        isSaving={isSaving}
                        onRun={handleRun}
                        onToggleLogs={() => setShowLogPanel((value) => !value)}
                        selectionMode={selectionMode}
                        onSelectionModeChange={setSelectionMode}
                        workflowMode={workflowMode}
                        onWorkflowModeChange={setWorkflowMode}
                        viewLevel={currentViewLevel}
                        onViewLevelChange={(level) => {
                            setLocalViewLevel(level);
                            onViewLevelChange?.(level);
                        }}
                        onUndo={() => undo(nodes, edges, setNodes, setEdges)}
                        onRedo={() => redo(nodes, edges, setNodes, setEdges)}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onAutoLayout={() => onLayout('LR')}
                        onToggleDebatePanel={() => setShowDebatePanel((value) => !value)}
                        snapToGrid={snapToGrid}
                        onToggleSnapToGrid={() => setSnapToGrid((value) => !value)}
                        onAlign={alignNodes}
                        onPublish={currentVersionId ? () => setIsTemplateModalOpen(true) : undefined}
                        onApplyRuntimePreset={handleApplyRuntimePreset}
                    />
                )}

                <div
                    style={{ flex: 1, position: 'relative' }}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {validationErrors.length > 0 && (
                        <CanvasErrorList
                            errors={validationErrors}
                            onAutoFix={handleAutoFixValidationIssues}
                            autoFixEnabled={hasAutoFixableIssues(selectedAutoFixIssues)}
                            onStepAutoFix={handleStepAutoFixValidationIssues}
                            stepAutoFixEnabled={hasAutoFixableIssues(selectedAutoFixIssues)}
                            stepAutoFixLoading={stepAutoFixLoading}
                            stepAutoFixReport={stepAutoFixReport}
                            onClearStepAutoFixReport={() => setStepAutoFixReport(null)}
                            onPreviewAutoFix={handlePreviewAutoFixValidationIssues}
                            previewAutoFixEnabled={hasAutoFixableIssues(selectedAutoFixIssues)}
                            previewAutoFixLoading={previewAutoFixLoading}
                            autoFixPreview={autoFixPreview}
                            onClearAutoFixPreview={() => setAutoFixPreview(null)}
                            autoFixCodeOptions={autoFixableIssueCodes}
                            selectedAutoFixCodes={selectedAutoFixCodes}
                            onSelectedAutoFixCodesChange={setSelectedAutoFixCodes}
                            lastAutoFixActions={lastAutoFixActions}
                            onClearAutoFixActions={() => setLastAutoFixActions([])}
                            onFocusNode={(nodeId) => {
                                const node = nodes.find(n => n.id === nodeId);
                                if (node) {
                                    setSelectedNodeId(nodeId);
                                    reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 800, padding: 0.5 });
                                } else {
                                    message.warning(`节点 ${nodeId} 不在当前画布（可能已删除）`);
                                }
                            }}
                            onFocusEdge={(edgeId) => {
                                const edge = edges.find(e => e.id === edgeId);
                                if (edge) {
                                    setSelectedEdgeId(edgeId);
                                    // ReactFlow doesn't support fitView for edges directly but we can fit the source/target
                                    const source = nodes.find(n => n.id === edge.source);
                                    const target = nodes.find(n => n.id === edge.target);
                                    if (source && target) {
                                        reactFlow.fitView({ nodes: [{ id: source.id }, { id: target.id }], duration: 800, padding: 0.5 });
                                    }
                                } else {
                                    message.warning(`连线 ${edgeId} 不在当前画布（可能已删除）`);
                                }
                            }}
                        />
                    )}

                    <ReactFlow
                        nodes={displayNodes}
                        edges={displayEdges}
                        onNodesChange={isReadOnly ? undefined : onNodesChange}
                        onEdgesChange={isReadOnly ? undefined : onEdgesChange}
                        onConnect={isReadOnly ? undefined : onConnect}
                        onNodeClick={handleNodeClick}
                        onEdgeClick={handleEdgeClick}
                        onPaneClick={handlePaneClick}
                        onNodeContextMenu={isReadOnly ? undefined : onNodeContextMenu}
                        onNodeDragStop={isReadOnly ? undefined : handleNodeDragStop}
                        onConnectStart={isReadOnly ? undefined : onConnectStart}
                        onConnectEnd={isReadOnly ? undefined : onConnectEnd}
                        nodeTypes={nodeTypes}
                        fitView
                        snapToGrid={snapToGrid}
                        snapGrid={[16, 16]}
                        deleteKeyCode={isReadOnly ? null : 'Delete'}
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { strokeWidth: 2 },
                        }}
                        proOptions={{ hideAttribution: true }}
                        panOnDrag={selectionMode === 'hand'}
                        selectionOnDrag={selectionMode === 'pointer'}
                        selectionMode={selectionMode === 'pointer' ? SelectionMode.Partial : undefined}
                    >
                        <Background gap={16} size={1} color={token.colorBorderSecondary} />
                        <Controls showInteractive={!isReadOnly && viewMode === 'edit'} />
                        <MiniMap
                            nodeStrokeWidth={3}
                            style={{
                                background: token.colorBgContainer,
                                border: `1px solid ${token.colorBorderSecondary}`,
                            }}
                            maskColor={`${token.colorBgLayout}80`}
                        />
                    </ReactFlow>

                    {/* Execution Legend Overlay */}
                    {viewMode === 'replay' && (
                        <div style={{ position: 'absolute', bottom: 32, left: 16, zIndex: 10, background: token.colorBgContainer, padding: 8, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: token.boxShadowSecondary }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: token.colorSuccessBg, border: `1px solid ${token.colorSuccess}`, borderRadius: 2 }}></span> <span>成功</span></div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: token.colorErrorBg, border: `1px solid ${token.colorError}`, borderRadius: 2 }}></span> <span>失败</span></div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: token.colorBgContainer, border: `1px solid ${token.colorBorder}`, borderRadius: 2 }}></span> <span>未执行</span></div>
                        </div>
                    )}
                </div>

                {showLogPanel ? (
                    <RunLogPanel
                        executionId={executionId}
                        height={logPanelHeight}
                        onHeightChange={setLogPanelHeight}
                        onClose={() => setShowLogPanel(false)}
                        onLogClick={(nodeId) => {
                            setSelectedNodeId(nodeId);
                            reactFlow.fitView({ nodes: [{ id: nodeId }], duration: 800, padding: 0.5 });
                        }}
                    />
                ) : null}

                {showDebatePanel ? (
                    <div
                        style={{
                            position: 'absolute',
                            top: 60,
                            right: 320,
                            bottom: showLogPanel ? logPanelHeight : 0,
                            width: 350,
                            zIndex: 90,
                            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                        }}
                    >
                        <DebateTimelinePanel
                            executionId={executionId}
                            height={debatePanelHeight}
                            onHeightChange={setDebatePanelHeight}
                            onClose={() => setShowDebatePanel(false)}
                        />
                    </div>
                ) : null}
            </div>

            {!isReadOnly && (selectedNode || selectedEdge) ? (
                <PropertyPanel
                    selectedNode={selectedNode}
                    selectedEdge={selectedEdge}
                    onUpdateNode={updateNodeData}
                    onUpdateEdge={updateEdgeData}
                    viewLevel={currentViewLevel}
                    onClose={() => {
                        setSelectedNodeId(null);
                        setSelectedEdgeId(null);
                    }}
                />
            ) : null}

            {viewMode === 'replay' && (selectedNode || selectedEdge) ? (
                <div
                    style={{
                        width: 320,
                        borderLeft: `1px solid ${token.colorBorderSecondary}`,
                        background: token.colorBgContainer,
                        padding: 16,
                        overflowY: 'auto'
                    }}
                >
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', fontSize: 16 }}>
                            {selectedNode ? '节点执行详情' : '连线信息'}
                        </span>
                        <a onClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} style={{ cursor: 'pointer' }}>关闭</a>
                    </div>
                    {selectedNode && (
                        <div>
                            <p style={{ marginBottom: 8 }}><Tag color="blue">{String(selectedNode.data.type)}</Tag> <strong>{String(selectedNode.data.name)}</strong></p>
                            <div style={{ marginBottom: 16 }}>
                                <Alert
                                    message={executionStatusMap.get(selectedNode.id) || 'PENDING'}
                                    type={
                                        executionStatusMap.get(selectedNode.id) === 'SUCCESS' ? 'success' :
                                            executionStatusMap.get(selectedNode.id) === 'FAILED' ? 'error' : 'info'
                                    }
                                    showIcon
                                />
                            </div>
                            <div style={{ marginBottom: 8 }}>
                                <span style={{ color: token.colorTextSecondary }}>Node ID: </span>
                                <span style={{ fontFamily: 'monospace' }}>{selectedNode.id}</span>
                            </div>
                            {/* Detailed execution data visualization can be added here */}
                        </div>
                    )}
                </div>
            ) : null}

            {menuState ? (
                <NodeContextMenu
                    id={menuState.id}
                    top={menuState.top}
                    left={menuState.left}
                    onCopy={handleContextCopy}
                    onDelete={handleContextDelete}
                    onSaveTemplate={handleContextSaveTemplate}
                    onToggleEnable={handleContextToggleEnable}
                    isEnabled={(nodes.find((n) => n.id === menuState.id)?.data.enabled as boolean) ?? true}
                    onToggleBreakpoint={() => {
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
                    }}
                    hasBreakpoint={menuState ? breakpoints.has(menuState.id) : false}
                    onClose={() => setMenuState(null)}
                />
            ) : null}

            {currentVersionId ? (
                <SaveTemplateModal
                    open={isTemplateModalOpen}
                    onClose={() => setIsTemplateModalOpen(false)}
                    sourceVersionId={currentVersionId}
                    sourceWorkflowDefinitionId={currentDefinitionId}
                    initialName={initialDsl?.name}
                    initialCode={initialDsl?.workflowId !== 'new' ? initialDsl?.workflowId : undefined}
                />
            ) : null}

            {smartLinkMenu && !isReadOnly ? (
                <SmartLinkMenu
                    top={smartLinkMenu.top}
                    left={smartLinkMenu.left}
                    sourceNodeType={nodes.find((n) => n.id === smartLinkMenu.sourceNodeId)?.type ?? ''}
                    onSelect={handleSmartLinkSelect}
                    onClose={() => setSmartLinkMenu(null)}
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

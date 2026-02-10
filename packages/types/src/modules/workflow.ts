import { z } from 'zod';

export const WorkflowModeEnum = z.enum(['LINEAR', 'DAG', 'DEBATE']);
export const WorkflowUsageMethodEnum = z.enum(['HEADLESS', 'COPILOT', 'ON_DEMAND']);
export const WorkflowDefinitionStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const WorkflowVersionStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const WorkflowTemplateSourceEnum = z.enum(['PUBLIC', 'PRIVATE']);

export const WorkflowEdgeTypeEnum = z.enum([
    'data-edge',
    'control-edge',
    'condition-edge',
    'error-edge',
]);

export const WorkflowNodeOnErrorPolicyEnum = z.enum([
    'FAIL_FAST',
    'CONTINUE',
    'ROUTE_TO_ERROR',
]);

export const WorkflowNodeRuntimePolicySchema = z.object({
    timeoutMs: z.coerce.number().int().min(1000).max(120000).default(30000),
    retryCount: z.coerce.number().int().min(0).max(5).default(1),
    retryBackoffMs: z.coerce.number().int().min(0).max(60000).default(2000),
    onError: WorkflowNodeOnErrorPolicyEnum.default('FAIL_FAST'),
});

export const WorkflowNodeRuntimePolicyPatchSchema = WorkflowNodeRuntimePolicySchema.partial();

export const WorkflowRunPolicySchema = z
    .object({
        nodeDefaults: WorkflowNodeRuntimePolicyPatchSchema.optional(),
    })
    .catchall(z.unknown());

export const WorkflowRuntimeStatusEnum = z.enum(['DRAFT', 'REVIEW', 'ACTIVE', 'ARCHIVED']);
export const WorkflowTriggerTypeEnum = z.enum(['MANUAL', 'API', 'SCHEDULE', 'EVENT', 'ON_DEMAND']);
export const WorkflowExecutionStatusEnum = z.enum([
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'CANCELED',
]);
export const NodeExecutionStatusEnum = z.enum([
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'SKIPPED',
]);

export const WorkflowNodeSchema = z.object({
    id: z.string().min(1, '节点 ID 不能为空'),
    type: z.string().min(1, '节点类型不能为空'),
    name: z.string().min(1, '节点名称不能为空'),
    enabled: z.boolean().default(true),
    config: z.record(z.unknown()).default({}),
    runtimePolicy: WorkflowNodeRuntimePolicyPatchSchema.optional(),
    inputBindings: z.record(z.unknown()).optional(),
    outputSchema: z.string().optional(),
});

export const WorkflowEdgeSchema = z.object({
    id: z.string().min(1, '连线 ID 不能为空'),
    from: z.string().min(1, '起始节点不能为空'),
    to: z.string().min(1, '目标节点不能为空'),
    edgeType: WorkflowEdgeTypeEnum,
    condition: z.unknown().nullable().optional(),
});

export const WorkflowDslSchema = z.object({
    workflowId: z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/, 'workflowId 格式不正确'),
    name: z.string().min(1, '流程名称不能为空').max(100, '流程名称不能超过 100 字符'),
    mode: WorkflowModeEnum,
    usageMethod: WorkflowUsageMethodEnum,
    version: z.string().default('1.0.0'),
    status: WorkflowRuntimeStatusEnum.default('DRAFT'),
    ownerUserId: z.string().optional(),
    templateSource: WorkflowTemplateSourceEnum.optional(),
    nodes: z.array(WorkflowNodeSchema).min(1, '至少需要一个节点'),
    edges: z.array(WorkflowEdgeSchema).default([]),
    paramSetBindings: z.array(z.string()).optional(),
    agentBindings: z.array(z.string()).optional(),
    runPolicy: WorkflowRunPolicySchema.optional(),
    outputConfig: z.record(z.unknown()).optional(),
    experimentConfig: z.record(z.unknown()).optional(),
});

export const WorkflowDefinitionSchema = z.object({
    id: z.string().uuid(),
    workflowId: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    mode: WorkflowModeEnum,
    usageMethod: WorkflowUsageMethodEnum,
    status: WorkflowDefinitionStatusEnum,
    ownerUserId: z.string(),
    templateSource: WorkflowTemplateSourceEnum,
    isActive: z.boolean(),
    latestVersionCode: z.string().nullable().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export const WorkflowVersionSchema = z.object({
    id: z.string().uuid(),
    workflowDefinitionId: z.string().uuid(),
    versionCode: z.string(),
    status: WorkflowVersionStatusEnum,
    dslSnapshot: WorkflowDslSchema,
    changelog: z.string().nullable().optional(),
    createdByUserId: z.string(),
    publishedAt: z.date().nullable().optional(),
    createdAt: z.date().optional(),
});

export const WorkflowExecutionSchema = z.object({
    id: z.string().uuid(),
    workflowVersionId: z.string().uuid(),
    sourceExecutionId: z.string().uuid().nullable().optional(),
    triggerType: WorkflowTriggerTypeEnum,
    triggerUserId: z.string(),
    status: WorkflowExecutionStatusEnum,
    startedAt: z.date().nullable().optional(),
    completedAt: z.date().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    paramSnapshot: z.record(z.unknown()).nullable().optional(),
    outputSnapshot: z.record(z.unknown()).nullable().optional(),
    createdAt: z.date().optional(),
});

export const NodeExecutionSchema = z.object({
    id: z.string().uuid(),
    workflowExecutionId: z.string().uuid(),
    nodeId: z.string(),
    nodeType: z.string(),
    status: NodeExecutionStatusEnum,
    startedAt: z.date().nullable().optional(),
    completedAt: z.date().nullable().optional(),
    durationMs: z.number().int().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    inputSnapshot: z.record(z.unknown()).nullable().optional(),
    outputSnapshot: z.record(z.unknown()).nullable().optional(),
    createdAt: z.date().optional(),
});

export const CreateWorkflowDefinitionSchema = z.object({
    workflowId: z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/, 'workflowId 格式不正确'),
    name: z.string().min(1, '流程名称不能为空').max(100, '流程名称不能超过 100 字符'),
    description: z.string().max(1000, '描述不能超过 1000 字符').optional(),
    mode: WorkflowModeEnum,
    usageMethod: WorkflowUsageMethodEnum,
    templateSource: WorkflowTemplateSourceEnum.default('PRIVATE'),
    dslSnapshot: WorkflowDslSchema.optional(),
    changelog: z.string().max(500, '变更说明不能超过 500 字符').optional(),
});

export const UpdateWorkflowDefinitionSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).optional(),
    usageMethod: WorkflowUsageMethodEnum.optional(),
    status: WorkflowDefinitionStatusEnum.optional(),
    isActive: z.boolean().optional(),
});

export const WorkflowDefinitionQuerySchema = z.object({
    keyword: z.string().optional(),
    mode: WorkflowModeEnum.optional(),
    usageMethod: WorkflowUsageMethodEnum.optional(),
    status: WorkflowDefinitionStatusEnum.optional(),
    includePublic: z.coerce.boolean().default(true),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const TriggerWorkflowExecutionSchema = z.object({
    workflowDefinitionId: z.string().uuid(),
    workflowVersionId: z.string().uuid().optional(),
    triggerType: WorkflowTriggerTypeEnum.default('MANUAL'),
    paramSnapshot: z.record(z.unknown()).optional(),
});

export const WorkflowExecutionQuerySchema = z.object({
    workflowDefinitionId: z.string().uuid().optional(),
    workflowVersionId: z.string().uuid().optional(),
    versionCode: z.string().max(60).optional(),
    triggerType: WorkflowTriggerTypeEnum.optional(),
    status: WorkflowExecutionStatusEnum.optional(),
    hasSoftFailure: z.coerce.boolean().optional(),
    hasErrorRoute: z.coerce.boolean().optional(),
    keyword: z.string().max(120).optional(),
    startedAtFrom: z.coerce.date().optional(),
    startedAtTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
}).refine(
    (value) => !value.startedAtFrom || !value.startedAtTo || value.startedAtFrom <= value.startedAtTo,
    {
        message: 'startedAtFrom 不能晚于 startedAtTo',
        path: ['startedAtFrom'],
    },
);

export const WorkflowExecutionDetailSchema = WorkflowExecutionSchema.extend({
    nodeExecutions: z.array(NodeExecutionSchema),
});

export const WorkflowExecutionPageSchema = z.object({
    data: z.array(WorkflowExecutionSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});

export const CreateWorkflowVersionSchema = z.object({
    dslSnapshot: WorkflowDslSchema,
    changelog: z.string().max(500).optional(),
});

export const PublishWorkflowVersionSchema = z
    .object({
        versionId: z.string().uuid().optional(),
        versionCode: z.string().optional(),
    })
    .refine((value) => Boolean(value.versionId || value.versionCode), {
        message: 'versionId 或 versionCode 至少提供一个',
        path: ['versionId'],
    });

export const WorkflowValidationSeverityEnum = z.enum(['ERROR', 'WARN']);
export const WorkflowValidationIssueCodeEnum = z.enum([
    'WF001',
    'WF002',
    'WF003',
    'WF004',
    'WF005',
    'WF101',
    'WF102',
    'WF103',
    'WF104',
    'WF105',
]);

export const WorkflowValidationStageEnum = z.enum(['SAVE', 'PUBLISH']);

export const WorkflowValidationIssueSchema = z.object({
    code: WorkflowValidationIssueCodeEnum,
    severity: WorkflowValidationSeverityEnum.default('ERROR'),
    message: z.string(),
    nodeId: z.string().optional(),
    edgeId: z.string().optional(),
});

export const WorkflowValidationResultSchema = z.object({
    valid: z.boolean(),
    issues: z.array(WorkflowValidationIssueSchema),
});

export const ValidateWorkflowDslSchema = z.object({
    dslSnapshot: WorkflowDslSchema,
    stage: WorkflowValidationStageEnum.default('SAVE'),
});

export const WorkflowDefinitionPageSchema = z.object({
    data: z.array(WorkflowDefinitionSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
});

export type WorkflowMode = z.infer<typeof WorkflowModeEnum>;
export type WorkflowUsageMethod = z.infer<typeof WorkflowUsageMethodEnum>;
export type WorkflowDefinitionStatus = z.infer<typeof WorkflowDefinitionStatusEnum>;
export type WorkflowVersionStatus = z.infer<typeof WorkflowVersionStatusEnum>;
export type WorkflowTemplateSource = z.infer<typeof WorkflowTemplateSourceEnum>;
export type WorkflowEdgeType = z.infer<typeof WorkflowEdgeTypeEnum>;
export type WorkflowNodeOnErrorPolicy = z.infer<typeof WorkflowNodeOnErrorPolicyEnum>;
export type WorkflowTriggerType = z.infer<typeof WorkflowTriggerTypeEnum>;
export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatusEnum>;
export type NodeExecutionStatus = z.infer<typeof NodeExecutionStatusEnum>;

export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowDsl = z.infer<typeof WorkflowDslSchema>;
export type WorkflowNodeRuntimePolicy = z.infer<typeof WorkflowNodeRuntimePolicySchema>;
export type WorkflowNodeRuntimePolicyPatch = z.infer<typeof WorkflowNodeRuntimePolicyPatchSchema>;
export type WorkflowRunPolicy = z.infer<typeof WorkflowRunPolicySchema>;

export type WorkflowDefinitionDto = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowVersionDto = z.infer<typeof WorkflowVersionSchema>;
export type WorkflowDefinitionPageDto = z.infer<typeof WorkflowDefinitionPageSchema>;
export type WorkflowExecutionDto = z.infer<typeof WorkflowExecutionSchema>;
export type NodeExecutionDto = z.infer<typeof NodeExecutionSchema>;
export type WorkflowExecutionDetailDto = z.infer<typeof WorkflowExecutionDetailSchema>;
export type WorkflowExecutionPageDto = z.infer<typeof WorkflowExecutionPageSchema>;

export type CreateWorkflowDefinitionDto = z.infer<typeof CreateWorkflowDefinitionSchema>;
export type UpdateWorkflowDefinitionDto = z.infer<typeof UpdateWorkflowDefinitionSchema>;
export type WorkflowDefinitionQueryDto = z.infer<typeof WorkflowDefinitionQuerySchema>;
export type CreateWorkflowVersionDto = z.infer<typeof CreateWorkflowVersionSchema>;
export type PublishWorkflowVersionDto = z.infer<typeof PublishWorkflowVersionSchema>;
export type TriggerWorkflowExecutionDto = z.infer<typeof TriggerWorkflowExecutionSchema>;
export type WorkflowExecutionQueryDto = z.infer<typeof WorkflowExecutionQuerySchema>;

export type WorkflowValidationIssue = z.infer<typeof WorkflowValidationIssueSchema>;
export type WorkflowValidationResult = z.infer<typeof WorkflowValidationResultSchema>;
export type ValidateWorkflowDslDto = z.infer<typeof ValidateWorkflowDslSchema>;
export type WorkflowValidationStage = z.infer<typeof WorkflowValidationStageEnum>;

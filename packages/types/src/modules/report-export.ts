import { z } from 'zod';

// ── 导出格式 ──

export const ExportFormatEnum = z.enum(['PDF', 'WORD', 'JSON']);

// ── 导出报告段落 ──

export const ExportReportSectionEnum = z.enum([
  'CONCLUSION',
  'EVIDENCE',
  'DEBATE_PROCESS',
  'RISK_ASSESSMENT',
]);

// ── 导出请求 ──

export const ExportDebateReportSchema = z.object({
  workflowExecutionId: z.string().uuid(),
  format: ExportFormatEnum.default('PDF'),
  sections: z
    .array(ExportReportSectionEnum)
    .min(1)
    .default(['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT']),
  title: z.string().max(200).optional(),
  includeRawData: z.boolean().default(false),
});

// ── 结论页数据 ──

export const ReportConclusionSchema = z.object({
  action: z.string(),
  confidence: z.number().nullable().optional(),
  riskLevel: z.string().nullable().optional(),
  targetWindow: z.string().nullable().optional(),
  reasoningSummary: z.string().nullable().optional(),
  judgementVerdict: z.string().nullable().optional(),
  judgementReasoning: z.string().nullable().optional(),
});

// ── 证据页数据 ──

export const ReportEvidenceItemSchema = z.object({
  source: z.string(),
  category: z.string().nullable().optional(),
  content: z.string(),
  weight: z.number().nullable().optional(),
});

// ── 辩论过程页数据 ──

export const ReportDebateRoundSchema = z.object({
  roundNumber: z.number().int(),
  participantCode: z.string(),
  participantRole: z.string(),
  stance: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  statementSummary: z.string(),
  challengeText: z.string().nullable().optional(),
  challengeTarget: z.string().nullable().optional(),
  isJudgement: z.boolean(),
});

// ── 风险页数据 ──

export const ReportRiskItemSchema = z.object({
  riskType: z.string(),
  level: z.string(),
  description: z.string(),
  mitigationAction: z.string().nullable().optional(),
});

// ── 完整报告数据 ──

export const ExportReportDataSchema = z.object({
  title: z.string(),
  generatedAt: z.string(),
  workflowExecutionId: z.string().uuid(),
  workflowName: z.string().nullable().optional(),
  versionCode: z.string().nullable().optional(),
  conclusion: ReportConclusionSchema.nullable().optional(),
  evidenceItems: z.array(ReportEvidenceItemSchema).optional(),
  debateRounds: z.array(ReportDebateRoundSchema).optional(),
  riskItems: z.array(ReportRiskItemSchema).optional(),
  paramSnapshot: z.record(z.unknown()).nullable().optional(),
});

// ── 导出任务状态 ──

export const ExportTaskStatusEnum = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

export const ExportTaskSchema = z.object({
  id: z.string().uuid(),
  workflowExecutionId: z.string().uuid(),
  format: ExportFormatEnum,
  status: ExportTaskStatusEnum,
  sections: z.array(ExportReportSectionEnum),
  reportData: ExportReportDataSchema.nullable().optional(),
  downloadUrl: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdByUserId: z.string(),
  createdAt: z.date().optional(),
  completedAt: z.date().nullable().optional(),
});

export const ExportTaskQuerySchema = z.object({
  workflowExecutionId: z.string().uuid().optional(),
  format: ExportFormatEnum.optional(),
  status: ExportTaskStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ExportTaskPageSchema = z.object({
  data: z.array(ExportTaskSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

// ── Types ──

export type ExportFormat = z.infer<typeof ExportFormatEnum>;
export type ExportReportSection = z.infer<typeof ExportReportSectionEnum>;
export type ExportDebateReportDto = z.infer<typeof ExportDebateReportSchema>;
export type ReportConclusionDto = z.infer<typeof ReportConclusionSchema>;
export type ReportEvidenceItemDto = z.infer<typeof ReportEvidenceItemSchema>;
export type ReportDebateRoundDto = z.infer<typeof ReportDebateRoundSchema>;
export type ReportRiskItemDto = z.infer<typeof ReportRiskItemSchema>;
export type ExportReportDataDto = z.infer<typeof ExportReportDataSchema>;
export type ExportTaskStatus = z.infer<typeof ExportTaskStatusEnum>;
export type ExportTaskDto = z.infer<typeof ExportTaskSchema>;
export type ExportTaskQueryDto = z.infer<typeof ExportTaskQuerySchema>;
export type ExportTaskPageDto = z.infer<typeof ExportTaskPageSchema>;

import { z } from 'zod';

export const AIProviderSchema = z.enum(['google', 'openai', 'anthropic', 'custom']);
export type AIProvider = z.infer<typeof AIProviderSchema>;

export const AIAuthTypeSchema = z.enum(['bearer', 'api-key', 'custom', 'none']);
export type AIAuthType = z.infer<typeof AIAuthTypeSchema>;

export const AIModelFetchModeSchema = z.enum(['official', 'manual', 'custom']);
export type AIModelFetchMode = z.infer<typeof AIModelFetchModeSchema>;

export const AIConfigSchema = z.object({
  id: z.string().optional(),
  configKey: z.string().min(1, "配置键不能为空"),
  provider: AIProviderSchema,
  modelName: z.string().min(1, "模型名称不能为空"),
  apiUrl: z.string().url().optional().or(z.literal('')),
  apiKey: z.string().optional(), // In transit, might be masked
  apiKeyEnvVar: z.string().optional(),
  authType: AIAuthTypeSchema.optional(),
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  pathOverrides: z.record(z.string()).optional(),
  modelFetchMode: AIModelFetchModeSchema.optional(),
  allowUrlProbe: z.boolean().optional(),
  allowCompatPathFallback: z.boolean().optional(),
  temperature: z.number().min(0).max(2).default(0.3),
  maxTokens: z.number().int().positive().default(8192),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(30000),
  maxRetries: z.number().int().min(0).default(3),
  availableModels: z.array(z.string()).default([]),
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

export const CreateAIConfigSchema = AIConfigSchema.omit({ id: true });
export type CreateAIConfigDto = z.infer<typeof CreateAIConfigSchema>;

export const UpdateAIConfigSchema = AIConfigSchema.partial().omit({ configKey: true });
export type UpdateAIConfigDto = z.infer<typeof UpdateAIConfigSchema>;

// API Response Types
export const AIConfigResponseSchema = AIConfigSchema.extend({
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export type AIConfigResponse = z.infer<typeof AIConfigResponseSchema>;

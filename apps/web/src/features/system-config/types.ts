import type { DictionaryDomain, DictionaryItem } from '@packages/types';
export interface BaseEntity {
    id: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface BusinessMappingRule extends BaseEntity {
    domain: string;
    matchMode: 'CONTAINS' | 'EXACT' | 'REGEX';
    pattern: string;
    targetValue: string;
    priority: number;
    description?: string;
    isActive: boolean;
}

export interface AIModelConfig extends BaseEntity {
    configKey: string;
    provider: string; // 'google' | 'openai'
    modelName: string;
    apiUrl?: string; // [NEW] Custom API URL
    apiKeyEnvVar?: string;
    apiKey?: string; // Optional (masked)
    authType?: 'bearer' | 'api-key' | 'custom' | 'none';
    headers?: Record<string, string> | string;
    queryParams?: Record<string, string> | string;
    pathOverrides?: Record<string, string> | string;
    modelFetchMode?: 'official' | 'manual' | 'custom';
    allowUrlProbe?: boolean;
    allowCompatPathFallback?: boolean;
    temperature: number;
    maxTokens: number;
    maxRetries: number;
    timeoutMs: number;
    isActive: boolean;
    isDefault: boolean;
    availableModels: string[];
}

export interface WorkflowAgentStrictModeSetting {
    enabled: boolean;
    source: 'DB' | 'ENV' | 'DEFAULT';
    updatedAt: string | null;
}

export interface CreateMappingRuleDTO extends Omit<BusinessMappingRule, 'id' | 'createdAt' | 'updatedAt'> { }
export interface UpdateMappingRuleDTO extends Partial<CreateMappingRuleDTO> { }
export interface CreateAIConfigDTO extends Omit<AIModelConfig, 'id' | 'createdAt' | 'updatedAt'> { }

export interface PromptTemplate extends BaseEntity {
    code: string;
    name: string;
    category: string;
    systemPrompt: string;
    userPrompt: string;
    version: number;
    isActive: boolean;
}

export interface CreatePromptDTO extends Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'isActive'> {
    isActive?: boolean;
}

export type DictionaryDomainModel = DictionaryDomain;
export type DictionaryItemModel = DictionaryItem;

export interface CreateDictionaryDomainDTO {
    code: string;
    name: string;
    description?: string | null;
    category?: string | null;
    usageHint?: string | null;
    usageLocations?: string[];
    isSystemDomain?: boolean;
    isActive?: boolean;
}

export interface UpdateDictionaryDomainDTO {
    name?: string;
    description?: string | null;
    category?: string | null;
    usageHint?: string | null;
    usageLocations?: string[];
    isSystemDomain?: boolean;
    isActive?: boolean;
}


export interface CreateDictionaryItemDTO {
    code: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
    parentCode?: string | null;
    meta?: unknown;
}

export interface UpdateDictionaryItemDTO {
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
    parentCode?: string | null;
    meta?: unknown;
}

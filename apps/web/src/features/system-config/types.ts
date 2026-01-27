
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
    temperature: number;
    maxTokens: number;
    maxRetries: number;
    timeoutMs: number;
    isActive: boolean;
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

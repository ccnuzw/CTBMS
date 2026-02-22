import { AgentRoleType } from '@packages/types';

export interface AgentPersona {
    key: string;
    name: string;
    description: string;
    icon: string; // Emoji character
    roleType: AgentRoleType;
    defaultConfig: {
        modelConfigKey?: string;
        temperature: number; // mapped to creativity level
        tools: string[];
        guardrails: {
            requireEvidence: boolean;
            noHallucination: boolean;
            blockPii: boolean;
            blockToxicity: boolean;
            blockCompetitors: boolean;
        };
        outputSchemaCode: string;
    };
}

export const AGENT_PERSONAS: AgentPersona[] = [
    {
        key: 'MARKET_ANALYST',
        name: '市场分析师 (Market Analyst)',
        description: '专注于从大量数据中提取关键信息，生成严谨的市场分析报告。',
        icon: '📊',
        roleType: 'ANALYST',
        defaultConfig: {
            modelConfigKey: 'deepseek-r1', // Assumption: this key exists or will be mapped
            temperature: 0.2, // Low creativity, high precision
            tools: ['search_web', 'database_query', 'read_file'],
            guardrails: {
                requireEvidence: true,
                noHallucination: true,
                blockPii: false,
                blockToxicity: true,
                blockCompetitors: false,
            },
            outputSchemaCode: 'MARKET_ANALYSIS_V1',
        },
    },
    {
        key: 'CREATIVE_ASSISTANT',
        name: '创意助手 (Creative Assistant)',
        description: '协助生成营销文案、活动策划等富有创意的多媒体内容。',
        icon: '🎨',
        roleType: 'SENTIMENT_ANALYST', // Using a close proxy if CREATIVE doesn't exist
        defaultConfig: {
            modelConfigKey: 'gpt-4o',
            temperature: 0.8, // High creativity
            tools: ['search_web'],
            guardrails: {
                requireEvidence: false,
                noHallucination: false, // Allow some hallucination/creativity
                blockPii: false,
                blockToxicity: true,
                blockCompetitors: false,
            },
            outputSchemaCode: 'agent_output_v1',
        },
    },
    {
        key: 'RISK_OFFICER',
        name: '风控合规官 (Risk Officer)',
        description: '严格审查内容合规性，识别潜在风险，确保业务安全。',
        icon: '🛡️',
        roleType: 'RISK_OFFICER',
        defaultConfig: {
            modelConfigKey: 'gpt-4-turbo',
            temperature: 0.1, // Very strict
            tools: ['database_query', 'knowledge_retrieval'],
            guardrails: {
                requireEvidence: true,
                noHallucination: true,
                blockPii: true, // Strict privacy
                blockToxicity: true,
                blockCompetitors: true,
            },
            outputSchemaCode: 'RISK_ASSESSMENT_V1',
        },
    },
    {
        key: 'CUSTOM',
        name: '自定义智能体 (Custom)',
        description: '从空白开始，完全自由地配置每一个参数。',
        icon: '🔧',
        roleType: 'ANALYST', // Default fallback
        defaultConfig: {
            temperature: 0.5,
            tools: [],
            guardrails: {
                requireEvidence: false,
                noHallucination: true,
                blockPii: false,
                blockToxicity: true,
                blockCompetitors: false,
            },
            outputSchemaCode: 'agent_output_v1',
        },
    },
];

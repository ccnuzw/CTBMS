import { Injectable } from '@nestjs/common';

export interface OutputSchemaDefinition {
    code: string;
    name: string;
    schema: Record<string, unknown>; // JSON Schema
    description?: string;
}

export interface OutputSchemaValidationResult {
    valid: boolean;
    errors: string[];
}

@Injectable()
export class OutputSchemaRegistryService {
    private schemas: Map<string, OutputSchemaDefinition> = new Map();

    constructor() {
        this.registerBuiltInSchemas();
    }

    private registerBuiltInSchemas() {
        // 1. Market Analysis Schema
        this.register({
            code: 'MARKET_ANALYSIS_V1',
            name: '市场分析报告',
            description: '标准的市场分析输出，包含观点、置信度、论据',
            schema: {
                type: 'object',
                properties: {
                    thesis: { type: 'string', description: '核心观点' },
                    confidence: { type: 'number', minimum: 0, maximum: 1, description: '置信度' },
                    evidence: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '支撑论据',
                    },
                    riskFactors: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '风险因素',
                    },
                },
                required: ['thesis', 'confidence', 'evidence'],
            },
        });

        // 2. Risk Assessment Schema
        this.register({
            code: 'RISK_ASSESSMENT_V1',
            name: '风险评估报告',
            schema: {
                type: 'object',
                properties: {
                    riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                    score: { type: 'number', minimum: 0, maximum: 100 },
                    details: { type: 'string' },
                    mitigationPlan: { type: 'string' },
                },
                required: ['riskLevel', 'score', 'mitigationPlan'],
            },
        });

        // 3. Trade Suggestion Schema
        this.register({
            code: 'TRADE_SUGGESTION_V1',
            name: '交易建议',
            schema: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
                    targetPrice: { type: 'number' },
                    stopLoss: { type: 'number' },
                    reasoning: { type: 'string' },
                },
                required: ['action', 'reasoning'],
            },
        });

        // Backward-compatible alias used by existing workflow tests/configs.
        this.register({
            code: 'AGENT_OUTPUT_V1',
            name: 'Agent 通用输出',
            description: '兼容旧配置的通用 Agent 输出结构',
            schema: {
                type: 'object',
                properties: {
                    thesis: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    evidence: { type: 'array', items: { type: 'string' } },
                },
                required: ['thesis', 'confidence', 'evidence'],
            },
        });
        this.register({
            code: 'agent_output_v1',
            name: 'Agent 通用输出(兼容别名)',
            description: '兼容历史小写编码',
            schema: {
                type: 'object',
                properties: {
                    thesis: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    evidence: { type: 'array', items: { type: 'string' } },
                },
                required: ['thesis', 'confidence', 'evidence'],
            },
        });
    }

    register(definition: OutputSchemaDefinition) {
        this.schemas.set(definition.code, definition);
    }

    getSchema(code: string): OutputSchemaDefinition | undefined {
        return this.schemas.get(code);
    }

    listSchemas(): OutputSchemaDefinition[] {
        return Array.from(this.schemas.values());
    }

    validateByCode(code: string, payload: unknown): OutputSchemaValidationResult {
        const schemaDef = this.getSchema(code);
        if (!schemaDef) {
            return { valid: false, errors: [`schema 未注册: ${code}`] };
        }
        return this.validateAgainstSchema(schemaDef.schema, payload, '$');
    }

    private validateAgainstSchema(
        schema: Record<string, unknown>,
        value: unknown,
        path: string,
    ): OutputSchemaValidationResult {
        const errors: string[] = [];
        this.validateNode(schema, value, path, errors);
        return {
            valid: errors.length === 0,
            errors,
        };
    }

    private validateNode(
        schema: Record<string, unknown>,
        value: unknown,
        path: string,
        errors: string[],
    ) {
        const expectedType = typeof schema.type === 'string' ? schema.type : undefined;
        if (expectedType) {
            if (!this.matchesType(expectedType, value)) {
                errors.push(`${path} 类型不匹配，期望 ${expectedType}`);
                return;
            }
        }

        if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => candidate === value)) {
            errors.push(`${path} 不在枚举允许值中`);
        }

        if (expectedType === 'number' && typeof value === 'number') {
            const minimum = typeof schema.minimum === 'number' ? schema.minimum : undefined;
            const maximum = typeof schema.maximum === 'number' ? schema.maximum : undefined;
            if (minimum !== undefined && value < minimum) {
                errors.push(`${path} 小于最小值 ${minimum}`);
            }
            if (maximum !== undefined && value > maximum) {
                errors.push(`${path} 大于最大值 ${maximum}`);
            }
        }

        if (expectedType === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
            const valueObj = value as Record<string, unknown>;
            const required = Array.isArray(schema.required)
                ? schema.required.filter((item): item is string => typeof item === 'string')
                : [];
            for (const requiredKey of required) {
                if (!(requiredKey in valueObj)) {
                    errors.push(`${path}.${requiredKey} 缺失`);
                }
            }

            const properties = this.readRecord(schema.properties);
            for (const [propKey, propSchema] of Object.entries(properties)) {
                if (!(propKey in valueObj)) {
                    continue;
                }
                this.validateNode(propSchema, valueObj[propKey], `${path}.${propKey}`, errors);
            }
        }

        if (expectedType === 'array' && Array.isArray(value)) {
            const itemSchema = this.readRecord(schema.items);
            if (Object.keys(itemSchema).length === 0) {
                return;
            }
            for (let index = 0; index < value.length; index += 1) {
                this.validateNode(itemSchema, value[index], `${path}[${index}]`, errors);
            }
        }
    }

    private matchesType(expectedType: string, value: unknown): boolean {
        switch (expectedType) {
            case 'object':
                return Boolean(value && typeof value === 'object' && !Array.isArray(value));
            case 'array':
                return Array.isArray(value);
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && Number.isFinite(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'null':
                return value === null;
            default:
                return true;
        }
    }

    private readRecord(value: unknown): Record<string, Record<string, unknown>> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        const result: Record<string, Record<string, unknown>> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
                continue;
            }
            result[key] = nested as Record<string, unknown>;
        }
        return result;
    }
}

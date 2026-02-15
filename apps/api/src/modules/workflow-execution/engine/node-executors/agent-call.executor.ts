import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { AIModelConfig, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma';
import { AIProviderFactory } from '../../../ai/providers/provider.factory';
import { AIRequestOptions } from '../../../ai/providers/base.provider';
import { OutputSchemaRegistryService } from '../../../agent-profile';
import { ConfigService } from '../../../config/config.service';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

/**
 * Agent 节点执行器
 *
 * 执行流程:
 * 1. 从 AgentProfile 获取配置（modelConfigKey, guardrails, timeoutMs）
 * 2. 从 AgentPromptTemplate 获取提示词模板
 * 3. 构建上下文（paramSnapshot + 上游节点输出 → 变量替换）
 * 4. 调用 AI 模块（复用 AIProviderFactory）
 * 5. 结构化解析输出、写入 NodeExecution.outputSnapshot
 */
@Injectable()
export class AgentCallNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'AgentCallNodeExecutor';
    private readonly logger = new Logger(AgentCallNodeExecutor.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiProviderFactory: AIProviderFactory,
        private readonly outputSchemaRegistryService: OutputSchemaRegistryService,
        private readonly configService: ConfigService,
    ) { }

    supports(node: WorkflowNode): boolean {
        return node.type === 'agent-call' || node.type === 'single-agent';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = context.node.config as Record<string, unknown>;
        const agentCode = this.resolveAgentCode(config);

        // 兼容旧 DSL：历史 single-agent 在部分流程中未配置 agentCode，
        // 旧行为等价于 passthrough，不应因类型规范化导致执行失败。
        if (!agentCode) {
            return {
                status: 'SUCCESS',
                output: {
                    ...context.input,
                    skipped: true,
                    skipReason: 'agentCode-missing',
                },
                message: '节点未配置 agentCode，按兼容模式跳过',
            };
        }

        // 1. 获取 AgentProfile
        const profile = await this.prisma.agentProfile.findFirst({
            where: {
                agentCode,
                isActive: true,
                OR: [{ ownerUserId: context.triggerUserId }, { templateSource: 'PUBLIC' }],
            },
        });
        if (!profile) {
            return {
                status: 'FAILED',
                output: {},
                message: `Agent 配置不存在或已禁用: ${agentCode}`,
            };
        }

        const promptAccessConditions: Prisma.AgentPromptTemplateWhereInput[] = [
            { ownerUserId: context.triggerUserId },
            { templateSource: 'PUBLIC' },
        ];
        if (profile.ownerUserId) {
            promptAccessConditions.push({ ownerUserId: profile.ownerUserId });
        }

        // 2. 获取 AgentPromptTemplate
        const promptTemplate = await this.prisma.agentPromptTemplate.findFirst({
            where: {
                promptCode: profile.agentPromptCode,
                isActive: true,
                OR: promptAccessConditions,
            },
        });
        if (!promptTemplate) {
            return {
                status: 'FAILED',
                output: {},
                message: `提示词模板不存在或已禁用: ${profile.agentPromptCode}`,
            };
        }

        // 3. 获取 AI 模型配置
        const modelConfig = await this.resolveModelConfig(String(profile.modelConfigKey ?? 'DEFAULT'));
        if (!modelConfig) {
            return {
                status: 'FAILED',
                output: {},
                message: `AI 模型配置不存在: ${profile.modelConfigKey}`,
            };
        }

        // 4. 构建提示词（变量替换）
        const variables = this.buildVariables(context, profile, config);
        const systemPrompt = promptTemplate.systemPrompt;
        const userPrompt = this.interpolateTemplate(promptTemplate.userPromptTemplate, variables);

        // 5. 构建 few-shot 示例
        const fewShotBlock = this.buildFewShotBlock(promptTemplate.fewShotExamples);
        const fullUserPrompt = fewShotBlock ? `${fewShotBlock}\n\n${userPrompt}` : userPrompt;

        // 6. 解析 AI 配置
        const apiKey = this.resolveApiKey(modelConfig);
        const apiUrl = modelConfig.apiUrl ?? undefined;
        const providerType = (modelConfig.provider as 'google' | 'openai') ?? 'google';

        this.logger.log(
            `执行 Agent[${agentCode}] 调用, model=${modelConfig.modelName}, provider=${providerType}`,
        );

        const requestOptions: AIRequestOptions = {
            modelName: modelConfig.modelName,
            apiKey,
            apiUrl: apiUrl ?? undefined,
            authType: (modelConfig.authType as AIRequestOptions['authType']) ?? undefined,
            headers: this.toRecord(modelConfig.headers),
            queryParams: this.toRecord(modelConfig.queryParams),
            pathOverrides: this.toRecord(modelConfig.pathOverrides),
            temperature: modelConfig.temperature,
            maxTokens: modelConfig.maxTokens,
            topP: modelConfig.topP ?? undefined,
            timeoutMs: profile.timeoutMs,
            maxRetries: modelConfig.maxRetries,
        };

        // 7. 调用 AI
        const startTime = Date.now();
        let rawResponse: string;
        try {
            const provider = this.aiProviderFactory.getProvider(providerType);
            rawResponse = await provider.generateResponse(systemPrompt, fullUserPrompt, requestOptions);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Agent[${agentCode}] 调用失败: ${errorMsg}`);

            // 重试策略
            const retryPolicy = profile.retryPolicy as Record<string, unknown> | null;
            const retryCount = (retryPolicy?.retryCount as number) ?? 0;
            if (retryCount > 0) {
                this.logger.log(`Agent[${agentCode}] 尝试重试 (max=${retryCount})`);
                const retryResult = await this.retryCall(
                    providerType,
                    systemPrompt,
                    fullUserPrompt,
                    requestOptions,
                    retryCount,
                    retryPolicy,
                );
                if (retryResult.success) {
                    rawResponse = retryResult.response!;
                } else {
                    return await this.buildInvocationFailureResult(
                        context,
                        agentCode,
                        errorMsg,
                        retryCount,
                    );
                }
            } else {
                return await this.buildInvocationFailureResult(context, agentCode, errorMsg);
            }
        }

        const durationMs = Date.now() - startTime;

        // 8. 解析输出
        const parsedOutput = this.parseOutput(rawResponse!, promptTemplate.outputFormat, agentCode);

        // 9. 应用 Guardrails（输出校验）
        const guardrails = profile.guardrails as Record<string, unknown> | null;
        const guardrailResult = this.applyGuardrails(parsedOutput, guardrails);
        const baseFieldResult = this.validateBaseOutputFields(parsedOutput, promptTemplate.outputFormat);
        const schemaResult = this.validateOutputSchema(
            parsedOutput,
            String(profile.outputSchemaCode ?? ''),
            promptTemplate.outputFormat,
        );
        const passed = guardrailResult.passed && baseFieldResult.passed && schemaResult.passed;
        const failedReason = [guardrailResult.message, baseFieldResult.message, schemaResult.message]
            .filter(Boolean)
            .join('; ');

        return {
            status: passed ? 'SUCCESS' : 'FAILED',
            output: {
                agentCode,
                roleType: profile.roleType,
                modelName: modelConfig.modelName,
                promptCode: profile.agentPromptCode,
                promptVersion: promptTemplate.version,
                agentVersion: profile.version,
                durationMs,
                outputFormat: promptTemplate.outputFormat,
                rawResponse: rawResponse!,
                parsed: parsedOutput,
                guardrailsPassed: guardrailResult.passed,
                guardrailsMessage: guardrailResult.message,
                baseFieldsPassed: baseFieldResult.passed,
                baseFieldsMessage: baseFieldResult.message,
                schemaValidationPassed: schemaResult.passed,
                schemaValidationMessage: schemaResult.message,
            },
            message: passed
                ? `Agent[${agentCode}] 执行成功 (${durationMs}ms)`
                : `Agent[${agentCode}] 输出校验失败: ${failedReason}`,
        };
    }

    // ────────────────── 私有方法 ──────────────────

    /**
     * 重试策略（含指数退避）
     */
    private async retryCall(
        providerType: 'google' | 'openai',
        systemPrompt: string,
        userPrompt: string,
        options: AIRequestOptions,
        retryCount: number,
        retryPolicy: Record<string, unknown> | null,
    ): Promise<{ success: boolean; response?: string }> {
        const backoffMs = (retryPolicy?.retryBackoffMs as number) ?? 2000;
        const provider = this.aiProviderFactory.getProvider(providerType);

        for (let attempt = 1; attempt <= retryCount; attempt++) {
            await this.sleep(backoffMs * attempt);
            try {
                const response = await provider.generateResponse(systemPrompt, userPrompt, options);
                return { success: true, response };
            } catch {
                if (attempt === retryCount) {
                    return { success: false };
                }
            }
        }
        return { success: false };
    }

    /**
     * 解析 API Key: config.apiKey > config.apiKeyEnvVar > 默认
     */
    private resolveApiKey(config: Record<string, unknown>): string {
        if (config.apiKey && typeof config.apiKey === 'string') return config.apiKey;
        if (config.apiKeyEnvVar && typeof config.apiKeyEnvVar === 'string') {
            const envValue = process.env[config.apiKeyEnvVar];
            if (envValue) return envValue;
        }
        return process.env.GEMINI_API_KEY ?? '';
    }

    private resolveAgentCode(config: Record<string, unknown>): string | undefined {
        const candidates = [config.agentCode, config.agentProfileCode];
        for (const candidate of candidates) {
            if (typeof candidate !== 'string') {
                continue;
            }
            const normalized = candidate.trim();
            if (normalized) {
                return normalized;
            }
        }
        return undefined;
    }

    private async resolveModelConfig(configKey: string): Promise<AIModelConfig | null> {
        const normalized = (configKey || 'DEFAULT').trim() || 'DEFAULT';
        const isDefaultAlias = normalized.toUpperCase() === 'DEFAULT';

        if (isDefaultAlias) {
            const dynamicDefault = await this.configService.getDefaultAIConfig();
            if (dynamicDefault?.isActive) {
                return dynamicDefault;
            }
        }

        const exactConfig = await this.prisma.aIModelConfig.findFirst({
            where: { configKey: normalized, isActive: true },
        });
        if (exactConfig) {
            return exactConfig;
        }

        if (!isDefaultAlias) {
            const dynamicDefault = await this.configService.getDefaultAIConfig();
            if (dynamicDefault?.isActive) {
                return dynamicDefault;
            }
        }

        return null;
    }

    private async buildInvocationFailureResult(
        context: NodeExecutionContext,
        agentCode: string,
        errorMsg: string,
        retryAttempts = 0,
    ): Promise<NodeExecutionResult> {
        const strictModeEnabled = await this.isWorkflowAgentStrictModeEnabled();

        if (this.isCredentialError(errorMsg) && !strictModeEnabled) {
            return {
                status: 'SUCCESS',
                output: {
                    ...context.input,
                    agentCode,
                    skipped: true,
                    degraded: true,
                    skipReason: 'agent-auth-invalid',
                    error: errorMsg,
                    retryAttempts,
                },
                message: `Agent[${agentCode}] 调用鉴权失败，已按降级策略跳过`,
            };
        }

        return {
            status: 'FAILED',
            output: retryAttempts > 0 ? { error: errorMsg, retryAttempts } : { error: errorMsg },
            message:
                retryAttempts > 0
                    ? `Agent[${agentCode}] 调用失败（已重试 ${retryAttempts} 次）: ${errorMsg}`
                    : `Agent[${agentCode}] 调用失败: ${errorMsg}`,
        };
    }

    private async isWorkflowAgentStrictModeEnabled(): Promise<boolean> {
        try {
            const setting = await this.configService.getWorkflowAgentStrictMode();
            return setting.enabled;
        } catch {
            const fallback = this.parseBooleanFlag(process.env.WORKFLOW_AGENT_STRICT_MODE);
            if (fallback !== null) {
                this.logger.warn('读取 workflow strict mode 配置失败，回退到环境变量');
                return fallback;
            }
            return false;
        }
    }

    private isCredentialError(errorMsg: string): boolean {
        const normalized = errorMsg.toLowerCase();
        return normalized.includes('api key not valid')
            || normalized.includes('api_key_invalid')
            || normalized.includes('invalid api key')
            || normalized.includes('incorrect api key')
            || normalized.includes('missing api key')
            || normalized.includes('invalid authentication');
    }

    private parseBooleanFlag(value: unknown): boolean | null {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value === 1) return true;
            if (value === 0) return false;
        }
        if (typeof value !== 'string') return null;
        const normalized = value.trim().toLowerCase();
        if (!normalized) return null;
        if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
        return null;
    }

    /**
     * 安全地将 JSON 字段转换为 Record<string, string>
     */
    private toRecord(value: unknown): Record<string, string> | undefined {
        if (!value || typeof value !== 'object') return undefined;
        return value as Record<string, string>;
    }

    /**
     * 构建变量映射（用于模板字符串替换）
     */
    private buildVariables(
        context: NodeExecutionContext,
        profile: Record<string, unknown>,
        config: Record<string, unknown>,
    ): Record<string, string> {
        const vars: Record<string, string> = {};

        // 上游节点输入
        vars['context'] = JSON.stringify(context.input ?? {});
        vars['input'] = vars['context'];
        for (const [key, value] of Object.entries(context.input)) {
            vars[`input.${key}`] = typeof value === 'string' ? value : JSON.stringify(value);
        }

        // 参数快照
        if (context.paramSnapshot) {
            vars['params'] = JSON.stringify(context.paramSnapshot);
            for (const [key, value] of Object.entries(context.paramSnapshot)) {
                vars[`params.${key}`] = typeof value === 'string' ? value : JSON.stringify(value);
            }
        }

        // Agent 配置中的自定义变量
        const customVars = config.variables as Record<string, unknown> | undefined;
        if (customVars) {
            for (const [key, value] of Object.entries(customVars)) {
                vars[key] = typeof value === 'string' ? value : JSON.stringify(value);
            }
        }

        // 元数据
        vars['agent.code'] = String(profile.agentCode ?? '');
        vars['agent.roleType'] = String(profile.roleType ?? '');
        vars['execution.id'] = context.executionId;
        vars['trigger.userId'] = context.triggerUserId;
        vars['timestamp'] = new Date().toISOString();

        return vars;
    }

    /**
     * 模板字符串替换 {{variable}}
     */
    private interpolateTemplate(template: string, variables: Record<string, string>): string {
        return template.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
            const trimmedKey = key.trim();
            return variables[trimmedKey] ?? match;
        });
    }

    /**
     * 构建 few-shot 示例块
     */
    private buildFewShotBlock(examples: unknown): string {
        if (!examples || !Array.isArray(examples) || examples.length === 0) {
            return '';
        }

        const blocks = examples.map((example, idx) => {
            if (typeof example === 'object' && example !== null) {
                const ex = example as Record<string, unknown>;
                const input = ex.input ? `输入: ${JSON.stringify(ex.input)}` : '';
                const output = ex.output ? `输出: ${JSON.stringify(ex.output)}` : '';
                return `### 示例 ${idx + 1}\n${input}\n${output}`;
            }
            return `### 示例 ${idx + 1}\n${JSON.stringify(example)}`;
        });

        return `## 参考示例\n${blocks.join('\n\n')}`;
    }

    /**
     * 解析 AI 输出
     */
    private parseOutput(
        raw: string,
        outputFormat: string,
        agentCode: string,
    ): Record<string, unknown> {
        if (outputFormat === 'json') {
            try {
                // 尝试提取 JSON 块（兼容 markdown code block）
                const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
                const jsonStr = jsonMatch ? jsonMatch[1] : this.extractFirstJsonObject(raw) ?? raw;
                const parsed = JSON.parse(jsonStr.trim());
                return typeof parsed === 'object' && parsed !== null ? parsed : { result: parsed };
            } catch {
                this.logger.warn(`Agent[${agentCode}] JSON 解析失败，返回原始文本`);
                return { rawText: raw, parseError: true };
            }
        }

        // markdown / text / csv 直接返回原文
        return { content: raw, format: outputFormat };
    }

    private extractFirstJsonObject(raw: string): string | null {
        const start = raw.indexOf('{');
        if (start < 0) {
            return null;
        }
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < raw.length; i += 1) {
            const ch = raw[i];
            if (inString) {
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                    continue;
                }
                if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === '{') {
                depth += 1;
                continue;
            }
            if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    return raw.slice(start, i + 1);
                }
            }
        }
        return null;
    }

    /**
     * 应用 Guardrails 输出校验
     */
    private applyGuardrails(
        output: Record<string, unknown>,
        guardrails: Record<string, unknown> | null,
    ): { passed: boolean; message?: string } {
        if (!guardrails || Object.keys(guardrails).length === 0) {
            return { passed: true };
        }

        // 检查必填字段
        const requiredFields = guardrails.requiredFields as string[] | undefined;
        if (requiredFields && Array.isArray(requiredFields)) {
            for (const field of requiredFields) {
                if (output[field] === undefined || output[field] === null) {
                    return { passed: false, message: `缺少必填输出字段: ${field}` };
                }
            }
        }

        // 检查置信度阈值
        const minConfidence = guardrails.minConfidence as number | undefined;
        if (minConfidence !== undefined) {
            const confidence = output.confidence as number | undefined;
            if (confidence !== undefined && confidence < minConfidence) {
                return { passed: false, message: `置信度 ${confidence} 低于阈值 ${minConfidence}` };
            }
        }

        // 检查禁止词
        const forbiddenPatterns = guardrails.forbiddenPatterns as string[] | undefined;
        if (forbiddenPatterns && Array.isArray(forbiddenPatterns)) {
            const outputStr = JSON.stringify(output);
            for (const pattern of forbiddenPatterns) {
                if (outputStr.includes(pattern)) {
                    return { passed: false, message: `输出包含禁止内容: ${pattern}` };
                }
            }
        }

        return { passed: true };
    }

    private validateBaseOutputFields(
        output: Record<string, unknown>,
        outputFormat: string,
    ): { passed: boolean; message?: string } {
        if (outputFormat !== 'json') {
            return { passed: false, message: 'Agent 输出必须为 JSON 结构化格式' };
        }
        const thesis = output.thesis;
        const confidence = output.confidence;
        const evidence = output.evidence;
        if (typeof thesis !== 'string' || !thesis.trim()) {
            return { passed: false, message: '缺少基础字段 thesis' };
        }
        if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
            return { passed: false, message: '缺少基础字段 confidence 或类型错误' };
        }
        if (!Array.isArray(evidence)) {
            return { passed: false, message: '缺少基础字段 evidence[] 或类型错误' };
        }
        return { passed: true };
    }

    private validateOutputSchema(
        output: Record<string, unknown>,
        outputSchemaCode: string,
        outputFormat: string,
    ): { passed: boolean; message?: string } {
        if (outputFormat !== 'json') {
            return { passed: false, message: 'outputFormat 非 json，不符合结构化输出约束' };
        }
        if (!outputSchemaCode.trim()) {
            return { passed: false, message: '未配置 outputSchemaCode' };
        }
        const result = this.outputSchemaRegistryService.validateByCode(outputSchemaCode, output);
        if (!result.valid) {
            return { passed: false, message: result.errors.join(' | ') };
        }
        return { passed: true };
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}

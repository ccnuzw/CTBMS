
import { Logger } from '@nestjs/common';
import { IAIProvider, AIRequestOptions } from './base.provider';

export class Sub2ApiProvider implements IAIProvider {
    private readonly logger = new Logger(Sub2ApiProvider.name);

    private buildHeaders(options: AIRequestOptions): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (options.apiKey) {
            // Default to Bearer, but allow overrides via options
            if (options.authType === 'api-key') {
                headers['api-key'] = options.apiKey;
            } else {
                // Default to Bearer for sub2api (compatible with OpenAI)
                headers['Authorization'] = `Bearer ${options.apiKey}`;
            }
        }
        return headers;
    }

    private getEndpoint(options: AIRequestOptions, type: 'chat' | 'models'): string {
        const baseUrl = (options.apiUrl || 'https://sub2api.526566.xyz').replace(/\/+$/, '');

        // Wire API: responses (Codex protocol)
        const wireApi = options.wireApi || 'chat'; // default to chat if not specified? or rely on user config

        if (type === 'models') {
            // Models endpoint seems standard /v1/models based on probes
            if (baseUrl.endsWith('/v1')) return `${baseUrl}/models`;
            return `${baseUrl}/v1/models`;
        }

        if (type === 'chat') {
            // [IMPORTANT] Specialized handling for 'responses' protocol
            if (wireApi === 'responses') {
                // Usually /v1/responses or /responses
                // Based on probes, /v1/responses gives 503 (exists), /responses gives 503 (exists)
                // We'll try /v1/responses first as it's more standard for v1 prefix users
                if (baseUrl.endsWith('/v1')) return `${baseUrl}/responses`;
                return `${baseUrl}/v1/responses`;
            }

            // Default OpenAI-compatible chat
            if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`;
            return `${baseUrl}/v1/chat/completions`;
        }

        throw new Error(`Unknown endpoint type: ${type}`);
    }

    async generateResponse(
        systemPrompt: string,
        userPrompt: string,
        options: AIRequestOptions,
    ): Promise<string> {
        const url = this.getEndpoint(options, 'chat');
        const headers = this.buildHeaders(options);

        const wireApi = options.wireApi || 'chat';

        let body: Record<string, unknown>;

        if (wireApi === 'responses') {
            // Codex / Responses Protocol
            body = {
                model: options.modelName,
                prompt: userPrompt, // Responses API uses 'prompt' usually, not messages? Or maybe messages.
                // Based on Codex API:
                // It often accepts 'prompt' for completion-style or 'messages' for chat-style wrapped in response object
                // Research says "responses" API is for newer Codex.
                // Let's support both but default to 'prompt' if it's strictly code completion, 
                // OR 'messages' if it's chat. 
                // Given the valid 'messages' usage in user examples for sub2api, let's try 'messages' first if available.
                // But standard OpenAI "completions" use 'prompt'.
                // "Responses" API might use 'messages'.
                // Let's assume standard OpenAI Chat structure but sent to /responses endpoint with extra fields.
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                model_reasoning_effort: 'high', // Hardcoded high for now or configurable?
                disable_response_storage: true, // From user config example
                max_tokens: options.maxTokens,
                temperature: options.temperature,
                top_p: options.topP,
            };
        } else {
            // Standard OpenAI
            body = {
                model: options.modelName,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: options.maxTokens,
                temperature: options.temperature,
                top_p: options.topP,
            };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Sub2API Error (${response.status}): ${errorText}`);
            }

            const data = await response.json() as { output?: Array<{ content?: string }>, choices?: Array<{ message?: { content?: string } }> };

            if (wireApi === 'responses') {
                // Parse 'Response' object
                // content might be in data.output[0].content or something similar
                // OpenAI Response object: output: [{ content: "..." }]
                if (data.output && Array.isArray(data.output) && data.output.length > 0) {
                    return data.output[0].content || '';
                }
                // Fallback: check standard choices
                if (data.choices && data.choices.length > 0) {
                    return data.choices[0].message?.content || '';
                }
                return JSON.stringify(data); // Fallback for debugging
            }

            // Standard
            return data.choices?.[0]?.message?.content || '';

        } catch (error) {
            this.logger.error('Sub2API generation failed', error);
            throw error;
        }
    }

    async testConnection(options: AIRequestOptions): Promise<{
        success: boolean;
        message: string;
        modelId: string;
        response?: string;
        error?: string;
        authMode?: string;
        pathUsed?: string;
    }> {
        const wireApi = options.wireApi || 'chat';
        const url = this.getEndpoint(options, 'chat');

        try {
            const headers = this.buildHeaders(options);
            const body = wireApi === 'responses' ? {
                model: options.modelName,
                messages: [{ role: 'user', content: 'Hello' }],
                model_reasoning_effort: 'high',
                disable_response_storage: true,
                max_tokens: 10
            } : {
                model: options.modelName,
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
            };

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();

                // Special handling for known 503 from sub2api
                if (response.status === 503 && errorText.includes('No available accounts')) {
                    return {
                        success: false,
                        message: `Sub2API 服务端资源耗尽 (503): ${errorText}`,
                        modelId: options.modelName,
                        error: errorText,
                        pathUsed: url
                    };
                }

                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json() as { output?: Array<{ content?: string }>, choices?: Array<{ message?: { content?: string } }> };
            let content = '';

            if (wireApi === 'responses') {
                if (data.output && data.output[0]) content = data.output[0].content || '';
                else if (data.choices && data.choices[0]) content = data.choices[0].message?.content || '';
            } else {
                content = data.choices?.[0]?.message?.content || '';
            }

            return {
                success: true,
                message: 'Sub2API 连接成功',
                modelId: options.modelName,
                response: content || 'OK',
                pathUsed: url
            };

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `Sub2API 连接失败: ${msg}`,
                modelId: options.modelName,
                error: msg,
                pathUsed: url
            };
        }
    }

    async getModels(options: AIRequestOptions): Promise<{ models: string[]; activeUrl?: string }> {
        // Use standard models endpoint usually
        const url = this.getEndpoint(options, 'models');
        try {
            const headers = this.buildHeaders(options);
            const response = await fetch(url, { headers });
            if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

            const data = await response.json() as { data?: Array<{ id: string }> };
            const models = (data.data || []).map((m) => m.id).sort();

            return { models, activeUrl: url };
        } catch (error) {
            this.logger.error('Sub2API getModels failed', error);
            throw error;
        }
    }
}

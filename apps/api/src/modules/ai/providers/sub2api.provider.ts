import { Logger } from '@nestjs/common';
import { IAIProvider, AIRequestOptions, AIMessage, AIChatResponse } from './base.provider';

type Sub2ApiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type Sub2ApiChatResponse = {
  output?: Array<{ content?: string | null; tool_calls?: Sub2ApiToolCall[] }>;
  choices?: Array<{ message?: { content?: string | null; tool_calls?: Sub2ApiToolCall[] } }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export class Sub2ApiProvider implements IAIProvider {
  private readonly logger = new Logger(Sub2ApiProvider.name);

  private isRetriableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503;
  }

  private isRetriableErrorMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('fetch failed') ||
      normalized.includes('econnreset') ||
      normalized.includes('etimedout') ||
      normalized.includes('socket hang up') ||
      normalized.includes('ssl') ||
      normalized.includes('tls')
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse the response body, handling the case where the server returns an
   * SSE stream (text/event-stream) even though we set `stream: false`.
   *
   * Sub2API occasionally does this for long prompts; we extract the first
   * JSON payload from the "data:" lines rather than crashing on `response.json()`.
   */
  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';

    // Fast path: normal JSON response
    if (!contentType.includes('text/event-stream')) {
      // Double-check: sometimes content-type lies; peek the first bytes
      const text = await response.text();
      if (!text.startsWith('event:') && !text.startsWith('data:')) {
        return JSON.parse(text);
      }
      // Falls through to SSE parsing below
      return this.extractJsonFromSse(text);
    }

    // SSE stream response
    const text = await response.text();
    return this.extractJsonFromSse(text);
  }

  /**
   * Extract the final complete JSON object from an SSE text stream.
   * Looks for `data: {...}` payloads and returns the last valid one,
   * which is typically the complete response.
   */
  private extractJsonFromSse(text: string): unknown {
    this.logger.warn(
      `[Sub2API] Received SSE stream despite stream=false, attempting extraction (${text.length} chars)`,
    );

    const dataLines = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== '[DONE]');

    // Try to find a complete JSON object (last data line is usually the full response)
    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(dataLines[i]);
        if (parsed && typeof parsed === 'object') {
          this.logger.log(`[Sub2API] Successfully extracted JSON from SSE data line ${i + 1}/${dataLines.length}`);
          return parsed;
        }
      } catch {
        // Not valid JSON, try previous line
      }
    }

    // If no individual line is valid JSON, try concatenating all content from streaming chunks
    // (some SSE streams send partial content in delta format)
    const chunks: string[] = [];
    for (const line of dataLines) {
      try {
        const parsed = JSON.parse(line);
        // Responses API streaming format
        const content =
          parsed?.output_text ||
          parsed?.delta?.content ||
          parsed?.choices?.[0]?.delta?.content;
        if (content) chunks.push(content);
      } catch {
        // skip
      }
    }

    if (chunks.length > 0) {
      const fullContent = chunks.join('');
      this.logger.log(`[Sub2API] Assembled ${chunks.length} SSE chunks into ${fullContent.length} chars`);
      // Return a synthetic Responses-style object
      return { output_text: fullContent };
    }

    throw new Error(
      `Received SSE stream response but could not extract valid JSON (${dataLines.length} data lines, ${text.length} total chars)`,
    );
  }

  /**
   * Normalise the base URL so that endpoint helpers always receive a clean root.
   *
   * Rules (derived from sub2api gateway behaviour):
   * 1. Strip trailing slashes.
   * 2. Strip known endpoint path suffixes so that users can paste any URL they
   *    copied from their browser (e.g. ".../v1/chat/completions").
   * 3. Preserve an explicit "/v1" suffix when present – the endpoint builder
   *    relies on it.
   */
  private normalizeBaseUrl(apiUrl?: string): string {
    let baseUrl = (apiUrl || 'https://sub2api.526566.xyz').replace(/\/+$/, '');

    // Strip endpoint suffixes users may have pasted by accident.
    baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
    baseUrl = baseUrl.replace(/\/completions$/, '');
    baseUrl = baseUrl.replace(/\/responses(?:\/compact)?$/, '');
    baseUrl = baseUrl.replace(/\/models$/, '');

    return baseUrl;
  }

  /**
   * Ensure the base URL ends with exactly "/v1".
   * If the URL already ends with /v1 we return it as-is; otherwise we append.
   */
  private ensureV1Suffix(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (trimmed.endsWith('/v1')) return trimmed;
    // Avoid double-appending for URLs that have /v1 in a sub-path already
    // e.g. "https://example.com/api/v1" → keep as-is
    return `${trimmed}/v1`;
  }

  private buildHeaders(options: AIRequestOptions): Record<string, string> {
    const authType = options.authType === 'custom' ? 'bearer' : options.authType || 'bearer';
    return this.buildHeadersForAuthMode(options, authType);
  }

  private buildHeadersForAuthMode(
    options: AIRequestOptions,
    authMode: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (!options.apiKey || authMode === 'none') {
      return headers;
    }

    if (authMode === 'api-key' && !headers['api-key']) {
      headers['api-key'] = options.apiKey;
    }

    if (authMode === 'x-api-key' && !headers['x-api-key']) {
      headers['x-api-key'] = options.apiKey;
    }

    if (authMode === 'bearer' && !headers.Authorization) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }

    return headers;
  }

  private resolveAuthModes(
    options: AIRequestOptions,
  ): Array<'bearer' | 'x-api-key' | 'api-key' | 'none'> {
    if (options.authType === 'bearer') return ['bearer', 'x-api-key', 'api-key'];
    if (options.authType === 'api-key') return ['api-key', 'x-api-key', 'bearer'];
    if (options.authType === 'none') return ['none'];
    return ['bearer', 'x-api-key', 'api-key'];
  }

  /**
   * Build the endpoint URL for a given operation.
   *
   * Sub2API's primary endpoints (from source):
   * - POST /v1/responses         (OpenAI Responses API – the default)
   * - POST /v1/chat/completions  (OpenAI Chat Completions – fallback)
   * - GET  /v1/models            (Model listing)
   */
  private getEndpoint(
    options: AIRequestOptions,
    type: 'chat' | 'responses' | 'models',
  ): string {
    const baseUrl = this.normalizeBaseUrl(options.apiUrl);
    const v1Base = this.ensureV1Suffix(baseUrl);

    if (type === 'models') {
      return `${v1Base}/models`;
    }

    if (type === 'responses') {
      return `${v1Base}/responses`;
    }

    // type === 'chat'
    return `${v1Base}/chat/completions`;
  }

  /**
   * Resolve which wire API endpoint to use first: "responses" or "chat".
   * Default for sub2api is "responses" (its main protocol since the upgrade).
   */
  private resolveWireApi(options: AIRequestOptions): 'responses' | 'chat' {
    const explicit = options.wireApi?.trim();
    if (explicit === 'chat') return 'chat';
    // Default to responses – this matches sub2api's primary /v1/responses endpoint.
    return 'responses';
  }

  /**
   * Convert ChatCompletions-style messages into Responses API `input` format.
   * Reference: sub2api openai_codex_transform.go → toResponsesInput equivalent.
   */
  private toResponsesInput(messages: Array<{ role: string; content: string }>) {
    return messages.map((m) => ({
      role: m.role,
      content: [{ type: 'input_text', text: m.content }],
    }));
  }

  /**
   * Normalise ChatCompletions-style tools to Responses API flat format.
   *
   * ChatCompletions: { type: "function", function: { name, description, parameters } }
   * Responses:       { type: "function", name, description, parameters }
   *
   * Reference: sub2api normalizeCodexTools().
   */
  private normalizeToolsForResponses(
    tools?: AIRequestOptions['tools'],
  ): Array<Record<string, unknown>> | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool) => {
      const flatTool: Record<string, unknown> = { type: 'function' };

      // Already in Responses style (has top-level `name`)? Keep as-is.
      if ('name' in tool && typeof (tool as Record<string, unknown>).name === 'string') {
        return tool as unknown as Record<string, unknown>;
      }

      // ChatCompletions style → flatten
      if (tool.function) {
        flatTool.name = tool.function.name;
        if (tool.function.description) {
          flatTool.description = tool.function.description;
        }
        if (tool.function.parameters) {
          flatTool.parameters = tool.function.parameters;
        }
      }

      return flatTool;
    });
  }

  private extractResponsesContent(data: unknown): string {
    if (!data || typeof data !== 'object') return '';
    const typed = data as {
      output_text?: string;
      output?: Array<{
        content?: string | Array<{ type?: string; text?: string }>;
      }>;
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (typed.output_text && typed.output_text.length > 0) {
      return typed.output_text;
    }

    const chunks: string[] = [];
    for (const item of typed.output || []) {
      if (typeof item.content === 'string') {
        chunks.push(item.content);
        continue;
      }
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part && typeof part.text === 'string' && part.text.length > 0) {
            chunks.push(part.text);
          }
        }
      }
    }

    if (chunks.length > 0) {
      return chunks.join('\n');
    }

    return typed.choices?.[0]?.message?.content || '';
  }

  private extractResponsesErrorMessage(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const typed = data as Record<string, unknown>;
    const error = typed.error as unknown;

    if (typeof error === 'string' && error.trim().length > 0) return error;
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim().length > 0) return message;
    }

    const message = typed.message;
    if (typeof message === 'string' && message.trim().length > 0) return message;

    const detail = typed.detail;
    if (typeof detail === 'string' && detail.trim().length > 0) return detail;

    return undefined;
  }

  private summarizeResponseShape(data: unknown): string {
    if (!data || typeof data !== 'object') return String(data);
    const typed = data as Record<string, unknown>;
    const keys = Object.keys(typed);
    const outputTypes = Array.isArray(typed.output)
      ? typed.output
          .map((item) => {
            if (!item || typeof item !== 'object') return '';
            return (item as Record<string, unknown>).type as string;
          })
          .filter((value) => typeof value === 'string' && value.length > 0)
      : [];
    return `keys=[${keys.join(',')}], outputTypes=[${outputTypes.join(',')}]`;
  }

  /**
   * Extract tool_calls from Responses API output.
   * Responses API returns tool calls as output items with type "function_call".
   */
  private extractResponsesToolCalls(data: unknown): Sub2ApiToolCall[] | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const typed = data as {
      output?: Array<{
        type?: string;
        id?: string;
        call_id?: string;
        name?: string;
        arguments?: string;
        tool_calls?: Sub2ApiToolCall[];
        content?: Array<Record<string, unknown>>;
      }>;
    };

    if (!typed.output) return undefined;

    const toolCalls: Sub2ApiToolCall[] = [];

    const pushToolCall = (item: Record<string, unknown>, fallbackIndex: number) => {
      const name =
        (item.name as string | undefined) ||
        (item.tool_name as string | undefined) ||
        (item.function && typeof item.function === 'object'
          ? (item.function as Record<string, unknown>).name
          : undefined);
      if (typeof name !== 'string' || name.length === 0) return;

      const rawArgs =
        (item.arguments as unknown) ??
        (item.tool_arguments as unknown) ??
        (item.function && typeof item.function === 'object'
          ? (item.function as Record<string, unknown>).arguments
          : undefined);

      let args = '{}';
      if (typeof rawArgs === 'string') {
        args = rawArgs;
      } else if (rawArgs && typeof rawArgs === 'object') {
        try {
          args = JSON.stringify(rawArgs);
        } catch {
          args = '{}';
        }
      }

      const id =
        (item.call_id as string | undefined) ||
        (item.id as string | undefined) ||
        `call_${toolCalls.length || fallbackIndex}`;

      toolCalls.push({
        id,
        type: 'function',
        function: {
          name,
          arguments: args,
        },
      });
    };

    for (const item of typed.output) {
      // Direct tool_calls on output items
      if (item.tool_calls) {
        toolCalls.push(...item.tool_calls);
        continue;
      }
      // Responses API function_call output items
      if ((item.type === 'function_call' || item.type === 'tool_call') && item.name) {
        pushToolCall(item as unknown as Record<string, unknown>, toolCalls.length);
        continue;
      }

      // Some gateways wrap tool calls inside message content parts
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (!part || typeof part !== 'object') continue;
          const partRecord = part as Record<string, unknown>;
          if (Array.isArray(partRecord.tool_calls)) {
            toolCalls.push(...(partRecord.tool_calls as Sub2ApiToolCall[]));
            continue;
          }
          const partType = partRecord.type;
          if (partType === 'function_call' || partType === 'tool_call') {
            pushToolCall(partRecord, toolCalls.length);
          }
        }
      }
    }

    return toolCalls.length > 0 ? toolCalls : undefined;
  }

  /**
   * Parse HTTP status from an error message prefix like "HTTP 429: ..."
   */
  private parseStatus(message: string): number | undefined {
    const match = message.match(/^(?:HTTP\s+)?(\d{3})\b/);
    return match ? Number(match[1]) : undefined;
  }

  /**
   * Send a request to the Responses API endpoint.
   */
  private async callResponses(
    options: AIRequestOptions,
    body: Record<string, unknown>,
    retries: number = 2,
    authMode?: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Promise<{ data: unknown; url: string }> {
    const url = this.getEndpoint(options, 'responses');
    const headers = authMode
      ? this.buildHeadersForAuthMode(options, authMode)
      : this.buildHeaders(options);

    let lastError = '';
    for (let attempt = 0; attempt <= retries; attempt++) {
      const timeoutMs = (options.timeoutSeconds ?? 120) * 1000;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `HTTP ${response.status}: ${errorText}`;

          if (response.status === 503 && errorText.includes('No available accounts')) {
            throw new Error(lastError);
          }

          if (attempt < retries && this.isRetriableStatus(response.status)) {
            await this.sleep(350 * (attempt + 1));
            continue;
          }
          throw new Error(lastError);
        }

        const data = await this.parseResponseBody(response);
        return { data, url };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < retries && this.isRetriableErrorMessage(lastError)) {
          await this.sleep(350 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
    throw new Error(lastError || 'Responses call failed');
  }

  /**
   * Send a request to the Chat Completions endpoint.
   */
  private async callChatCompletions(
    options: AIRequestOptions,
    body: Record<string, unknown>,
    retries: number = 2,
    authMode?: 'bearer' | 'api-key' | 'x-api-key' | 'none',
  ): Promise<{ data: unknown; url: string }> {
    const url = this.getEndpoint(options, 'chat');
    const headers = authMode
      ? this.buildHeadersForAuthMode(options, authMode)
      : this.buildHeaders(options);

    let lastError = '';
    for (let attempt = 0; attempt <= retries; attempt++) {
      const timeoutMs = (options.timeoutSeconds ?? 120) * 1000;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `HTTP ${response.status}: ${errorText}`;

          if (attempt < retries && this.isRetriableStatus(response.status)) {
            await this.sleep(350 * (attempt + 1));
            continue;
          }
          throw new Error(lastError);
        }

        const data = await this.parseResponseBody(response);
        return { data, url };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < retries && this.isRetriableErrorMessage(lastError)) {
          await this.sleep(350 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
    throw new Error(lastError || 'Chat completions call failed');
  }

  /**
   * Attempt the primary protocol, then fall back to the alternative if we get
   * 400/404/405 (indicating the endpoint is not supported).
   */
  private async callWithFallback(
    options: AIRequestOptions,
    responsesBody: Record<string, unknown>,
    chatBody: Record<string, unknown>,
  ): Promise<{ data: unknown; url: string; wireApi: 'responses' | 'chat' }> {
    const wireApi = this.resolveWireApi(options);
    const retries = Math.max(0, options.maxRetries ?? 2);
    const authModes = this.resolveAuthModes(options);
    let lastError: Error | undefined;

    const shouldFallback = (msg: string) => {
      const status = this.parseStatus(msg);
      if (status === 400 || status === 404 || status === 405) return true;
      if (status === 500 || status === 502 || status === 503 || status === 504) return true;
      const normalized = msg.toLowerCase();
      return normalized.includes('<!doctype html') || normalized.includes('<html');
    };

    for (const authMode of authModes) {
      try {
        if (wireApi === 'responses') {
          try {
            const result = await this.callResponses(options, responsesBody, retries, authMode);
            return { ...result, wireApi: 'responses' };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            if (shouldFallback(msg)) {
              this.logger.warn(
                `Sub2API responses endpoint failed (${msg}), falling back to chat/completions`,
              );
              try {
                const result = await this.callChatCompletions(options, chatBody, retries, authMode);
                return { ...result, wireApi: 'chat' };
              } catch (fallbackError) {
                throw error;
              }
            }
            throw error;
          }
        }

        // wireApi === 'chat'
        try {
          const result = await this.callChatCompletions(options, chatBody, retries, authMode);
          return { ...result, wireApi: 'chat' };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (shouldFallback(msg)) {
            this.logger.warn(
              `Sub2API chat/completions endpoint failed (${msg}), falling back to responses`,
            );
            try {
              const result = await this.callResponses(options, responsesBody, retries, authMode);
              return { ...result, wireApi: 'responses' };
            } catch (fallbackError) {
              throw error;
            }
          }
          throw error;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const status = this.parseStatus(msg);
        lastError = error instanceof Error ? error : new Error(msg);
        if ((status === 401 || status === 403) && authModes.length > 1) {
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('Sub2API call failed');
  }

  async generateResponse(
    systemPrompt: string,
    userPrompt: string,
    options: AIRequestOptions,
  ): Promise<string> {
    const responsesBody: Record<string, unknown> = {
      model: options.modelName,
      input: this.toResponsesInput([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]),
      max_output_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      stream: false,
    };

    const chatBody: Record<string, unknown> = {
      model: options.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
    };

    try {
      const wireApi = this.resolveWireApi(options);
      const endpoint = this.getEndpoint(options, wireApi === 'responses' ? 'responses' : 'chat');

      this.logger.log(
        `[Sub2API] generateResponse: wireApi=${wireApi}, endpoint=${endpoint}, ` +
        `model=${options.modelName}, maxTokens=${options.maxTokens}, ` +
        `temperature=${options.temperature}, topP=${options.topP}, ` +
        `systemPromptLen=${systemPrompt.length}, userPromptLen=${userPrompt.length}`,
      );

      if (wireApi === 'responses') {
        this.logger.debug(
          `[Sub2API] Responses body (without input text): ${JSON.stringify({
            ...responsesBody,
            input: `[${(responsesBody.input as unknown[]).length} messages]`,
          })}`,
        );
      } else {
        this.logger.debug(
          `[Sub2API] Chat body (without message text): ${JSON.stringify({
            ...chatBody,
            messages: `[${(chatBody.messages as unknown[]).length} messages]`,
          })}`,
        );
      }

      const { data, wireApi: usedWireApi } = await this.callWithFallback(options, responsesBody, chatBody);

      if (usedWireApi === 'responses') {
        return this.extractResponsesContent(data);
      }

      const typed = data as { choices?: Array<{ message?: { content?: string } }> };
      return typed.choices?.[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('Sub2API generation failed', error);
      throw error;
    }
  }

  async generateChat(messages: AIMessage[], options: AIRequestOptions): Promise<AIChatResponse> {
    // Build OpenAI Chat Completions format messages
    const openAiMessages = messages.map((msg) => {
      const baseMsg: Record<string, unknown> = {
        role: msg.role,
        content: msg.content || '',
      };

      if (msg.role === 'tool') {
        baseMsg.tool_call_id = msg.tool_call_id || '';
      } else if (msg.role === 'assistant') {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          baseMsg.tool_calls = msg.tool_calls;
          if (!msg.content) {
            baseMsg.content = null;
          }
        }
      } else if (msg.role === 'user' && msg.name) {
        baseMsg.name = msg.name;
      }

      return baseMsg;
    });

    // Chat Completions body (tools stay in ChatCompletions format)
    const chatBody: Record<string, unknown> = {
      model: options.modelName,
      messages: openAiMessages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 8192,
      top_p: options.topP,
      tools: options.tools,
    };

    // Responses body (tools must be flattened)
    const responsesMessages = messages
      .filter((m) => m.role === 'system' || m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content || '' }));
    const responsesBody: Record<string, unknown> = {
      model: options.modelName,
      input: this.toResponsesInput(responsesMessages),
      max_output_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
      top_p: options.topP,
      stream: false,
      tools: this.normalizeToolsForResponses(options.tools),
    };

    try {
      const { data, wireApi: usedWireApi } = await this.callWithFallback(
        options,
        responsesBody,
        chatBody,
      );

      if (usedWireApi === 'responses') {
        const content = this.extractResponsesContent(data) || null;
        const toolCalls = this.extractResponsesToolCalls(data);
        if (!content && (!toolCalls || toolCalls.length === 0)) {
          const errorMessage =
            this.extractResponsesErrorMessage(data) ||
            `Empty Sub2API responses payload (${this.summarizeResponseShape(data)})`;
          this.logger.warn(`[Sub2API] ${errorMessage}`);
          throw new Error(errorMessage);
        }
        return {
          content,
          tool_calls: toolCalls,
        };
      }

      // ChatCompletions format
      const typed = data as Sub2ApiChatResponse;
      const choiceMessage = typed.choices?.[0]?.message;
      const content = choiceMessage?.content || null;
      const toolCalls = choiceMessage?.tool_calls;
      if (!content && (!toolCalls || toolCalls.length === 0)) {
        const errorMessage =
          this.extractResponsesErrorMessage(data) ||
          `Empty Sub2API chat payload (${this.summarizeResponseShape(data)})`;
        this.logger.warn(`[Sub2API] ${errorMessage}`);
        throw new Error(errorMessage);
      }
      return {
        content,
        tool_calls: toolCalls,
        usage: typed.usage
          ? {
            prompt_tokens: typed.usage.prompt_tokens,
            completion_tokens: typed.usage.completion_tokens,
            total_tokens: typed.usage.total_tokens,
          }
          : undefined,
      };
    } catch (error) {
      this.logger.error('Sub2API generateChat failed', error);
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
    const responsesBody: Record<string, unknown> = {
      model: options.modelName,
      input: this.toResponsesInput([{ role: 'user', content: 'Hello' }]),
      max_output_tokens: 10,
      stream: false,
    };

    const chatBody: Record<string, unknown> = {
      model: options.modelName,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 10,
    };

    try {
      const { data, url, wireApi: usedWireApi } = await this.callWithFallback(
        options,
        responsesBody,
        chatBody,
      );

      const content =
        usedWireApi === 'responses'
          ? this.extractResponsesContent(data)
          : (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
            ?.message?.content || '';

      return {
        success: true,
        message: `Sub2API 连接成功 (${usedWireApi})`,
        modelId: options.modelName,
        response: content || 'OK',
        pathUsed: url,
      };
    } catch (error) {
      const lastErrorMessage = error instanceof Error ? error.message : String(error);

      // Provide user-friendly message for known sub2api errors
      if (lastErrorMessage.includes('No available accounts')) {
        return {
          success: false,
          message: `Sub2API 服务端资源耗尽 (503)`,
          modelId: options.modelName,
          error: lastErrorMessage,
        };
      }

      return {
        success: false,
        message: `Sub2API 连接失败: ${lastErrorMessage}`,
        modelId: options.modelName,
        error: lastErrorMessage,
      };
    }
  }

  async getModels(options: AIRequestOptions): Promise<{ models: string[]; activeUrl?: string }> {
    const url = this.getEndpoint(options, 'models');
    try {
      const headers = this.buildHeaders(options);
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);

      const data = (await response.json()) as { data?: Array<{ id: string }> };
      const models = (data.data || []).map((m) => m.id).sort();

      return { models, activeUrl: this.normalizeBaseUrl(options.apiUrl) };
    } catch (error) {
      this.logger.error('Sub2API getModels failed', error);
      throw error;
    }
  }

  async rerank(
    query: string,
    documents: string[],
    options: AIRequestOptions,
  ): Promise<{ index: number; score: number }[]> {
    const baseUrl = (options.apiUrl || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/rerank`;

    try {
      const headers = this.buildHeaders(options);
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options.modelName,
          query: query,
          texts: documents,
          top_n: documents.length,
          return_documents: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Rerank Error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        results?: Array<{ index: number; relevance_score: number }>;
      };

      if (!data.results) {
        return [];
      }

      return data.results.map((r) => ({
        index: r.index,
        score: r.relevance_score,
      }));
    } catch (error) {
      this.logger.error('Rerank API call failed', error);
      return [];
    }
  }
}

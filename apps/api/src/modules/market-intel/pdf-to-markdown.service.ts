import { Injectable, Logger } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service';
import { AIService } from '../ai/ai.service';
import { ConfigService } from '../config/config.service';
import { AIProviderFactory } from '../ai/providers/provider.factory';

@Injectable()
export class PdfToMarkdownService {
    private readonly logger = new Logger(PdfToMarkdownService.name);

    constructor(
        private readonly documentParserService: DocumentParserService,
        private readonly aiService: AIService,
        private readonly configService: ConfigService,
        private readonly aiProviderFactory: AIProviderFactory,
    ) { }

    async convertToMarkdown(buffer: Buffer, mimeType: string): Promise<string> {
        // 1. 解析原始文档
        const parseResult = await this.documentParserService.parse(buffer, mimeType);

        // 如果提取内容为空，直接返回空串
        if (!parseResult.text || parseResult.text.trim().length === 0) {
            this.logger.warn('Document parsing returned empty text.');
            return '';
        }

        // 2. 如果文件太小（例如少于 200 字），直接返回原文，不浪费 Token
        if (parseResult.text.length < 200) {
            return parseResult.text;
        }

        // 3. 构建 Prompt 调用 LLM
        const prompt = `
You are an expert document formatter. Your task is to convert the following raw text extracted from a PDF/Word document into clean, well-structured Markdown.

**Rules:**
1. **Preserve Content**: Do not summarize or delete important information. Keep the full fidelity of the original text.
2. **Structure**: Use appropriate Markdown headers (#, ##, ###) to represent the document structure.
3. **Tables**: Format any tabular data into Markdown tables.
4. **Lists**: Use bullet points or numbered lists where appropriate.
5. **Clean Up**: Remove page numbers, headers, footers, and artifact characters usually found in PDF extracts.
6. **No Comments**: Output ONLY the Markdown content. Do not add "Here is the markdown..." or similar conversational fillers.

**Raw Text:**
${parseResult.text.slice(0, 15000)}
`;

        try {
            return await this.callLLMDirectly(prompt);
        } catch (error) {
            this.logger.error('Failed to convert to Markdown via LLM', error);
            // Fallback: return raw text
            return parseResult.text;
        }
    }

    private async callLLMDirectly(prompt: string): Promise<string> {
        const aiConfig = await this.configService.getDefaultAIConfig();
        const providerType = (aiConfig?.provider || 'google') as 'google' | 'openai' | 'sub2api'; // Cast to any to avoid strict union check if types don't match perfectly

        const provider = this.aiProviderFactory.getProvider(providerType);

        const options = {
            modelName: aiConfig?.modelName || 'gemini-pro',
            apiKey: aiConfig?.apiKey || process.env.GEMINI_API_KEY || '',
            apiUrl: aiConfig?.apiUrl || undefined,
            authType: aiConfig?.authType as 'api-key' | 'bearer',
            headers: aiConfig?.headers as Record<string, string>,
            maxTokens: 4000
        };

        // System Prompt: You are a helpful assistant.
        const systemPrompt = "You are a helpful assistant that converts raw text to Markdown.";

        const result = await provider.generateResponse(systemPrompt, prompt, options);
        return result || '';
    }
}

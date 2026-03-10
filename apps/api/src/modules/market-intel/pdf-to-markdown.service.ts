import { Injectable, Logger } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service';
import { AIService } from '../ai/ai.service';

@Injectable()
export class PdfToMarkdownService {
    private readonly logger = new Logger(PdfToMarkdownService.name);

    /** 每块最大字符数 — 控制输出规模，避免代理超时 */
    private readonly CHUNK_SIZE = 3000;

    constructor(
        private readonly documentParserService: DocumentParserService,
        private readonly aiService: AIService,
    ) { }

    async convertToMarkdown(buffer: Buffer, mimeType: string): Promise<string> {
        // 1. 解析原始文档
        const parseResult = await this.documentParserService.parse(buffer, mimeType);

        this.logger.log(
            `[PDF→MD] 文档解析完成: textLength=${parseResult.text?.length || 0}, ` +
            `pages=${parseResult.pageCount || 'N/A'}`,
        );

        if (!parseResult.text || parseResult.text.trim().length === 0) {
            this.logger.warn('[PDF→MD] 文档解析返回空文本');
            return '';
        }

        if (parseResult.text.length < 200) {
            return parseResult.text;
        }

        // 2. 分块 + 并行处理
        //    原因: PDF→MD 的输出量 ≈ 输入量，7K输入 → 7K+输出 → 生成耗时超过代理超时
        //    AI分析成功是因为输出仅 1-2K，生成快
        const fullText = parseResult.text.slice(0, 30000);
        const chunks = this.splitIntoChunks(fullText, this.CHUNK_SIZE);

        this.logger.log(
            `[PDF→MD] 分块并行处理: 总长度=${fullText.length}, 分块数=${chunks.length}`,
        );

        const markdownParts = await Promise.all(
            chunks.map(async (chunk, i) => {
                this.logger.log(`[PDF→MD] 并行处理第 ${i + 1}/${chunks.length} 块 (${chunk.length} 字符)...`);
                try {
                    const result = await this.convertChunk(chunk, i + 1, chunks.length);
                    this.logger.log(`[PDF→MD] 第 ${i + 1} 块完成 (${result.length} 字符)`);
                    return result;
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    this.logger.error(`[PDF→MD] 第 ${i + 1} 块失败: ${errMsg}`);
                    return chunk;
                }
            }),
        );

        const finalResult = markdownParts.join('\n\n');
        this.logger.log(`[PDF→MD] 全部完成: ${finalResult.length} 字符`);
        return finalResult;
    }

    private async convertChunk(text: string, index: number, total: number): Promise<string> {
        const systemPrompt =
            'You are a helpful assistant that converts raw text to clean, well-structured Markdown.';

        const contextHint = total > 1
            ? `\nThis is part ${index} of ${total}. Format as Markdown without adding overall document headers.`
            : '';

        const userPrompt = `Convert this text to Markdown.${contextHint}

Rules: Preserve content, use headers/tables/lists, remove page artifacts, output ONLY Markdown.

Text:
${text}`;

        return await this.aiService.chat(systemPrompt, userPrompt);
    }

    private splitIntoChunks(text: string, maxSize: number): string[] {
        if (text.length <= maxSize) return [text];

        const chunks: string[] = [];
        let remaining = text;

        while (remaining.length > 0) {
            if (remaining.length <= maxSize) {
                chunks.push(remaining);
                break;
            }
            let splitAt = remaining.lastIndexOf('\n\n', maxSize);
            if (splitAt <= 0) splitAt = remaining.lastIndexOf('\n', maxSize);
            if (splitAt <= 0) splitAt = maxSize;

            chunks.push(remaining.slice(0, splitAt).trim());
            remaining = remaining.slice(splitAt).trim();
        }
        return chunks.filter((c) => c.length > 0);
    }
}

import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseLib = require('pdf-parse');
const pdfParse = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

/**
 * 文档解析结果
 */
export interface ParseResult {
    text: string;                    // 提取的纯文本
    tables?: TableData[];            // 提取的表格
    metadata?: DocumentMetadata;     // 文档元信息
    pageCount?: number;              // 页数（PDF）
}

/**
 * 表格数据
 */
export interface TableData {
    name?: string;                   // 表格名称（Excel Sheet名）
    headers: string[];               // 表头
    rows: string[][];                // 行数据
}

/**
 * 文档元信息
 */
export interface DocumentMetadata {
    title?: string;
    author?: string;
    createdAt?: Date;
    modifiedAt?: Date;
}

@Injectable()
export class DocumentParserService {
    private readonly logger = new Logger(DocumentParserService.name);

    /**
     * 根据 MIME 类型解析文档
     */
    async parse(buffer: Buffer, mimeType: string): Promise<ParseResult> {
        this.logger.log(`Parsing document with mimeType: ${mimeType}`);

        switch (mimeType) {
            case 'application/pdf':
                return this.parsePdf(buffer);

            case 'application/msword':
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                return this.parseWord(buffer);

            case 'application/vnd.ms-excel':
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                return this.parseExcel(buffer);

            case 'text/plain':
                return this.parseText(buffer);

            default:
                this.logger.warn(`Unsupported mimeType: ${mimeType}, returning empty result`);
                return { text: '' };
        }
    }

    /**
     * 解析 PDF 文档
     */
    private async parsePdf(buffer: Buffer): Promise<ParseResult> {
        try {
            const data = await pdfParse(buffer);

            return {
                text: data.text,
                pageCount: data.numpages,
                metadata: {
                    title: data.info?.Title,
                    author: data.info?.Author,
                    createdAt: data.info?.CreationDate ? new Date(data.info.CreationDate) : undefined,
                },
            };
        } catch (error) {
            this.logger.error('Failed to parse PDF', error);
            throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }

    /**
     * 解析 Word 文档 (.docx)
     */
    private async parseWord(buffer: Buffer): Promise<ParseResult> {
        try {
            // mammoth 提取纯文本
            const result = await mammoth.extractRawText({ buffer });

            return {
                text: result.value,
            };
        } catch (error) {
            this.logger.error('Failed to parse Word document', error);
            throw new Error(`Word 解析失败: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }

    /**
     * 解析 Excel 文档
     */
    private async parseExcel(buffer: Buffer): Promise<ParseResult> {
        try {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const tables: TableData[] = [];
            const textParts: string[] = [];

            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const jsonData: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (jsonData.length === 0) continue;

                // 第一行作为表头
                const headers = (jsonData[0] || []).map(h => String(h || ''));
                const rows = jsonData.slice(1).map(row =>
                    row.map(cell => String(cell ?? ''))
                );

                tables.push({
                    name: sheetName,
                    headers,
                    rows,
                });

                // 转换为文本格式（便于 AI 分析）
                textParts.push(`## ${sheetName}\n`);
                if (headers.length > 0) {
                    textParts.push(headers.join(' | '));
                    textParts.push('-'.repeat(40));
                }
                rows.forEach(row => {
                    textParts.push(row.join(' | '));
                });
                textParts.push('');
            }

            return {
                text: textParts.join('\n'),
                tables,
            };
        } catch (error) {
            this.logger.error('Failed to parse Excel document', error);
            throw new Error(`Excel 解析失败: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }

    /**
     * 解析纯文本
     */
    private parseText(buffer: Buffer): ParseResult {
        return {
            text: buffer.toString('utf-8'),
        };
    }

    /**
     * 从解析结果中提取价格关键信息（辅助方法）
     */
    extractPricePatterns(text: string): { location: string; price: number; unit: string }[] {
        const patterns: { location: string; price: number; unit: string }[] = [];

        // 匹配类似 "锦州港：2820元/吨" 或 "锦州港 2820 元/吨" 的模式
        const regex = /([^\d\s:：,，。]+)[：:\s]+(\d+(?:\.\d+)?)\s*元\/吨/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            patterns.push({
                location: match[1].trim(),
                price: parseFloat(match[2]),
                unit: '元/吨',
            });
        }

        return patterns;
    }
}

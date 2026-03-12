import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Query,
    UseInterceptors,
    UploadedFile,
    Res,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { IntelCrudService } from '../intel-crud.service';
import { IntelAnalysisService } from '../intel-analysis.service';
import { IntelAttachmentService } from '../intel-attachment.service';
import { DocumentParserService } from '../document-parser.service';
import { PdfToMarkdownService } from '../pdf-to-markdown.service';
import { KnowledgeExtractionService } from '../../knowledge/services/knowledge-extraction.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { AnalyzeContentRequest } from '../dto';
import {
    ContentType,
    IntelCategory,
    IntelSourceType,
} from '@packages/types';

@Controller('market-intel')
export class IntelDocumentController {
    private readonly logger = new Logger(IntelDocumentController.name);

    constructor(
        private readonly intelCrudService: IntelCrudService,
        private readonly intelAnalysisService: IntelAnalysisService,
        private readonly intelAttachmentService: IntelAttachmentService,
        private readonly documentParserService: DocumentParserService,
        private readonly pdfToMarkdownService: PdfToMarkdownService,
        private readonly knowledgeExtractionService: KnowledgeExtractionService,
        private readonly knowledgeService: KnowledgeService,
    ) { }

    @Post('actions/parse-document')
    @UseInterceptors(FileInterceptor('file'))
    async parseDocument(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

        const markdownContent = await this.pdfToMarkdownService.convertToMarkdown(
            file.buffer,
            file.mimetype,
        );

        return {
            success: true,
            content: markdownContent,
            filename: file.originalname,
        };
    }

    @Post('actions/analyze')
    async analyze(@Body() dto: AnalyzeContentRequest) {
        return this.intelAnalysisService.analyze(
            dto.content as string,
            dto.category as IntelCategory,
            dto.location,
            dto.base64Image,
            dto.mimeType,
            dto.contentType,
        );
    }

    @Post('actions/generate-insight')
    async generateInsight(@Body() dto: { content: string }) {
        return { summary: await this.intelAnalysisService.generateInsight(dto.content) };
    }

    @Get('actions/test-ai')
    async testAI() {
        return this.intelAnalysisService.testAI();
    }

    @Post('actions/upload')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: 20 * 1024 * 1024 },
            fileFilter: (_req, file, callback) => {
                const allowedMimes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'image/jpeg',
                    'image/png',
                    'image/webp',
                    'text/plain',
                ];
                if (allowedMimes.includes(file.mimetype)) {
                    callback(null, true);
                } else {
                    callback(new BadRequestException('Unsupported file type'), false);
                }
            },
        }),
    )
    async uploadDocument(
        @UploadedFile() file: Express.Multer.File,
        @Body()
        body: {
            sourceType?: string;
            contentType?: string;
            location?: string;
            skipKnowledgeSync?: string | boolean;
        },
    ) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const { sourceType, contentType, location } = body;
        const authorId = 'system-user-placeholder';

        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

        let markdownContent = '';
        try {
            markdownContent = await this.pdfToMarkdownService.convertToMarkdown(
                file.buffer,
                file.mimetype,
            );
        } catch (error) {
            this.logger.error('Failed to convert to Markdown:', error);
        }

        const rawContent = markdownContent || `[文档上传] ${file.originalname}`;

        const inputContentType = (contentType as ContentType) || ContentType.DAILY_REPORT;
        let mappedCategory = IntelCategory.C_DOCUMENT;
        if (inputContentType === ContentType.DAILY_REPORT) {
            mappedCategory = IntelCategory.B_SEMI_STRUCTURED;
        }

        const resolvedSourceType = Object.values(IntelSourceType).includes(
            sourceType as IntelSourceType,
        )
            ? (sourceType as IntelSourceType)
            : IntelSourceType.OFFICIAL;

        // 3. Create MarketIntel record
        // Always skip inline knowledge sync — we handle it asynchronously below
        // to avoid blocking the HTTP response with expensive LLM + RAG operations.
        const intel = await this.intelCrudService.create(
            {
                category: mappedCategory,
                contentType: inputContentType,
                sourceType: resolvedSourceType,
                rawContent,
                effectiveTime: new Date(),
                location: location || '未指定',
                region: [],
                gpsVerified: false,
                completenessScore: markdownContent ? 70 : 50,
                scarcityScore: 50,
                validationScore: 0,
                totalScore: markdownContent ? 60 : 50,
                isFlagged: false,
            },
            authorId,
            true, // skipSync — async processing below
        );

        const attachment = await this.intelAttachmentService.saveFile(
            {
                buffer: file.buffer,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
            },
            intel.id,
            markdownContent,
        );

        // 4. Async post-processing: knowledge graph extraction + knowledge sync
        // Runs after the HTTP response is sent so the user doesn't wait.
        if (markdownContent && markdownContent.length > 50) {
            const intelId = intel.id;
            const content = markdownContent;
            setImmediate(async () => {
                // 4a. Knowledge Graph Extraction (LLM-based)
                try {
                    await this.knowledgeExtractionService.processIntel(intelId, content);
                    this.logger.log(`[Async] Knowledge graph extraction completed for Intel ID: ${intelId}`);
                } catch (err) {
                    this.logger.error(`[Async] Knowledge graph extraction failed for Intel ID: ${intelId}`, err);
                }

                // 4b. Knowledge Sync + RAG Vectorization
                try {
                    await this.knowledgeService.syncFromMarketIntel(intelId);
                    this.logger.log(`[Async] Knowledge sync completed for Intel ID: ${intelId}`);
                } catch (err) {
                    this.logger.error(`[Async] Knowledge sync failed for Intel ID: ${intelId}`, err);
                }
            });
        }

        return {
            success: true,
            intel,
            attachment: {
                id: attachment.id,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                fileSize: attachment.fileSize,
                storagePath: attachment.storagePath,
            },
            message: markdownContent
                ? `Document uploaded and converted to Markdown (${markdownContent.length} chars)`
                : 'Document uploaded',
        };
    }

    @Get('attachments/search')
    async searchAttachments(@Query('keyword') keyword: string, @Query('limit') limit = '20') {
        return this.intelAttachmentService.searchByOcrText(keyword, parseInt(limit, 10));
    }

    @Delete('attachments/:id')
    async removeAttachment(@Param('id') id: string) {
        return this.intelAttachmentService.remove(id);
    }

    @Get('attachments/:id/download')
    async downloadAttachment(
        @Param('id') id: string,
        @Query('inline') inline: string,
        @Res() res: Response,
    ) {
        const attachment = await this.intelAttachmentService.findOne(id);

        const disposition = inline === 'true' ? 'inline' : 'attachment';

        if (inline === 'true') {
            res.setHeader('Content-Type', attachment.mimeType);
            res.setHeader(
                'Content-Disposition',
                `${disposition}; filename="${encodeURIComponent(attachment.filename)}"`,
            );
            return res.sendFile(attachment.storagePath);
        }

        return res.download(attachment.storagePath, attachment.filename, (err) => {
            if (err) {
                this.logger.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).send('Download failed');
                }
            }
        });
    }

    @Get(':id/attachments')
    async getAttachments(@Param('id') intelId: string) {
        return this.intelAttachmentService.findByIntel(intelId);
    }
}

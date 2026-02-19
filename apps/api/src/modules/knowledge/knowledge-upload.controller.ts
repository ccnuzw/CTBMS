
import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RagPipelineService } from './rag/rag-pipeline.service';
import * as pdf from 'pdf-parse';

@Controller('knowledge')
export class KnowledgeUploadController {
    constructor(private readonly ragService: RagPipelineService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        let text = '';
        const fileId = `${Date.now()}_${file.originalname}`;

        if (file.mimetype === 'application/pdf') {
            const data = await pdf(file.buffer);
            text = data.text;
        } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown' || file.originalname.endsWith('.md')) {
            text = file.buffer.toString('utf-8');
        } else {
            // Fallback for others or throw
            throw new BadRequestException('Unsupported file type. Only .pdf, .txt, .md supported for MVP.');
        }

        if (!text.trim()) {
            throw new BadRequestException('File is empty or text could not be extracted');
        }

        const result = await this.ragService.ingest(fileId, text);

        return {
            id: fileId,
            filename: file.originalname,
            chunks: result.chunks,
            message: 'File uploaded and indexed successfully'
        };
    }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CreateIntelAttachmentDto } from '@packages/types';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class IntelAttachmentService {
    constructor(private prisma: PrismaService) { }

    // 上传目录（本地存储）
    private readonly uploadDir = process.env.UPLOAD_DIR || './uploads';

    /**
     * 创建附件记录
     */
    async create(dto: CreateIntelAttachmentDto) {
        return this.prisma.intelAttachment.create({
            data: {
                filename: dto.filename,
                mimeType: dto.mimeType,
                fileSize: dto.fileSize,
                storagePath: dto.storagePath,
                ocrText: dto.ocrText,
                intelId: dto.intelId,
            },
        });
    }

    /**
     * 保存文件到本地并创建记录
     */
    async saveFile(
        file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
        intelId: string,
        ocrText?: string,
    ) {
        // 确保上传目录存在
        const uploadPath = path.resolve(this.uploadDir);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        // 生成唯一文件名
        const ext = path.extname(file.originalname);
        const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
        const storagePath = path.join(uploadPath, filename);

        // 写入文件
        fs.writeFileSync(storagePath, file.buffer);

        // 创建数据库记录
        return this.create({
            filename: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            storagePath: storagePath,
            ocrText,
            intelId,
        });
    }

    /**
     * 获取情报的所有附件
     */
    async findByIntel(intelId: string) {
        return this.prisma.intelAttachment.findMany({
            where: { intelId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * 获取单个附件
     */
    async findOne(id: string) {
        const attachment = await this.prisma.intelAttachment.findUnique({ where: { id } });
        if (!attachment) {
            throw new NotFoundException(`附件 ID ${id} 不存在`);
        }
        return attachment;
    }

    /**
     * 删除附件（同时删除文件）
     */
    async remove(id: string) {
        const attachment = await this.findOne(id);

        // 删除物理文件
        if (fs.existsSync(attachment.storagePath)) {
            fs.unlinkSync(attachment.storagePath);
        }

        // 删除数据库记录
        await this.prisma.intelAttachment.delete({ where: { id } });
        return { success: true };
    }

    /**
     * 全文搜索附件（基于 OCR 文本）
     */
    async searchByOcrText(keyword: string, limit = 20) {
        return this.prisma.intelAttachment.findMany({
            where: {
                ocrText: {
                    contains: keyword,
                    mode: 'insensitive',
                },
            },
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                intel: {
                    select: { id: true, category: true, location: true },
                },
            },
        });
    }
}

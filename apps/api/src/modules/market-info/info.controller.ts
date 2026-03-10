import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { InfoService } from './info.service';
import { CreateInfoRequest, UpdateInfoRequest } from './dto';
import { Response } from 'express';
import { setDeprecationHeaders } from '../../common/utils/deprecation';

// 配置文件存储
const storage = diskStorage({
    destination: './uploads',
    filename: (req, file, callback) => {
        const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
        callback(null, uniqueName);
    },
});

@Controller('market/info')
export class InfoController {
    constructor(private readonly infoService: InfoService) { }

    @Post()
    create(@Body() dto: CreateInfoRequest, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, '/v1/market-info-items');
        }
        // Mock authorId for now since Auth guard might not be fully wired
        const authorId = '325d3140-5e3e-4d43-9828-56747b0a3311'; // Placeholder
        return this.infoService.create({ ...dto, authorId });
    }

    @Get()
    findAll(@Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, '/v1/market-info-items');
        }
        return this.infoService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, `/v1/market-info-items/${id}`);
        }
        return this.infoService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateInfoRequest,
        @Res({ passthrough: true }) res?: Response,
    ) {
        if (res) {
            setDeprecationHeaders(res, `/v1/market-info-items/${id}`);
        }
        return this.infoService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, `/v1/market-info-items/${id}`);
        }
        return this.infoService.remove(id);
    }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file', { storage }))
    uploadFile(@UploadedFile() file: Express.Multer.File, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, '/v1/market-info-items/actions/upload');
        }
        const fileUrl = `http://localhost:3000/uploads/${file.filename}`;

        return {
            uid: file.filename,
            name: file.originalname,
            status: 'done',
            url: fileUrl,
            thumbUrl: fileUrl,
            size: file.size,
            type: file.mimetype,
        };
    }
}

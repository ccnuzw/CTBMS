import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Query,
} from '@nestjs/common';
import { CollectionPointService } from './collection-point.service';
import {
    CreateCollectionPointDto,
    UpdateCollectionPointDto,
} from './dto';
import { CollectionPointQuery, CollectionPointType } from '@packages/types';

@Controller('collection-points')
export class CollectionPointController {
    constructor(private readonly service: CollectionPointService) { }

    /**
     * 创建采集点
     */
    @Post()
    create(@Body() dto: CreateCollectionPointDto) {
        return this.service.create(dto);
    }

    /**
     * 分页查询采集点
     */
    @Get()
    findAll(@Query() query: Record<string, string | string[] | undefined>) {
        const parseBoolean = (value: string | string[] | undefined) => {
            if (value === undefined) return undefined;
            const raw = Array.isArray(value) ? value[0] : value;
            if (raw === undefined) return undefined;
            const normalized = String(raw).toLowerCase();
            if (['true', '1', 'yes'].includes(normalized)) return true;
            if (['false', '0', 'no'].includes(normalized)) return false;
            return undefined;
        };

        const parseNumber = (value: string | string[] | undefined, fallback: number, min = 1, max?: number) => {
            const raw = Array.isArray(value) ? value[0] : value;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) return fallback;
            const clamped = Math.max(min, parsed);
            if (max !== undefined) return Math.min(max, clamped);
            return clamped;
        };

        const parseStringArray = (value: string | string[] | undefined) => {
            if (value === undefined) return undefined;
            if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
            return value.split(',').map((item) => item.trim()).filter(Boolean);
        };

        const types = parseStringArray(query.types) as CollectionPointType[] | undefined;
        const keywordRaw = Array.isArray(query.keyword) ? query.keyword[0] : query.keyword;
        const keyword = keywordRaw?.trim() || undefined;

        const parsed: CollectionPointQuery = {
            type: (Array.isArray(query.type) ? query.type[0] : query.type) as CollectionPointType | undefined,
            types,
            regionCode: Array.isArray(query.regionCode) ? query.regionCode[0] : query.regionCode,
            keyword,
            isActive: parseBoolean(query.isActive),
            allocationStatus: (Array.isArray(query.allocationStatus) ? query.allocationStatus[0] : query.allocationStatus) as
                | 'ALLOCATED'
                | 'UNALLOCATED'
                | undefined,
            page: parseNumber(query.page, 1, 1),
            pageSize: parseNumber(query.pageSize, 20, 1, 1000),
        };

        return this.service.findAll(parsed);
    }

    /**
     * 获取类型统计
     */
    @Get('stats/by-type')
    getStatsByType() {
        return this.service.getStatsByType();
    }

    /**
     * 获取用于 AI 识别的采集点列表
     */
    @Get('for-recognition')
    getForRecognition() {
        return this.service.getForRecognition();
    }

    /**
     * 获取单个采集点
     */
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    /**
     * 更新采集点
     */
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateCollectionPointDto) {
        return this.service.update(id, dto);
    }

    /**
     * 删除采集点
     */
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }

    /**
     * 批量导入
     */
    @Post('batch-import')
    batchImport(@Body() body: { points: CreateCollectionPointDto[] }) {
        return this.service.batchImport(body.points);
    }
}

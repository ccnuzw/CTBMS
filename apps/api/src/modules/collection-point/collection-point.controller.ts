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
    CollectionPointQueryDto,
} from './dto';

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
    findAll(@Query() query: CollectionPointQueryDto) {
        return this.service.findAll(query);
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

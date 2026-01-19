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
import { RegionService } from './region.service';
import { CreateRegionDto, UpdateRegionDto, RegionQueryDto } from './dto';
import { RegionLevel } from '@packages/types';

@Controller('regions')
export class RegionController {
    constructor(private readonly service: RegionService) { }

    /**
     * 创建行政区划
     */
    @Post()
    create(@Body() dto: CreateRegionDto) {
        return this.service.create(dto);
    }

    /**
     * 查询行政区划列表
     */
    @Get()
    findAll(@Query() query: RegionQueryDto) {
        return this.service.findAll(query);
    }

    /**
     * 获取行政区划树
     */
    @Get('tree')
    getTree(@Query('rootLevel') rootLevel?: RegionLevel) {
        return this.service.getTree(rootLevel);
    }

    /**
     * 获取层级统计
     */
    @Get('stats/by-level')
    getStatsByLevel() {
        return this.service.getStatsByLevel();
    }

    /**
     * 获取省份列表
     */
    @Get('provinces')
    getProvinces() {
        return this.service.getProvinces();
    }

    /**
     * 获取城市列表
     */
    @Get('provinces/:provinceCode/cities')
    getCities(@Param('provinceCode') provinceCode: string) {
        return this.service.getCities(provinceCode);
    }

    /**
     * 获取区县列表
     */
    @Get('cities/:cityCode/districts')
    getDistricts(@Param('cityCode') cityCode: string) {
        return this.service.getDistricts(cityCode);
    }

    /**
     * 根据代码获取
     */
    @Get('code/:code')
    findByCode(@Param('code') code: string) {
        return this.service.findByCode(code);
    }

    /**
     * 获取单个行政区划
     */
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    /**
     * 更新行政区划
     */
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateRegionDto) {
        return this.service.update(id, dto);
    }

    /**
     * 删除行政区划
     */
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}

import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    ParseUUIDPipe,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationRequest, UpdateOrganizationRequest } from './dto';

@Controller('organizations')
export class OrganizationController {
    constructor(private readonly service: OrganizationService) { }

    /**
     * 创建组织
     */
    @Post()
    create(@Body() dto: CreateOrganizationRequest) {
        return this.service.create(dto);
    }

    /**
     * 获取所有组织（扁平列表）
     */
    @Get()
    findAll() {
        return this.service.findAll();
    }

    /**
     * 获取组织树形结构
     */
    @Get('tree')
    findTree() {
        return this.service.findTree();
    }

    /**
     * 获取单个组织详情
     */
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.findOne(id);
    }

    /**
     * 更新组织
     */
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateOrganizationRequest,
    ) {
        return this.service.update(id, dto);
    }

    /**
     * 删除组织
     */
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.remove(id);
    }
}

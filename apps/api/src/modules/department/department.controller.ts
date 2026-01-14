import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    ParseUUIDPipe,
    Query,
} from '@nestjs/common';
import { DepartmentService } from './department.service';
import { CreateDepartmentRequest, UpdateDepartmentRequest } from './dto';

@Controller('departments')
export class DepartmentController {
    constructor(private readonly service: DepartmentService) { }

    /**
     * 创建部门
     */
    @Post()
    create(@Body() dto: CreateDepartmentRequest) {
        return this.service.create(dto);
    }

    /**
     * 获取所有部门（扁平列表）
     */
    @Get()
    findAll(@Query('organizationId') organizationId?: string) {
        if (organizationId) {
            return this.service.findByOrganization(organizationId);
        }
        return this.service.findAll();
    }

    /**
     * 获取某组织的部门树形结构
     */
    @Get('tree/:organizationId')
    findTree(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
        return this.service.findTree(organizationId);
    }

    /**
     * 获取单个部门详情
     */
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.findOne(id);
    }

    /**
     * 更新部门
     */
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateDepartmentRequest,
    ) {
        return this.service.update(id, dto);
    }

    /**
     * 删除部门
     */
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.remove(id);
    }
}

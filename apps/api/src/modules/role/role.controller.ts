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
import { RoleService } from './role.service';
import { CreateRoleRequest, UpdateRoleRequest } from './dto';

@Controller('roles')
export class RoleController {
    constructor(private readonly service: RoleService) { }

    /**
     * 创建角色
     */
    @Post()
    create(@Body() dto: CreateRoleRequest) {
        return this.service.create(dto);
    }

    /**
     * 获取所有角色
     */
    @Get()
    findAll() {
        return this.service.findAll();
    }

    /**
     * 获取单个角色详情
     */
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.findOne(id);
    }

    /**
     * 更新角色
     */
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateRoleRequest,
    ) {
        return this.service.update(id, dto);
    }

    /**
     * 删除角色
     */
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.remove(id);
    }
}

import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Delete,
    Query,
    ParseUUIDPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserRequest, UpdateUserRequest, AssignRolesRequest } from './dto';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    /**
     * 创建用户
     */
    @Post()
    create(@Body() dto: CreateUserRequest) {
        return this.usersService.create(dto);
    }

    /**
     * 获取所有用户（支持筛选）
     */
    @Get()
    findAll(
        @Query('organizationId') organizationId?: string,
        @Query('departmentId') departmentId?: string,
        @Query('status') status?: string,
    ) {
        return this.usersService.findAll({
            organizationId,
            departmentId,
            status: status as any,
        });
    }

    /**
     * 获取单个用户详情
     */
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.findOne(id);
    }

    /**
     * 更新用户
     */
    @Patch(':id')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateUserRequest,
    ) {
        return this.usersService.update(id, dto);
    }

    /**
     * 分配角色
     */
    @Post(':id/roles')
    assignRoles(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignRolesRequest,
    ) {
        return this.usersService.assignRoles(id, dto);
    }

    /**
     * 删除用户
     */
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.usersService.remove(id);
    }
}

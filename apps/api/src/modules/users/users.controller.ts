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
import { UserStatus } from '@packages/types';

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
        @Query('organizationIds') organizationIds?: string,
        @Query('departmentIds') departmentIds?: string,
        @Query('ids') ids?: string,
        @Query('keyword') keyword?: string,
        @Query('status') status?: string,
    ) {
        const normalizedOrgIds = organizationIds
            ? organizationIds.split(',').map((item) => item.trim()).filter(Boolean)
            : (organizationId ? [organizationId] : undefined);
        const normalizedDeptIds = departmentIds
            ? departmentIds.split(',').map((item) => item.trim()).filter(Boolean)
            : (departmentId ? [departmentId] : undefined);
        const normalizedIds = ids
            ? ids.split(',').map((item) => item.trim()).filter(Boolean)
            : undefined;

        return this.usersService.findAll({
            organizationIds: normalizedOrgIds,
            departmentIds: normalizedDeptIds,
            ids: normalizedIds,
            keyword,
            status: status ? (status as UserStatus) : undefined,
        });
    }

    /**
     * 分页获取用户（筛选 + 分页）
     */
    @Get('paged')
    findPaged(
        @Query('organizationIds') organizationIds?: string,
        @Query('departmentIds') departmentIds?: string,
        @Query('keyword') keyword?: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        const normalizedOrgIds = organizationIds
            ? organizationIds.split(',').map((item) => item.trim()).filter(Boolean)
            : undefined;
        const normalizedDeptIds = departmentIds
            ? departmentIds.split(',').map((item) => item.trim()).filter(Boolean)
            : undefined;

        return this.usersService.findPaged({
            organizationIds: normalizedOrgIds,
            departmentIds: normalizedDeptIds,
            keyword,
            status: status ? (status as UserStatus) : undefined,
            page: page ? Number(page) : 1,
            pageSize: pageSize ? Number(pageSize) : 20,
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

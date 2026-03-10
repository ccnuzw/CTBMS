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
import {
  CreateUserRequest,
  UpdateUserRequest,
  AssignRolesRequest,
  UserQueryRequest,
  BatchAssignUsersRequest,
} from './dto';

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
   * 获取用户列表（统一分页 + 筛选）
   * GET /users?page=1&pageSize=20&keyword=xxx&status=ACTIVE&...
   */
  @Get()
  findAll(@Query() query: UserQueryRequest) {
    return this.usersService.findPaged(query);
  }

  /**
   * 批量分配用户到组织/部门
   */
  @Post('actions/batch-assign')
  batchAssign(@Body() dto: BatchAssignUsersRequest) {
    return this.usersService.batchAssign(dto);
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
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserRequest) {
    return this.usersService.update(id, dto);
  }

  /**
   * 分配角色
   */
  @Post(':id/actions/assign-roles')
  assignRoles(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRolesRequest) {
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

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserRequest } from './create-user.dto';
import { UpdateUserRequest } from './update-user.dto';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    create(@Body() createUserDto: CreateUserRequest) {
        return this.usersService.create(createUserDto);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateUserDto: UpdateUserRequest) {
        return this.usersService.update(id, updateUserDto);
    }

    @Get()
    findAll() {
        return this.usersService.findAll();
    }
}

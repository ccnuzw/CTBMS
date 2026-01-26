
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { PromptService } from './prompt.service';

@Controller('prompts')
export class PromptController {
    constructor(private readonly promptService: PromptService) { }

    @Get()
    async findAll() {
        return this.promptService.findAll();
    }

    @Post()
    async create(@Body() body: any) {
        return this.promptService.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        return this.promptService.update(id, body);
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.promptService.delete(id);
    }

    @Post('preview')
    async preview(@Body() body: { code: string; variables: any }) {
        return this.promptService.preview(body.code, body.variables);
    }
}

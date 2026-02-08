
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PromptService } from './prompt.service';

@Controller('prompts')
export class PromptController {
    constructor(private readonly promptService: PromptService) { }

    @Get()
    async findAll() {
        return this.promptService.findAll();
    }

    @Post()
    async create(@Body() body: Prisma.PromptTemplateUncheckedCreateInput) {
        return this.promptService.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: Prisma.PromptTemplateUncheckedUpdateInput) {
        return this.promptService.update(id, body);
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.promptService.delete(id);
    }

    @Post('preview')
    async preview(@Body() body: { code: string; variables: Record<string, unknown> }) {
        return this.promptService.preview(body.code, body.variables);
    }
}

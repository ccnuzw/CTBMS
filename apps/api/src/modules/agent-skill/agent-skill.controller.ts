import { Controller, Get, Query, Param, Patch, Body } from '@nestjs/common';
import { AgentSkillService } from './agent-skill.service';
import { Prisma } from '@prisma/client';

@Controller('agent-skills')
export class AgentSkillController {
    constructor(private readonly agentSkillService: AgentSkillService) { }

    @Get()
    async findAll(
        @Query('keyword') keyword?: string,
        @Query('isActive') isActiveStr?: string,
        @Query('page') pageStr?: string,
        @Query('pageSize') pageSizeStr?: string,
    ) {
        const where: Prisma.AgentSkillWhereInput = {};
        if (keyword) {
            where.OR = [
                { name: { contains: keyword, mode: 'insensitive' } },
                { skillCode: { contains: keyword, mode: 'insensitive' } },
                { description: { contains: keyword, mode: 'insensitive' } },
            ];
        }
        if (isActiveStr !== undefined) {
            where.isActive = isActiveStr === 'true';
        }

        const page = pageStr ? parseInt(pageStr, 10) : 1;
        const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 20;

        return this.agentSkillService.findAll(where, page, pageSize);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.agentSkillService.findOne(id);
    }

    @Patch(':id/toggle-active')
    async toggleActive(@Param('id') id: string) {
        return this.agentSkillService.toggleActive(id);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() body: { name?: string; description?: string; isActive?: boolean }) {
        return this.agentSkillService.update(id, body);
    }
}


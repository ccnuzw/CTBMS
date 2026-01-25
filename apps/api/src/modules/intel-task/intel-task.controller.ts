import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { IntelTaskService } from './intel-task.service';
import { IntelTaskTemplateService } from './intel-task-template.service';
import {
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    IntelTaskQuery,
    CreateIntelTaskTemplateDto,
    UpdateIntelTaskTemplateDto,
    BatchDistributeTasksDto,
} from '@packages/types';

@Controller('intel-tasks')
export class IntelTaskController {
    constructor(
        private readonly itemTaskService: IntelTaskService,
        private readonly templateService: IntelTaskTemplateService,
    ) { }

    // ========================
    // Tasks
    // ========================

    @Post()
    async create(@Body() dto: CreateIntelTaskDto) {
        const creatorId = 'system-user-placeholder'; // In real app, from request context
        return this.itemTaskService.create({ ...dto, createdById: creatorId });
    }

    @Get()
    async findAll(@Query() query: IntelTaskQuery) {
        // Handle numeric conversion for pages if needed (NestJS usually stringifies query params)
        const opts = {
            ...query,
            page: query.page ? parseInt(query.page as any, 10) : 1,
            pageSize: query.pageSize ? parseInt(query.pageSize as any, 10) : 20,
        };
        return this.itemTaskService.findAll(opts);
    }

    @Get('my')
    async getMyTasks(@Query('userId') userId: string) {
        // Fallback if no userId param (should come from AuthGuard)
        const targetUser = userId || 'system-user-placeholder';
        return this.itemTaskService.getMyTasks(targetUser);
    }

    @Post('check-overdue')
    async checkOverdueTasks() {
        return this.itemTaskService.checkOverdueTasks();
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateIntelTaskDto) {
        return this.itemTaskService.update(id, dto);
    }

    @Post(':id/complete')
    async complete(
        @Param('id') id: string,
        @Body('intelId') intelId?: string,
    ) {
        return this.itemTaskService.complete(id, intelId);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.itemTaskService.remove(id);
    }

    // ========================
    // Templates
    // ========================

    @Post('templates')
    async createTemplate(@Body() dto: CreateIntelTaskTemplateDto) {
        const creatorId = 'system-user-placeholder';
        return this.templateService.create({ ...dto, createdById: creatorId });
    }

    @Get('templates')
    async findAllTemplates() {
        return this.templateService.findAll();
    }

    @Get('templates/:id')
    async findTemplate(@Param('id') id: string) {
        return this.templateService.findOne(id);
    }

    @Put('templates/:id')
    async updateTemplate(@Param('id') id: string, @Body() dto: UpdateIntelTaskTemplateDto) {
        return this.templateService.update(id, dto);
    }

    @Delete('templates/:id')
    async removeTemplate(@Param('id') id: string) {
        return this.templateService.remove(id);
    }

    @Post('distribute')
    async distributeTasks(@Body() dto: BatchDistributeTasksDto) {
        const triggerUserId = 'system-user-placeholder';
        return this.templateService.distributeTasks(dto, triggerUserId);
    }
}

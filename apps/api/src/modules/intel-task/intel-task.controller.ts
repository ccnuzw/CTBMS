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
import { Prisma } from '@prisma/client';
import {
    CreateIntelTaskDto,
    UpdateIntelTaskDto,
    IntelTaskQueryDto,
    CreateIntelTaskTemplateDto,
    UpdateIntelTaskTemplateDto,
    BatchDistributeTasksDto,
    GetCalendarPreviewDto,
    GetCalendarSummaryDto,
    CreateIntelTaskRuleDto,
    UpdateIntelTaskRuleDto,
    GetRuleMetricsDto,
} from './dto';

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
    async findAll(@Query() query: IntelTaskQueryDto) {
        return this.itemTaskService.findAll(query);
    }

    @Get('metrics')
    async getMetrics(@Query() query: IntelTaskQueryDto) {
        return this.itemTaskService.getMetrics(query);
    }

    @Get('metrics/org')
    async getOrgMetrics(@Query() query: IntelTaskQueryDto) {
        return this.itemTaskService.getOrgMetrics(query);
    }

    @Get('metrics/dept')
    async getDeptMetrics(@Query() query: IntelTaskQueryDto) {
        return this.itemTaskService.getDeptMetrics(query);
    }

    @Get('metrics/performance')
    async getPerformanceMetrics(@Query() query: IntelTaskQueryDto) {
        return this.itemTaskService.getPerformanceMetrics(query);
    }

    @Get('templates/:id/rule-metrics')
    async getRuleMetrics(@Param('id') id: string, @Query() query: GetRuleMetricsDto) {
        return this.itemTaskService.getRuleMetrics(id, query);
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

    @Post(':id/submit')
    async submit(
        @Param('id') id: string,
        @Body() body: { operatorId: string; data?: Prisma.InputJsonValue }
    ) {
        // In real app, operatorId comes from JWT
        const operatorId = body.operatorId || 'system-user-placeholder';
        return this.itemTaskService.submitTask(id, operatorId, body.data);
    }

    @Post(':id/review')
    async review(
        @Param('id') id: string,
        @Body() body: { operatorId: string; approved: boolean; reason?: string }
    ) {
        const operatorId = body.operatorId || 'system-user-placeholder';
        return this.itemTaskService.reviewTask(id, operatorId, body.approved, body.reason);
    }

    @Post(':id/complete')
    async complete(
        @Param('id') id: string,
        @Body('intelId') intelId?: string,
    ) {
        return this.itemTaskService.complete(id, intelId);
    }

    @Post(':id/cancel')
    async cancel(
        @Param('id') id: string,
        @Body() body: { operatorId?: string; reason?: string }
    ) {
        const operatorId = body.operatorId || 'system-user-placeholder';
        return this.itemTaskService.cancelTask(id, operatorId, body.reason);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.itemTaskService.remove(id);
    }

    @Get('calendar-preview')
    async getCalendarPreview(@Query() query: GetCalendarPreviewDto) {
        return this.templateService.getCalendarPreview(query);
    }

    @Get('calendar-summary')
    async getCalendarSummary(@Query() query: GetCalendarSummaryDto) {
        const summary = await this.itemTaskService.getCalendarSummary(query);
        if (!query.includePreview) {
            return summary;
        }
        if (query.status) {
            return summary;
        }
        const previewTasks = await this.templateService.getCalendarPreview({
            startDate: query.startDate,
            endDate: query.endDate,
            assigneeId: query.assigneeId,
            assigneeOrgId: query.assigneeOrgId,
            assigneeDeptId: query.assigneeDeptId,
        });
        return this.itemTaskService.attachPreviewSummary(summary, previewTasks, query);
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

    @Post('templates/:id/preview')
    async previewDistribution(@Param('id') id: string) {
        return this.templateService.previewDistribution(id);
    }

    @Post('templates/:id/execute')
    async executeTemplate(@Param('id') id: string) {
        const triggerUserId = 'system-user-placeholder';
        return this.templateService.executeTemplate(id, triggerUserId);
    }

    // ========================
    // Rules
    // ========================

    @Get('templates/:id/rules')
    async listRules(@Param('id') id: string) {
        return this.templateService.listRules(id);
    }

    // 注意：:id 参数路由必须放在所有 GET 静态路由之后，避免 "calendar-summary"、"templates" 等被当作 ID
    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.itemTaskService.findOne(id);
    }

    @Post('templates/:id/rules')
    async createRule(@Param('id') id: string, @Body() dto: CreateIntelTaskRuleDto) {
        return this.templateService.createRule({ ...dto, templateId: id });
    }

    @Put('rules/:id')
    async updateRule(@Param('id') id: string, @Body() dto: UpdateIntelTaskRuleDto) {
        return this.templateService.updateRule(id, dto);
    }

    @Delete('rules/:id')
    async deleteRule(@Param('id') id: string) {
        return this.templateService.removeRule(id);
    }
}

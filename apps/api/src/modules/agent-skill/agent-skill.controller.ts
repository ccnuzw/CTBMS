import {
  Controller,
  Get,
  Query,
  Param,
  Patch,
  Body,
  Post,
  Request,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AgentSkillService } from './agent-skill.service';
import { Prisma } from '@prisma/client';
import { Request as ExpressRequest } from 'express';
import {
  ReviewSkillDraftRequest,
  SandboxSkillDraftRequest,
  RevokeSkillRuntimeGrantRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('agent-skills')
export class AgentSkillController {
    constructor(private readonly agentSkillService: AgentSkillService) { }

    private getUserId(req: AuthRequest): string {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('User not authenticated');
        }
        return userId;
    }

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

    @Get(':id([0-9a-fA-F-]{36})')
    async findOne(@Param('id') id: string) {
        return this.agentSkillService.findOne(id);
    }

    @Patch(':id([0-9a-fA-F-]{36})/toggle-active')
    async toggleActive(@Param('id') id: string) {
        return this.agentSkillService.toggleActive(id);
    }

    @Patch(':id([0-9a-fA-F-]{36})')
    async update(@Param('id') id: string, @Body() body: { name?: string; description?: string; isActive?: boolean }) {
        return this.agentSkillService.update(id, body);
    }

    @Get('drafts')
    async listDrafts(@Request() req: AuthRequest, @Query('status') status?: string) {
        return this.agentSkillService.listDrafts(this.getUserId(req), status);
    }

    @Get('drafts/:draftId')
    async getDraft(@Request() req: AuthRequest, @Param('draftId') draftId: string) {
        const result = await this.agentSkillService.getDraft(this.getUserId(req), draftId);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_DRAFT_NOT_FOUND',
                message: 'Skill Draft 不存在或无权限访问',
            });
        }
        return result;
    }

    @Post('drafts/:draftId/sandbox-test')
    async sandboxTest(
        @Request() req: AuthRequest,
        @Param('draftId') draftId: string,
        @Body() dto: SandboxSkillDraftRequest,
    ) {
        const result = await this.agentSkillService.sandboxTestDraft(this.getUserId(req), draftId, dto);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_DRAFT_NOT_FOUND',
                message: 'Skill Draft 不存在或无权限访问',
            });
        }
        return result;
    }

    @Post('drafts/:draftId/submit-review')
    async submitReview(@Request() req: AuthRequest, @Param('draftId') draftId: string) {
        const result = await this.agentSkillService.submitDraftReview(this.getUserId(req), draftId);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_DRAFT_NOT_FOUND',
                message: 'Skill Draft 不存在或无权限访问',
            });
        }
        return result;
    }

    @Post('drafts/:draftId/review')
    async reviewDraft(
        @Request() req: AuthRequest,
        @Param('draftId') draftId: string,
        @Body() dto: ReviewSkillDraftRequest,
    ) {
        const result = await this.agentSkillService.reviewDraft(this.getUserId(req), draftId, dto);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_DRAFT_NOT_FOUND',
                message: 'Skill Draft 不存在或无权限访问',
            });
        }
        return result;
    }

    @Post('drafts/:draftId/publish')
    async publishDraft(@Request() req: AuthRequest, @Param('draftId') draftId: string) {
        const result = await this.agentSkillService.publishDraft(this.getUserId(req), draftId);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_DRAFT_NOT_FOUND',
                message: 'Skill Draft 不存在或无权限访问',
            });
        }
        return result;
    }

    @Get('drafts/:draftId/runtime-grants')
    async listRuntimeGrants(@Request() req: AuthRequest, @Param('draftId') draftId: string) {
        const result = await this.agentSkillService.listRuntimeGrants(this.getUserId(req), draftId);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_DRAFT_NOT_FOUND',
                message: 'Skill Draft 不存在或无权限访问',
            });
        }
        return result;
    }

    @Post('runtime-grants/:grantId/revoke')
    async revokeRuntimeGrant(
        @Request() req: AuthRequest,
        @Param('grantId') grantId: string,
        @Body() dto: RevokeSkillRuntimeGrantRequest,
    ) {
        const result = await this.agentSkillService.revokeRuntimeGrant(this.getUserId(req), grantId, dto);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_RUNTIME_GRANT_NOT_FOUND',
                message: '运行时授权不存在或无权限访问',
            });
        }
        return result;
    }

    @Post('runtime-grants/:grantId/use')
    async consumeRuntimeGrant(@Request() req: AuthRequest, @Param('grantId') grantId: string) {
        const result = await this.agentSkillService.consumeRuntimeGrant(this.getUserId(req), grantId);
        if (!result) {
            throw new NotFoundException({
                code: 'SKILL_RUNTIME_GRANT_NOT_FOUND',
                message: '运行时授权不存在或无权限访问',
            });
        }
        return result;
    }

    @Get('governance/overview')
    async governanceOverview(@Request() req: AuthRequest) {
        return this.agentSkillService.governanceOverview(this.getUserId(req));
    }

    @Get('governance/events')
    async governanceEvents(
        @Request() req: AuthRequest,
        @Query('draftId') draftId?: string,
        @Query('limit') limit?: string,
    ) {
        const parsedLimit = limit ? Number(limit) : undefined;
        return this.agentSkillService.listGovernanceEvents(
            this.getUserId(req),
            draftId,
            Number.isFinite(parsedLimit) ? parsedLimit : undefined,
        );
    }

    @Post('governance/housekeeping')
    async governanceHousekeeping(@Request() req: AuthRequest) {
        return this.agentSkillService.runGovernanceHousekeeping(this.getUserId(req));
    }
}

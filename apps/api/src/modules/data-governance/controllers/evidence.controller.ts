import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    ParseUUIDPipe,
    Post,
    Query,
    Request,
    UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
    CreateEvidenceBundleRequest,
    UpdateEvidenceBundleRequest,
    EvidenceBundleQueryRequest,
    EvidenceClaimQueryRequest,
    EvidenceConflictQueryRequest,
} from '../dto';
import { DataGovernanceService } from '../data-governance.service';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('data-governance')
export class EvidenceController {
    constructor(private readonly service: DataGovernanceService) { }

    @Post('evidence-bundles')
    createEvidenceBundle(@Body() dto: CreateEvidenceBundleRequest, @Request() req: AuthRequest) {
        return this.service.createEvidenceBundle(dto, this.getUserId(req));
    }

    @Get('evidence-bundles')
    listEvidenceBundles(@Query() query: EvidenceBundleQueryRequest) {
        return this.service.listEvidenceBundles(query);
    }

    @Get('evidence-bundles/:id')
    getEvidenceBundle(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.getEvidenceBundle(id);
    }

    @Patch('evidence-bundles/:id')
    updateEvidenceBundle(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateEvidenceBundleRequest,
        @Request() req: AuthRequest,
    ) {
        return this.service.updateEvidenceBundle(id, dto, this.getUserId(req));
    }

    @Delete('evidence-bundles/:id')
    deleteEvidenceBundle(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.deleteEvidenceBundle(id);
    }

    @Get('evidence-claims')
    listEvidenceClaims(@Query() query: EvidenceClaimQueryRequest) {
        return this.service.listEvidenceClaims(query);
    }

    @Get('evidence-conflicts')
    listEvidenceConflicts(@Query() query: EvidenceConflictQueryRequest) {
        return this.service.listEvidenceConflicts(query);
    }

    private getUserId(req: AuthRequest) {
        const userId = req.user?.id;
        if (!userId) {
            throw new UnauthorizedException('Unauthorized');
        }
        return userId;
    }
}

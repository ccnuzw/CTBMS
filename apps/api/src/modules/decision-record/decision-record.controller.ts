import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Request,
    UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { DecisionRecordService } from './decision-record.service';
import { CreateDecisionRecordDto, UpdateDecisionRecordDto, DecisionRecordQueryDto } from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('decision-records')
export class DecisionRecordController {
    constructor(private readonly service: DecisionRecordService) { }

    private getUserId(req: AuthRequest): string {
        const userId = req.user?.id;
        if (!userId) throw new UnauthorizedException('User not authenticated');
        return userId;
    }

    @Post()
    create(@Request() req: AuthRequest, @Body() dto: CreateDecisionRecordDto) {
        return this.service.create(this.getUserId(req), dto);
    }

    @Get()
    findMany(@Request() req: AuthRequest, @Query() dto: DecisionRecordQueryDto) {
        return this.service.findMany(this.getUserId(req), dto);
    }

    @Get('execution/:executionId')
    findByExecutionId(@Param('executionId') executionId: string) {
        return this.service.findByExecutionId(executionId);
    }

    @Get(':id')
    findOne(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.findOne(this.getUserId(req), id);
    }

    @Put(':id')
    update(
        @Request() req: AuthRequest,
        @Param('id') id: string,
        @Body() dto: UpdateDecisionRecordDto,
    ) {
        return this.service.update(this.getUserId(req), id, dto);
    }

    @Delete(':id')
    remove(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.remove(this.getUserId(req), id);
    }

    @Post(':id/publish')
    publish(@Request() req: AuthRequest, @Param('id') id: string) {
        return this.service.publish(this.getUserId(req), id);
    }

    @Post(':id/review')
    review(
        @Request() req: AuthRequest,
        @Param('id') id: string,
        @Body() body: { comment: string },
    ) {
        return this.service.review(this.getUserId(req), id, body.comment);
    }
}

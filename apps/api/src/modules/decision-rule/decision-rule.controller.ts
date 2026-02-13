import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { DecisionRuleService } from './decision-rule.service';
import {
  CreateDecisionRulePackRequest,
  DecisionRulePackQueryRequest,
  UpdateDecisionRulePackRequest,
  CreateDecisionRuleRequest,
  PublishDecisionRulePackRequest,
  UpdateDecisionRuleRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('decision-rule-packs')
export class DecisionRuleController {
  constructor(private readonly decisionRuleService: DecisionRuleService) {}

  @Post()
  createPack(@Body() dto: CreateDecisionRulePackRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.createPack(userId, dto);
  }

  @Get()
  findAll(@Query() query: DecisionRulePackQueryRequest, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.findOne(userId, id);
  }

  @Patch(':id')
  updatePack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDecisionRulePackRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.updatePack(userId, id, dto);
  }

  @Delete(':id')
  removePack(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.removePack(userId, id);
  }

  @Post(':id/publish')
  publishPack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDecisionRulePackRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.publishPack(userId, id, dto);
  }

  @Post(':id/rules')
  addRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDecisionRuleRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.addRule(userId, id, dto);
  }

  @Patch(':id/rules/:ruleId')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateDecisionRuleRequest,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.updateRule(userId, id, ruleId, dto);
  }

  @Delete(':id/rules/:ruleId')
  removeRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Request() req: AuthRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.decisionRuleService.removeRule(userId, id, ruleId);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { FuturesSimService } from './futures-sim.service';
import {
  CreateFuturesQuoteSnapshotRequest,
  FuturesQuoteQueryRequest,
  OpenPositionRequest,
  ClosePositionRequest,
  PositionQueryRequest,
  TradeLedgerQueryRequest,
} from './dto';

type AuthRequest = ExpressRequest & { user?: { id?: string } };

@Controller('futures-sim')
export class FuturesSimController {
  constructor(private readonly service: FuturesSimService) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return userId;
  }

  // ── 行情快照 ──

  @Post('quotes')
  createQuote(@Body() dto: CreateFuturesQuoteSnapshotRequest) {
    return this.service.createQuoteSnapshot(dto);
  }

  @Get('quotes')
  findQuotes(@Query() query: FuturesQuoteQueryRequest) {
    return this.service.findQuoteSnapshots(query);
  }

  @Get('quotes/latest/:contractCode')
  getLatestQuote(@Param('contractCode') contractCode: string) {
    return this.service.getLatestQuote(contractCode);
  }

  // ── 虚拟持仓 ──

  @Post('positions')
  openPosition(@Request() req: AuthRequest, @Body() dto: OpenPositionRequest) {
    return this.service.openPosition(this.getUserId(req), dto);
  }

  @Post('positions/:id/close')
  closePosition(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: ClosePositionRequest,
  ) {
    return this.service.closePosition(this.getUserId(req), id, dto);
  }

  @Get('positions')
  findPositions(@Request() req: AuthRequest, @Query() query: PositionQueryRequest) {
    return this.service.findPositions(this.getUserId(req), query);
  }

  @Get('positions/:id')
  getPositionDetail(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.getPositionDetail(this.getUserId(req), id);
  }

  // ── 成交流水 ──

  @Get('trades')
  findTrades(@Request() req: AuthRequest, @Query() query: TradeLedgerQueryRequest) {
    return this.service.findTrades(this.getUserId(req), query);
  }

  // ── 账户概览 ──

  @Get('accounts/:accountId/summary')
  getAccountSummary(@Request() req: AuthRequest, @Param('accountId') accountId: string) {
    return this.service.getAccountSummary(this.getUserId(req), accountId);
  }
}

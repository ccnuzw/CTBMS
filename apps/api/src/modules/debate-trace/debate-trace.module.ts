import { Module } from '@nestjs/common';
import { DebateTraceController } from './debate-trace.controller';
import { DebateTraceService } from './debate-trace.service';

@Module({
    controllers: [DebateTraceController],
    providers: [DebateTraceService],
    exports: [DebateTraceService],
})
export class DebateTraceModule { }

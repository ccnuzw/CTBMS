import { Module } from '@nestjs/common';
import { DecisionRecordController } from './decision-record.controller';
import { DecisionRecordService } from './decision-record.service';

@Module({
    controllers: [DecisionRecordController],
    providers: [DecisionRecordService],
    exports: [DecisionRecordService],
})
export class DecisionRecordModule { }

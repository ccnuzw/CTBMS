import { Module } from '@nestjs/common';
import { WorkflowExecutionModule } from '../workflow-execution';
import { WorkflowReplayController } from './workflow-replay.controller';

@Module({
  imports: [WorkflowExecutionModule],
  controllers: [WorkflowReplayController],
})
export class WorkflowReplayModule {}

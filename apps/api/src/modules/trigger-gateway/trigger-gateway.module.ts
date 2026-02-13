import { Module } from '@nestjs/common';
import { TriggerGatewayController } from './trigger-gateway.controller';
import { TriggerGatewayService } from './trigger-gateway.service';
import { WorkflowExecutionModule } from '../workflow-execution/workflow-execution.module';

@Module({
  imports: [WorkflowExecutionModule],
  controllers: [TriggerGatewayController],
  providers: [TriggerGatewayService],
  exports: [TriggerGatewayService],
})
export class TriggerGatewayModule {}

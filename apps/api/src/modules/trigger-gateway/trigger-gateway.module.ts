import { Module } from '@nestjs/common';
import { TriggerGatewayController } from './trigger-gateway.controller';
import { TriggerGatewayService } from './trigger-gateway.service';

@Module({
  controllers: [TriggerGatewayController],
  providers: [TriggerGatewayService],
  exports: [TriggerGatewayService],
})
export class TriggerGatewayModule {}

import { Module } from '@nestjs/common';
import { FuturesSimController } from './futures-sim.controller';
import { FuturesSimService } from './futures-sim.service';

@Module({
  controllers: [FuturesSimController],
  providers: [FuturesSimService],
  exports: [FuturesSimService],
})
export class FuturesSimModule {}

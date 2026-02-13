import { Module } from '@nestjs/common';
import { ParameterCenterController } from './parameter-center.controller';
import { ParameterCenterService } from './parameter-center.service';

@Module({
  controllers: [ParameterCenterController],
  providers: [ParameterCenterService],
  exports: [ParameterCenterService],
})
export class ParameterCenterModule {}

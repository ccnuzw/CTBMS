import { Module } from '@nestjs/common';
import { UserConfigBindingController } from './user-config-binding.controller';
import { UserConfigBindingService } from './user-config-binding.service';

@Module({
  controllers: [UserConfigBindingController],
  providers: [UserConfigBindingService],
  exports: [UserConfigBindingService],
})
export class UserConfigBindingModule {}

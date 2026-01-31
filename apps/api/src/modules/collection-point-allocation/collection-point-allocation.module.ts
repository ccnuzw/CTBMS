import { Module } from '@nestjs/common';
import { CollectionPointAllocationController } from './collection-point-allocation.controller';
import { CollectionPointAllocationService } from './collection-point-allocation.service';

@Module({
  controllers: [CollectionPointAllocationController],
  providers: [CollectionPointAllocationService],
  exports: [CollectionPointAllocationService],
})
export class CollectionPointAllocationModule {}

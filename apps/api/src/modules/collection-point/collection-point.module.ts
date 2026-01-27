import { Module } from '@nestjs/common';
import { CollectionPointController } from './collection-point.controller';
import { CollectionPointService } from './collection-point.service';

@Module({
    controllers: [CollectionPointController],
    providers: [CollectionPointService],
    exports: [CollectionPointService],
})
export class CollectionPointModule { }

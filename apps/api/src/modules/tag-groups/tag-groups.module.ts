import { Module } from '@nestjs/common';
import { TagGroupsService } from './tag-groups.service';
import { TagGroupsController } from './tag-groups.controller';

@Module({
    controllers: [TagGroupsController],
    providers: [TagGroupsService],
    exports: [TagGroupsService],
})
export class TagGroupsModule { }

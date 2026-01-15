import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagRequest, UpdateTagRequest, AttachTagsRequest, DetachTagRequest } from './dto';
import { TagScope, TaggableEntityType } from '@packages/types';

@Controller('tags')
export class TagsController {
    constructor(private readonly tagsService: TagsService) { }

    @Post()
    create(@Body() createTagDto: CreateTagRequest) {
        return this.tagsService.create(createTagDto);
    }

    @Get()
    findAll(
        @Query('scope') scope?: TagScope,
        @Query('groupId') groupId?: string,
        @Query('status') status?: string,
    ) {
        return this.tagsService.findAll({ scope, groupId, status });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tagsService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateTagDto: UpdateTagRequest) {
        return this.tagsService.update(id, updateTagDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.tagsService.remove(id);
    }

    // Entity Tag Operations
    @Post('attach')
    attachTags(@Body() attachTagsDto: AttachTagsRequest) {
        return this.tagsService.attachTags(attachTagsDto);
    }

    @Post('sync')
    syncTags(@Body() syncTagsDto: AttachTagsRequest) {
        return this.tagsService.syncEntityTags(syncTagsDto);
    }

    @Delete('detach')
    detachTag(@Body() detachTagDto: DetachTagRequest) {
        return this.tagsService.detachTag(detachTagDto);
    }

    @Get('entity/:entityType/:entityId')
    getEntityTags(
        @Param('entityType') entityType: TaggableEntityType,
        @Param('entityId') entityId: string,
    ) {
        return this.tagsService.getEntityTags(entityType, entityId);
    }
}

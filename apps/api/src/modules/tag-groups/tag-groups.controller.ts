import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
} from '@nestjs/common';
import { TagGroupsService } from './tag-groups.service';
import { CreateTagGroupRequest, UpdateTagGroupRequest } from './dto';

@Controller('tag-groups')
export class TagGroupsController {
    constructor(private readonly tagGroupsService: TagGroupsService) { }

    @Post()
    create(@Body() createTagGroupDto: CreateTagGroupRequest) {
        return this.tagGroupsService.create(createTagGroupDto);
    }

    @Get()
    findAll() {
        return this.tagGroupsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tagGroupsService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateTagGroupDto: UpdateTagGroupRequest,
    ) {
        return this.tagGroupsService.update(id, updateTagGroupDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.tagGroupsService.remove(id);
    }
}

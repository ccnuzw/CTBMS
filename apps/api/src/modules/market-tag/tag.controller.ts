import { Body, Controller, Get, Param, Patch, Post, Delete } from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagRequest, UpdateTagRequest } from './dto';

@Controller('market/tags')
export class TagController {
    constructor(private readonly tagService: TagService) { }

    @Post()
    create(@Body() dto: CreateTagRequest) {
        return this.tagService.create(dto);
    }

    @Get()
    findAll() {
        return this.tagService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tagService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateTagRequest) {
        return this.tagService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.tagService.remove(id);
    }
}

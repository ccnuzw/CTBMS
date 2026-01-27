import { Body, Controller, Get, Param, Patch, Post, Delete } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryRequest, UpdateCategoryRequest } from './dto';

@Controller('market/categories')
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Post()
    create(@Body() dto: CreateCategoryRequest) {
        return this.categoryService.create(dto);
    }

    @Get()
    findAll() {
        return this.categoryService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.categoryService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateCategoryRequest) {
        return this.categoryService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.categoryService.remove(id);
    }
}

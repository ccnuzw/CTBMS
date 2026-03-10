import { Body, Controller, Get, Param, Patch, Post, Delete, Res } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryRequest, UpdateCategoryRequest } from './dto';
import { Response } from 'express';
import { setDeprecationHeaders } from '../../common/utils/deprecation';

@Controller('market/categories')
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    @Post()
    create(@Body() dto: CreateCategoryRequest, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, '/v1/market-categories');
        }
        return this.categoryService.create(dto);
    }

    @Get()
    findAll(@Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, '/v1/market-categories');
        }
        return this.categoryService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, `/v1/market-categories/${id}`);
        }
        return this.categoryService.findOne(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateCategoryRequest,
        @Res({ passthrough: true }) res?: Response,
    ) {
        if (res) {
            setDeprecationHeaders(res, `/v1/market-categories/${id}`);
        }
        return this.categoryService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Res({ passthrough: true }) res?: Response) {
        if (res) {
            setDeprecationHeaders(res, `/v1/market-categories/${id}`);
        }
        return this.categoryService.remove(id);
    }
}

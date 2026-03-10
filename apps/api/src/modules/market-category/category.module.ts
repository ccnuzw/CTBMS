import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { MarketCategoriesV1Controller } from './market-categories.v1.controller';

@Module({
    controllers: [CategoryController, MarketCategoriesV1Controller],
    providers: [CategoryService],
    exports: [CategoryService],
})
export class MarketCategoryModule { }

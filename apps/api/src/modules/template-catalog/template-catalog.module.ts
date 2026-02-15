import { Module } from '@nestjs/common';
import { DbRoleGuard } from '../../common/guards/db-role.guard';
import { TemplateCatalogController } from './template-catalog.controller';
import { TemplateCatalogService } from './template-catalog.service';

@Module({
  controllers: [TemplateCatalogController],
  providers: [TemplateCatalogService, DbRoleGuard],
  exports: [TemplateCatalogService],
})
export class TemplateCatalogModule {}

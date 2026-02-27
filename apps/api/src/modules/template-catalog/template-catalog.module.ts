import { Module } from '@nestjs/common';
import { DbRoleGuard } from '../../common/guards/db-role.guard';
import { DataConnectorModule } from '../data-connector';
import { TemplateCatalogController } from './template-catalog.controller';
import { TemplateCatalogService } from './template-catalog.service';

@Module({
  imports: [DataConnectorModule],
  controllers: [TemplateCatalogController],
  providers: [TemplateCatalogService, DbRoleGuard],
  exports: [TemplateCatalogService],
})
export class TemplateCatalogModule {}

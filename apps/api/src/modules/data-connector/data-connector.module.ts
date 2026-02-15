import { Module } from '@nestjs/common';
import { DataConnectorController } from './data-connector.controller';
import { DataConnectorService } from './data-connector.service';

@Module({
  controllers: [DataConnectorController],
  providers: [DataConnectorService],
  exports: [DataConnectorService],
})
export class DataConnectorModule {}

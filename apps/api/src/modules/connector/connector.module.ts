
import { Module, Global } from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { ConnectorController } from './connector.controller';

@Global()
@Module({
    controllers: [ConnectorController],
    providers: [ConnectorService],
    exports: [ConnectorService],
})
export class ConnectorModule { }

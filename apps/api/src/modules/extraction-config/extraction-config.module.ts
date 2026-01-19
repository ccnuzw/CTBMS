import { Module } from '@nestjs/common';
import { ExtractionConfigController } from './extraction-config.controller';
import { ExtractionConfigService } from './extraction-config.service';

@Module({
    controllers: [ExtractionConfigController],
    providers: [ExtractionConfigService],
    exports: [ExtractionConfigService],
})
export class ExtractionConfigModule { }

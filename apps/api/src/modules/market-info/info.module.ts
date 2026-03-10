import { Module } from '@nestjs/common';
import { InfoService } from './info.service';
import { InfoController } from './info.controller';
import { TagsModule } from '../tags';
import { MarketInfoV1Controller } from './market-info.v1.controller';

@Module({
    imports: [TagsModule],
    controllers: [InfoController, MarketInfoV1Controller],
    providers: [InfoService],
    exports: [InfoService],
})
export class MarketInfoModule { }

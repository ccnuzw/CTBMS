import { Module } from '@nestjs/common';
import { InfoService } from './info.service';
import { InfoController } from './info.controller';
import { TagsModule } from '../tags';

@Module({
    imports: [TagsModule],
    controllers: [InfoController],
    providers: [InfoService],
    exports: [InfoService],
})
export class MarketInfoModule { }

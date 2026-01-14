import { Module } from '@nestjs/common';
import { InitController } from './init.controller';
import { InitService } from './init.service';

@Module({
    controllers: [InitController],
    providers: [InitService],
    exports: [InitService],
})
export class InitModule { }

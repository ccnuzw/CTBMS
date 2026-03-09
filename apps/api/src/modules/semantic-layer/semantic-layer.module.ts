import { Module } from '@nestjs/common';
import { SemanticLayerController } from './semantic-layer.controller';
import { SemanticLayerService } from './semantic-layer.service';

@Module({
    controllers: [SemanticLayerController],
    providers: [SemanticLayerService],
    exports: [SemanticLayerService],
})
export class SemanticLayerModule { }

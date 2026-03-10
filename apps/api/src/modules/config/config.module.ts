
import { Module, Global } from '@nestjs/common';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';
import { AIModelConfigsV1Controller } from './ai-model-configs.v1.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    controllers: [ConfigController, AIModelConfigsV1Controller],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule { }

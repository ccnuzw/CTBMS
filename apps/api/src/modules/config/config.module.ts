
import { Module, Global } from '@nestjs/common';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
    imports: [PrismaModule],
    controllers: [ConfigController],
    providers: [ConfigService],
    exports: [ConfigService],
})
export class ConfigModule { }

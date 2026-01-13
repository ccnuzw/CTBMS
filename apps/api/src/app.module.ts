import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma';
import { UsersModule } from './modules/users/users.module';
import { MarketCategoryModule } from './modules/market-category';
import { MarketTagModule } from './modules/market-tag';
import { MarketInfoModule } from './modules/market-info';
import { LoggerMiddleware } from './common/middleware/logger.middleware';

@Module({
    imports: [
        PrismaModule,
        UsersModule,
        MarketCategoryModule,
        MarketTagModule,
        MarketInfoModule,
    ],
    controllers: [AppController],
    providers: [],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggerMiddleware).forRoutes('*');
    }
}

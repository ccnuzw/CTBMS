import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma';
import { UsersModule } from './modules/users/users.module';
import { MarketCategoryModule } from './modules/market-category';
import { MarketInfoModule } from './modules/market-info';
import { OrganizationModule } from './modules/organization';
import { DepartmentModule } from './modules/department';
import { RoleModule } from './modules/role';
import { InitModule } from './modules/init';
import { TagsModule } from './modules/tags';
import { TagGroupsModule } from './modules/tag-groups';
import { EnterpriseModule } from './modules/enterprise';
import { MarketIntelModule } from './modules/market-intel';
import { AIModule } from './modules/ai';
import { LoggerMiddleware } from './common/middleware/logger.middleware';

@Module({
    imports: [
        PrismaModule,
        AIModule,
        UsersModule,
        MarketCategoryModule,
        MarketInfoModule,
        OrganizationModule,
        DepartmentModule,
        RoleModule,
        InitModule,
        TagsModule,
        TagGroupsModule,
        EnterpriseModule,
        MarketIntelModule,
    ],
    controllers: [AppController],
    providers: [],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(LoggerMiddleware).forRoutes('*');
    }
}


import { Global, Module } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagController } from './feature-flag.controller';

/**
 * Feature Flag 灰度开关模块
 *
 * @Global 装饰器使其全局可用，任何业务模块可直接注入 FeatureFlagService
 * 无需在各模块 imports 中声明。
 */
@Global()
@Module({
    controllers: [FeatureFlagController],
    providers: [FeatureFlagService],
    exports: [FeatureFlagService],
})
export class FeatureFlagModule { }

import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';

@Controller('feature-flags')
export class FeatureFlagController {
    constructor(private readonly service: FeatureFlagService) { }

    @Get()
    listFlags() {
        return this.service.listFlags();
    }

    @Get('check/:flagKey')
    async checkFlag(
        @Param('flagKey') flagKey: string,
        @Query('userId') userId?: string,
        @Query('environment') environment?: string,
    ) {
        const isEnabled = await this.service.isEnabled(flagKey, { userId, environment });
        return { flagKey, isEnabled };
    }

    @Get(':flagKey')
    getFlag(@Param('flagKey') flagKey: string) {
        return this.service.getFlag(flagKey);
    }

    @Post()
    upsertFlag(
        @Body()
        dto: {
            flagKey: string;
            description?: string;
            isEnabled?: boolean;
            rolloutPercent?: number;
            allowUserIds?: string[];
            environments?: string[];
            metadata?: Record<string, unknown>;
        },
    ) {
        return this.service.upsertFlag(dto);
    }

    @Patch(':flagKey')
    updateFlag(
        @Param('flagKey') flagKey: string,
        @Body()
        dto: {
            isEnabled?: boolean;
            rolloutPercent?: number;
            allowUserIds?: string[];
            environments?: string[];
            description?: string;
            metadata?: Record<string, unknown>;
        },
    ) {
        return this.service.updateFlag(flagKey, dto);
    }

    @Delete(':flagKey')
    deleteFlag(@Param('flagKey') flagKey: string) {
        return this.service.deleteFlag(flagKey);
    }

    @Post('seed')
    seedDefaults() {
        return this.service.seedDefaultFlags();
    }
}


import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InitService implements OnModuleInit {
    // Init service for seeding data
    private readonly logger = new Logger(InitService.name);

    constructor(private readonly prisma: PrismaService) { }

    async onModuleInit() {
        await this.measureTime('Seed Business Rules', () => this.seedBusinessRules());
        await this.measureTime('Seed AI Config', () => this.seedAIConfig());
    }

    async isInitialized(): Promise<boolean> {
        const count = await this.prisma.businessMappingRule.count();
        return count > 0;
    }

    async initialize() {
        await this.onModuleInit();
        return { success: true, message: 'Initialization executed' };
    }

    private async measureTime(label: string, fn: () => Promise<void>) {
        const start = Date.now();
        await fn();
        this.logger.log(`${label} completed in ${Date.now() - start}ms`);
    }

    private async seedBusinessRules() {
        // Only seed if empty to avoid overwriting user changes
        const count = await this.prisma.businessMappingRule.count();
        if (count > 0) return;

        const rules = [
            // PRICE_SUB_TYPE mappings
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '平舱', targetValue: 'FOB' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: 'FOB', targetValue: 'FOB' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '到港', targetValue: 'ARRIVAL' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '到货', targetValue: 'ARRIVAL' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '成交', targetValue: 'TRANSACTION' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '收购', targetValue: 'PURCHASE' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '站台', targetValue: 'STATION_ORIGIN' },

            // PRICE_SOURCE_TYPE mappings
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '港务', targetValue: 'PORT' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '码头', targetValue: 'PORT' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '生物', targetValue: 'ENTERPRISE' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '化工', targetValue: 'ENTERPRISE' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '淀粉', targetValue: 'ENTERPRISE' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '酒精', targetValue: 'ENTERPRISE' },

            // SENTIMENT mappings
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'positive', targetValue: 'positive' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'bullish', targetValue: 'positive' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'strong', targetValue: 'positive' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'negative', targetValue: 'negative' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'bearish', targetValue: 'negative' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'weak', targetValue: 'negative' },

            // GEO_LEVEL mappings
            { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '港', targetValue: 'PORT' },
            { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '市', targetValue: 'CITY' },
            { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '省', targetValue: 'PROVINCE' },
        ];

        for (const rule of rules) {
            await this.prisma.businessMappingRule.create({ data: rule });
        }
        this.logger.log(`Seeded ${rules.length} business rules.`);
    }

    private async seedAIConfig() {
        const count = await this.prisma.aIModelConfig.count();
        if (count > 0) return;

        await this.prisma.aIModelConfig.create({
            data: {
                configKey: 'DEFAULT',
                provider: 'google',
                modelName: 'gemini-1.5-pro',
                apiKeyEnvVar: 'GEMINI_API_KEY',
                temperature: 0.3,
                maxTokens: 8192,
            }
        });
        this.logger.log('Seeded default AI config.');
    }
}

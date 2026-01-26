
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessMappingRule, AIModelConfig } from '@prisma/client';

@Injectable()
export class ConfigService implements OnModuleInit {
    private readonly logger = new Logger(ConfigService.name);

    // Cache
    private mappingRulesCache: Map<string, BusinessMappingRule[]> = new Map();
    private aiConfigCache: Map<string, AIModelConfig> = new Map();
    private cacheLastUpdated: number = 0;
    private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute generic cache

    constructor(private readonly prisma: PrismaService) { }

    async onModuleInit() {
        await this.refreshCache();
    }

    /**
     * Refresh all configuration caches
     */
    async refreshCache() {
        try {
            // 1. Load Rules
            const rules = await this.prisma.businessMappingRule.findMany({
                where: { isActive: true },
                orderBy: { priority: 'desc' },
            });

            this.mappingRulesCache.clear();
            for (const rule of rules) {
                if (!this.mappingRulesCache.has(rule.domain)) {
                    this.mappingRulesCache.set(rule.domain, []);
                }
                this.mappingRulesCache.get(rule.domain)?.push(rule);
            }

            // 2. Load AI Configs
            const aiConfigs = await this.prisma.aIModelConfig.findMany({
                where: { isActive: true },
            });

            this.aiConfigCache.clear();
            for (const conf of aiConfigs) {
                this.aiConfigCache.set(conf.configKey, conf);
            }

            this.cacheLastUpdated = Date.now();
            this.logger.log(`Configuration cache refreshed: ${rules.length} rules, ${aiConfigs.length} AI models.`);
        } catch (error) {
            this.logger.error('Failed to refresh configuration cache', error);
        }
    }

    /**
     * Get AI Model Config
     */
    async getAIModelConfig(key: string = 'DEFAULT'): Promise<AIModelConfig | null> {
        // Simple cache check
        if (Date.now() - this.cacheLastUpdated > this.CACHE_TTL_MS) {
            await this.refreshCache();
        }
        return this.aiConfigCache.get(key) || null;
    }

    /**
     * Evaluate mapping rules for a given domain and text
     */
    evaluateMappingRule(domain: string, input: string, defaultValue?: string): string {
        const rules = this.mappingRulesCache.get(domain) || [];

        for (const rule of rules) {
            const pattern = rule.pattern;
            let matched = false;

            switch (rule.matchMode) {
                case 'EXACT':
                    matched = input === pattern;
                    break;
                case 'CONTAINS':
                    matched = input.includes(pattern);
                    break;
                case 'REGEX':
                    try {
                        const regex = new RegExp(pattern);
                        matched = regex.test(input);
                    } catch (e) {
                        this.logger.warn(`Invalid regex pattern in rule ${rule.id}: ${pattern}`);
                    }
                    break;
                default: // Default to CONTAINS
                    matched = input.includes(pattern);
            }

            if (matched) {
                return rule.targetValue;
            }
        }

        return defaultValue || input; // Return original if no match (or default value)
    }

    /**
     * CRUD: Create Rule
     */
    async createMappingRule(data: any) {
        const rule = await this.prisma.businessMappingRule.create({ data });
        await this.refreshCache();
        return rule;
    }

    /**
     * CRUD: Update Rule
     */
    async updateMappingRule(id: string, data: any) {
        const rule = await this.prisma.businessMappingRule.update({
            where: { id },
            data,
        });
        await this.refreshCache();
        return rule;
    }

    /**
     * CRUD: Delete Rule
     */
    async deleteMappingRule(id: string) {
        await this.prisma.businessMappingRule.delete({ where: { id } });
        await this.refreshCache();
    }

    /**
     * CRUD: Get Rules (List)
     */
    async getRules(domain?: string) {
        return this.prisma.businessMappingRule.findMany({
            where: domain ? { domain } : {},
            orderBy: [{ domain: 'asc' }, { priority: 'desc' }],
        });
    }

    /**
     * CRUD: Config AI Model
     */
    async upsertAIModelConfig(key: string, data: any) {
        const config = await this.prisma.aIModelConfig.upsert({
            where: { configKey: key },
            create: { ...data, configKey: key },
            update: data,
        });
        await this.refreshCache();
        return config;
    }
}

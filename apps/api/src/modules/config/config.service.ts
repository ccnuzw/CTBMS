
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AIModelConfig, BusinessMappingRule, DictionaryItem, Prisma } from '@prisma/client';
import {
    CreateDictionaryDomainDto,
    UpdateDictionaryDomainDto,
    CreateDictionaryItemDto,
    UpdateDictionaryItemDto,
} from './dto/dictionary.dto';

@Injectable()
export class ConfigService implements OnModuleInit {
    private readonly logger = new Logger(ConfigService.name);

    // Cache
    private mappingRulesCache: Map<string, BusinessMappingRule[]> = new Map();
    private aiConfigCache: Map<string, AIModelConfig> = new Map();
    private dictionaryCache: Map<string, DictionaryItem[]> = new Map();
    private cacheLastUpdated: number = 0;
    private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute generic cache

    constructor(private readonly prisma: PrismaService) { }

    private normalizeNullableString(value?: string | null): string | null | undefined {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    private normalizeMeta(meta: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
        if (meta === undefined) return undefined;
        if (meta === null) return Prisma.DbNull;
        if (typeof meta === 'string') {
            const trimmed = meta.trim();
            if (!trimmed) return Prisma.DbNull;
            try {
                return JSON.parse(trimmed) as Prisma.InputJsonValue;
            } catch (error) {
                throw new BadRequestException('meta 字段必须是合法 JSON');
            }
        }
        return meta as Prisma.InputJsonValue;
    }

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

            // 3. Load Dictionaries
            const dictDomains = await this.prisma.dictionaryDomain.findMany({
                where: { isActive: true },
                include: {
                    items: {
                        where: { isActive: true },
                        orderBy: { sortOrder: 'asc' },
                    },
                },
            });

            this.dictionaryCache.clear();
            for (const domain of dictDomains) {
                this.dictionaryCache.set(domain.code, domain.items);
            }

            this.cacheLastUpdated = Date.now();
            this.logger.log(
                `Configuration cache refreshed: ${rules.length} rules, ${aiConfigs.length} AI models, ${dictDomains.length} dictionaries.`
            );
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
     * Get Dictionary Items by domain
     */
    async getDictionary(domain: string, includeInactive: boolean = false): Promise<DictionaryItem[]> {
        if (!domain) return [];

        if (!includeInactive) {
            if (Date.now() - this.cacheLastUpdated > this.CACHE_TTL_MS) {
                await this.refreshCache();
            }
            return this.dictionaryCache.get(domain) || [];
        }

        return this.prisma.dictionaryItem.findMany({
            where: { domainCode: domain },
            orderBy: { sortOrder: 'asc' },
        });
    }

    /**
     * Get Dictionary Items for multiple domains
     */
    async getDictionaries(domains: string[] = [], includeInactive: boolean = false): Promise<Record<string, DictionaryItem[]>> {
        if (!domains.length) return {};

        if (!includeInactive) {
            if (Date.now() - this.cacheLastUpdated > this.CACHE_TTL_MS) {
                await this.refreshCache();
            }
            return domains.reduce<Record<string, DictionaryItem[]>>((acc, code) => {
                acc[code] = this.dictionaryCache.get(code) || [];
                return acc;
            }, {});
        }

        const items = await this.prisma.dictionaryItem.findMany({
            where: { domainCode: { in: domains } },
            orderBy: [{ domainCode: 'asc' }, { sortOrder: 'asc' }],
        });

        return items.reduce<Record<string, DictionaryItem[]>>((acc, item) => {
            if (!acc[item.domainCode]) acc[item.domainCode] = [];
            acc[item.domainCode].push(item);
            return acc;
        }, {});
    }

    /**
     * Dictionary Domain CRUD
     */
    async getDictionaryDomains(includeInactive: boolean = false) {
        return this.prisma.dictionaryDomain.findMany({
            where: includeInactive ? {} : { isActive: true },
            orderBy: { code: 'asc' },
            include: {
                _count: {
                    select: { items: true },
                },
            },
        });
    }

    async createDictionaryDomain(data: CreateDictionaryDomainDto) {
        const code = data.code?.trim();
        const name = data.name?.trim();
        if (!code) throw new BadRequestException('字典域编码不能为空');
        if (!name) throw new BadRequestException('字典域名称不能为空');

        const created = await this.prisma.dictionaryDomain.create({
            data: {
                code,
                name,
                description: this.normalizeNullableString(data.description),
                isActive: data.isActive ?? true,
            },
        });
        await this.refreshCache();
        return created;
    }

    async updateDictionaryDomain(code: string, data: UpdateDictionaryDomainDto) {
        const update: Prisma.DictionaryDomainUpdateInput = {};
        if (data.name !== undefined) update.name = data.name.trim();
        if (data.description !== undefined) update.description = this.normalizeNullableString(data.description);
        if (data.isActive !== undefined) update.isActive = data.isActive;
        const updated = await this.prisma.dictionaryDomain.update({
            where: { code },
            data: update,
        });
        await this.refreshCache();
        return updated;
    }

    async disableDictionaryDomain(code: string) {
        const updated = await this.prisma.dictionaryDomain.update({
            where: { code },
            data: { isActive: false },
        });
        await this.refreshCache();
        return updated;
    }

    /**
     * Dictionary Items CRUD
     */
    async getDictionaryItems(domainCode: string, includeInactive: boolean = false) {
        return this.prisma.dictionaryItem.findMany({
            where: {
                domainCode,
                ...(includeInactive ? {} : { isActive: true }),
            },
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        });
    }

    async createDictionaryItem(domainCode: string, data: CreateDictionaryItemDto) {
        const code = data.code?.trim();
        const label = data.label?.trim();
        if (!code) throw new BadRequestException('字典项编码不能为空');
        if (!label) throw new BadRequestException('字典项名称不能为空');

        const created = await this.prisma.dictionaryItem.create({
            data: {
                domainCode,
                code,
                label,
                sortOrder: data.sortOrder ?? 0,
                isActive: data.isActive ?? true,
                parentCode: this.normalizeNullableString(data.parentCode),
                meta: this.normalizeMeta(data.meta),
            },
        });
        await this.refreshCache();
        return created;
    }

    async updateDictionaryItem(domainCode: string, itemCode: string, data: UpdateDictionaryItemDto) {
        const update: Prisma.DictionaryItemUpdateInput = {};
        if (data.label !== undefined) update.label = data.label.trim();
        if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
        if (data.isActive !== undefined) update.isActive = data.isActive;
        if (data.parentCode !== undefined) update.parentCode = this.normalizeNullableString(data.parentCode);

        const meta = this.normalizeMeta(data.meta);
        if (meta !== undefined) update.meta = meta;

        const updated = await this.prisma.dictionaryItem.update({
            where: {
                domainCode_code: {
                    domainCode,
                    code: itemCode,
                },
            },
            data: update,
        });
        await this.refreshCache();
        return updated;
    }

    async disableDictionaryItem(domainCode: string, itemCode: string) {
        const updated = await this.prisma.dictionaryItem.update({
            where: {
                domainCode_code: {
                    domainCode,
                    code: itemCode,
                },
            },
            data: { isActive: false },
        });
        await this.refreshCache();
        return updated;
    }

    /**
     * 物理删除字典项（仅当无业务数据引用时允许）
     */
    async deleteDictionaryItem(domainCode: string, itemCode: string): Promise<{ success: boolean; message: string }> {
        // 1. 检查引用
        const refCheck = await this.checkDictionaryItemReferences(domainCode, itemCode);
        if (refCheck.total > 0) {
            const refDetails = refCheck.references.map(r => `${r.table}(${r.count}条)`).join(', ');
            throw new BadRequestException(
                `无法删除：该字典项仍有 ${refCheck.total} 条业务数据引用（${refDetails}）`,
            );
        }

        // 2. 执行物理删除
        await this.prisma.dictionaryItem.delete({
            where: {
                domainCode_code: {
                    domainCode,
                    code: itemCode,
                },
            },
        });

        await this.refreshCache();
        return { success: true, message: '字典项已永久删除' };
    }


    /**
     * 字典域 → 业务表引用配置
     * 用于检查字典项是否被业务数据引用
     * isEnum: 字段是否为枚举类型（需要 PostgreSQL 类型转换）
     * enumName: 枚举类型名称
     */
    private static readonly DICTIONARY_REFERENCE_CONFIG: Record<
        string,
        Array<{ table: string; field: string; isArray?: boolean; isEnum?: boolean; enumName?: string }>
    > = {
            USER_STATUS: [{ table: 'User', field: 'status', isEnum: true, enumName: 'UserStatus' }],
            ENTITY_STATUS: [
                { table: 'Organization', field: 'status', isEnum: true, enumName: 'EntityStatus' },
                { table: 'Department', field: 'status', isEnum: true, enumName: 'EntityStatus' },
                { table: 'Role', field: 'status', isEnum: true, enumName: 'EntityStatus' },
                { table: 'CollectionPoint', field: 'status', isEnum: true, enumName: 'EntityStatus' },
                { table: 'Enterprise', field: 'status', isEnum: true, enumName: 'EntityStatus' },
            ],
            GENDER: [{ table: 'User', field: 'gender', isEnum: true, enumName: 'Gender' }],
            ORGANIZATION_TYPE: [{ table: 'Organization', field: 'type', isEnum: true, enumName: 'OrganizationType' }],
            COLLECTION_POINT_TYPE: [{ table: 'CollectionPoint', field: 'type', isEnum: true, enumName: 'CollectionPointType' }],
            ENTERPRISE_TYPE: [{ table: 'Enterprise', field: 'types', isArray: true }],
            INFO_STATUS: [{ table: 'MarketInfo', field: 'status', isEnum: true, enumName: 'InfoStatus' }],
            COMMODITY: [
                { table: 'PriceData', field: 'commodity' },
                { table: 'PriceSubmission', field: 'commodity' },
                { table: 'IntelTask', field: 'commodity' },
                { table: 'CollectionPointAssignment', field: 'commodity' },
            ],
            PRICE_SUB_TYPE: [{ table: 'PriceData', field: 'subType', isEnum: true, enumName: 'PriceSubType' }],
            PRICE_SOURCE_TYPE: [{ table: 'PriceData', field: 'sourceType', isEnum: true, enumName: 'PriceSourceType' }],
            INTEL_CATEGORY: [{ table: 'IntelFeed', field: 'category', isEnum: true, enumName: 'IntelCategory' }],
            INTEL_SOURCE_TYPE: [{ table: 'IntelFeed', field: 'sourceType', isEnum: true, enumName: 'IntelSourceType' }],
            INTEL_TASK_TYPE: [{ table: 'IntelTask', field: 'type', isEnum: true, enumName: 'IntelTaskType' }],
            REPORT_TYPE: [{ table: 'ResearchReport', field: 'type' }],
        };


    /**
     * 检查字典项引用数量
     * @param domainCode 字典域编码
     * @param itemCode 字典项编码
     * @returns 引用统计信息
     */
    async checkDictionaryItemReferences(
        domainCode: string,
        itemCode: string,
    ): Promise<{ total: number; references: Array<{ table: string; count: number }> }> {
        const config = ConfigService.DICTIONARY_REFERENCE_CONFIG[domainCode];

        if (!config || config.length === 0) {
            return { total: 0, references: [] };
        }

        const references: Array<{ table: string; count: number }> = [];
        let total = 0;

        for (const ref of config) {
            try {
                let count = 0;
                let sql: string;

                if (ref.isArray) {
                    // 数组字段查询
                    sql = `SELECT COUNT(*) as count FROM "${ref.table}" WHERE $1 = ANY("${ref.field}")`;
                } else if (ref.isEnum && ref.enumName) {
                    // 枚举字段查询 - 需要类型转换
                    sql = `SELECT COUNT(*) as count FROM "${ref.table}" WHERE "${ref.field}" = $1::"${ref.enumName}"`;
                } else {
                    // 普通字符串字段查询
                    sql = `SELECT COUNT(*) as count FROM "${ref.table}" WHERE "${ref.field}" = $1`;
                }

                const result = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(sql, itemCode);
                count = Number(result[0]?.count || 0);

                if (count > 0) {
                    references.push({ table: ref.table, count });
                    total += count;
                }
            } catch (error) {
                this.logger.warn(`检查 ${ref.table}.${ref.field} 引用失败: ${error}`);
            }
        }

        return { total, references };
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

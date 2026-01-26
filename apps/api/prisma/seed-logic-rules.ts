
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 预设全量业务规则库
 * 涵盖：价格类型、物流术语、情感分析、地理层级、单位标准化
 */
const ENRICHED_RULES = [
    // ==========================================
    // 1. 价格子类型 (PRICE_SUB_TYPE)
    // ==========================================
    // 基础交易价
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '挂牌', targetValue: 'LISTED', priority: 1, description: '挂牌收购价' },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '挂价', targetValue: 'LISTED', priority: 1 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '牌价', targetValue: 'LISTED', priority: 1 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '门市', targetValue: 'LISTED', priority: 1 },

    // 物流相关价
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '入厂', targetValue: 'ARRIVAL', priority: 5, description: '送到厂区价格' },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '送到', targetValue: 'ARRIVAL', priority: 5 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '到厂', targetValue: 'ARRIVAL', priority: 5 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '到家', targetValue: 'ARRIVAL', priority: 5 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '到站', targetValue: 'STATION_DEST', priority: 5 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '车板', targetValue: 'STATION_ORIGIN', priority: 5, description: '产地车板价' },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '上车', targetValue: 'STATION_ORIGIN', priority: 5 },

    // 港口专用
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '平舱', targetValue: 'FOB', priority: 10, description: '港口平舱价' },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '平仓', targetValue: 'FOB', priority: 10 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '离岸', targetValue: 'FOB', priority: 10 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '船板', targetValue: 'FOB', priority: 10 },

    // 结算方式
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '出库', targetValue: 'WHOLESALE', priority: 2 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '出厂', targetValue: 'TRANSACTION', priority: 2 },
    { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '成交', targetValue: 'TRANSACTION', priority: 1 },

    // ==========================================
    // 2. 价格来源类型 (PRICE_SOURCE_TYPE)
    // ==========================================
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '直属库', targetValue: 'ENTERPRISE', priority: 5 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '储备库', targetValue: 'ENTERPRISE', priority: 5 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '粮库', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '米厂', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '粉厂', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '饲料厂', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '酒精厂', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '淀粉厂', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '深加工', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '贸易商', targetValue: 'ENTERPRISE', priority: 1 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '烘干塔', targetValue: 'ENTERPRISE', priority: 3 },

    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '港务局', targetValue: 'PORT', priority: 5 },
    { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '集装箱', targetValue: 'PORT', priority: 1 },

    // ==========================================
    // 3. 地理层级 (GEO_LEVEL)
    // ==========================================
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '省', targetValue: 'PROVINCE', priority: 1 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '自治区', targetValue: 'PROVINCE', priority: 2 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '市', targetValue: 'CITY', priority: 1 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '盟', targetValue: 'CITY', priority: 2 }, // 内蒙行政单位
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '州', targetValue: 'CITY', priority: 1 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '县', targetValue: 'DISTRICT', priority: 1 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '区', targetValue: 'DISTRICT', priority: 0 }, // 优先级低，避免匹配"厂区"
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '旗', targetValue: 'DISTRICT', priority: 2 }, // 内蒙行政单位

    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '港', targetValue: 'PORT', priority: 5 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '码头', targetValue: 'PORT', priority: 5 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '泊位', targetValue: 'PORT', priority: 5 },

    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '站', targetValue: 'STATION', priority: 2 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '货场', targetValue: 'STATION', priority: 2 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '物流园', targetValue: 'STATION', priority: 2 },

    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '厂', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '库', targetValue: 'ENTERPRISE', priority: 2 },
    { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '公司', targetValue: 'ENTERPRISE', priority: 2 },

    // ==========================================
    // 4. 情感分析 (SENTIMENT)
    // ==========================================
    // 看涨 (High Confidence)
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '暴涨', targetValue: 'positive', priority: 10 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '飙升', targetValue: 'positive', priority: 10 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '大涨', targetValue: 'positive', priority: 9 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '提价', targetValue: 'positive', priority: 8 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '上调', targetValue: 'positive', priority: 8 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '坚挺', targetValue: 'positive', priority: 6 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '偏强', targetValue: 'positive', priority: 5 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '红盘', targetValue: 'positive', priority: 5 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '惜售', targetValue: 'positive', priority: 4, description: '惜售通常暗示看涨' },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '抢购', targetValue: 'positive', priority: 6 },

    // 看跌 (High Confidence)
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '暴跌', targetValue: 'negative', priority: 10 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '跳水', targetValue: 'negative', priority: 10 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '大跌', targetValue: 'negative', priority: 9 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '下调', targetValue: 'negative', priority: 8 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '落价', targetValue: 'negative', priority: 8 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '走低', targetValue: 'negative', priority: 6 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '疲软', targetValue: 'negative', priority: 6 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '偏弱', targetValue: 'negative', priority: 5 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '绿盘', targetValue: 'negative', priority: 5 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '滞销', targetValue: 'negative', priority: 6 },

    // 持稳/观望
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '稳定', targetValue: 'neutral', priority: 1 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '持平', targetValue: 'neutral', priority: 1 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '盘整', targetValue: 'neutral', priority: 2 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '震荡', targetValue: 'neutral', priority: 2 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '观望', targetValue: 'neutral', priority: 2 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '僵持', targetValue: 'neutral', priority: 2 },
    { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: '有价无市', targetValue: 'neutral', priority: 3 },
];

async function main() {
    console.log('Start seeding enriched logic rules...');

    for (const rule of ENRICHED_RULES) {
        // 使用 upsert 确保更新
        const existing = await prisma.businessMappingRule.findFirst({
            where: {
                domain: rule.domain,
                pattern: rule.pattern
            }
        });

        if (existing) {
            await prisma.businessMappingRule.update({
                where: { id: existing.id },
                data: {
                    matchMode: rule.matchMode as any,
                    targetValue: rule.targetValue,
                    priority: rule.priority,
                    description: rule.description,
                    isActive: true,
                }
            });
            console.log(`Updated rule: [${rule.domain}] ${rule.pattern}`);
        } else {
            await prisma.businessMappingRule.create({
                data: {
                    domain: rule.domain,
                    matchMode: rule.matchMode as any,
                    pattern: rule.pattern,
                    targetValue: rule.targetValue,
                    priority: rule.priority,
                    description: rule.description,
                    isActive: true,
                }
            });
            console.log(`Created rule: [${rule.domain}] ${rule.pattern}`);
        }
    }
    console.log(`✅ Seeded ${ENRICHED_RULES.length} logic rules.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

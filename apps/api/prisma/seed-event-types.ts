import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EVENT_TYPES = [
    {
        code: 'PRICE_CHANGE',
        name: '价格异动',
        category: 'Market',
        description: '监测价格的大幅波动、涨跌停等异常情况',
        icon: 'RiseOutlined',
        color: '#f5222d',
        sortOrder: 1,
    },
    {
        code: 'SUPPLY_SHOCK',
        name: '供应冲击',
        category: 'Supply',
        description: '供应端的突发事件，如停产、检修、开工率变化',
        icon: 'ShopOutlined',
        color: '#fa8c16',
        sortOrder: 2,
    },
    {
        code: 'DEMAND_SHIFT',
        name: '需求变化',
        category: 'Demand',
        description: '需求端的显著变化，如采购放量、订单取消',
        icon: 'ShoppingCartOutlined',
        color: '#1890ff',
        sortOrder: 3,
    },
    {
        code: 'INVENTORY_ALERT',
        name: '库存预警',
        category: 'Inventory',
        description: '库存水平的异常变动，累库或去库',
        icon: 'DatabaseOutlined',
        color: '#eb2f96',
        sortOrder: 4,
    },
    {
        code: 'LOGISTICS_ISSUE',
        name: '物流状况',
        category: 'Logistics',
        description: '运输受阻、运费波动、发运限制等',
        icon: 'CarOutlined',
        color: '#722ed1',
        sortOrder: 5,
    },
    {
        code: 'POLICY_UPDATE',
        name: '政策发布',
        category: 'Policy',
        description: '政府发布的收储、补贴、进出口等相关政策',
        icon: 'FileTextOutlined',
        color: '#faad14',
        sortOrder: 6,
    },
    {
        code: 'WEATHER_IMPACT',
        name: '天气影响',
        category: 'Weather',
        description: '台风、雨雪等对生产运输造成的影响',
        icon: 'CloudOutlined',
        color: '#13c2c2',
        sortOrder: 7,
    },
    {
        code: 'MARKET_SENTIMENT',
        name: '市场心态',
        category: 'Sentiment',
        description: '市场参与者的情绪倾向，看涨/看跌/观望',
        icon: 'SmileOutlined',
        color: '#52c41a',
        sortOrder: 8,
    },
    {
        code: 'ENTERPRISE_ACTION',
        name: '企业动态',
        category: 'Enterprise',
        description: '龙头企业的战略调整、人事变动、投融资等',
        icon: 'TeamOutlined',
        color: '#2f54eb',
        sortOrder: 9,
    },
    {
        code: 'COST_CHANGE',
        name: '成本变动',
        category: 'Cost',
        description: '原材料、能源等生产成本的显著变化',
        icon: 'PayCircleOutlined',
        color: '#fa541c',
        sortOrder: 10,
    }
];

async function main() {
    console.log('🌱 Seeding Event Types...');

    // Cleanup legacy types if they exist (to fix English category display issues)
    const LEGACY_CODES = ['SUPPLY_CHANGE', 'LOGISTICS_INFO', 'DEFAULT'];
    const legacyTypes = await prisma.eventTypeConfig.findMany({
        where: { code: { in: LEGACY_CODES } },
        select: { id: true }
    });

    if (legacyTypes.length > 0) {
        const legacyIds = legacyTypes.map(t => t.id);
        // First delete dependent MarketEvents
        await prisma.marketEvent.deleteMany({
            where: { eventTypeId: { in: legacyIds } }
        });
        // Also update ExtractionRules to remove association or delete them if critical?
        // Actually RULES seed will fix the rules association later. 
        // But foreign key might block deletion if Rule points to it.
        // Let's check schema. ExtractionRule -> eventType is relation.
        // We set eventTypeId to null for rules pointing to legacy types
        await prisma.extractionRule.updateMany({
            where: { eventTypeId: { in: legacyIds } },
            data: { eventTypeId: null }
        });

        // Now delete the types
        await prisma.eventTypeConfig.deleteMany({
            where: {
                id: { in: legacyIds }
            }
        });
        console.log(`🧹 Cleaned up ${legacyIds.length} legacy event types and their dependencies.`);
    }

    for (const type of EVENT_TYPES) {
        await prisma.eventTypeConfig.upsert({
            where: { code: type.code },
            update: {
                name: type.name,
                category: type.category,
                description: type.description,
                icon: type.icon,
                color: type.color,
                sortOrder: type.sortOrder,
                isActive: true,
            },
            create: {
                code: type.code,
                name: type.name,
                category: type.category,
                description: type.description,
                icon: type.icon,
                color: type.color,
                sortOrder: type.sortOrder,
                isActive: true,
            },
        });
    }

    console.log(`✅ Seeded ${EVENT_TYPES.length} event types.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

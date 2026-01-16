
import { PrismaClient, UserStatus, EnterpriseType, IntelEntityLinkType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Run with: npx ts-node seed-manual.ts

const prisma = new PrismaClient();

// Helper to clean price range strings into an average number
function parsePrice(priceStr: string | number): number {
    if (typeof priceStr === 'number') return priceStr;
    // Handle "2160-2150" -> 2155
    if (priceStr.includes('-')) {
        const [high, low] = priceStr.split('-').map(s => parseFloat(s));
        return (high + low) / 2;
    }
    return parseFloat(priceStr);
}

// Enterprise Dictionary to ensure consistent IDs
// Define types correctly
const ENTITIES: Record<string, { id: string; type: EnterpriseType[] }> = {
    '营口港': { id: uuidv4(), type: ['LOGISTICS'] },
    '中国华粮': { id: uuidv4(), type: ['GROUP', 'CUSTOMER'] },
    '营口隆汇': { id: uuidv4(), type: ['CUSTOMER'] },
    '辽宁鑫谷': { id: uuidv4(), type: ['CUSTOMER'] },
    '大连信美': { id: uuidv4(), type: ['CUSTOMER'] },
    '北大荒西隆': { id: uuidv4(), type: ['GROUP', 'CUSTOMER'] }, // 北大荒
    '辽宁粮食集团': { id: uuidv4(), type: ['GROUP', 'CUSTOMER'] },
    '大连通为': { id: uuidv4(), type: ['CUSTOMER'] },
    '大连佳泽': { id: uuidv4(), type: ['CUSTOMER'] },
    '黑龙江北合': { id: uuidv4(), type: ['CUSTOMER'] },
    '辽宁枫晟': { id: uuidv4(), type: ['CUSTOMER'] },
    '农安丰业': { id: uuidv4(), type: ['CUSTOMER'] },
    '舟山华康': { id: uuidv4(), type: ['CUSTOMER'] },
    '长春宏城': { id: uuidv4(), type: ['CUSTOMER'] },
    '中国牧工商': { id: uuidv4(), type: ['GROUP', 'CUSTOMER'] },
    '营口和恒': { id: uuidv4(), type: ['CUSTOMER'] },
};

async function main() {
    console.log('🚀 Start comprehensive seeding...');

    // 1. Ensure System User
    const SYSTEM_USER_ID = 'system-user-placeholder';
    await prisma.user.upsert({
        where: { id: SYSTEM_USER_ID },
        update: {},
        create: {
            id: SYSTEM_USER_ID,
            username: 'system_ai',
            email: 'system-ai@ctbms.com',
            name: 'AI 采集助手',
            status: 'ACTIVE' as UserStatus,
        }
    });

    // 2. Upsert Enterprises
    console.log('Building Knowledge Graph (Enterprises)...');
    const REAL_IDS: Record<string, string> = {};
    for (const [name, data] of Object.entries(ENTITIES)) {
        // Use taxId as unique constraint for upsert
        const ent = await prisma.enterprise.upsert({
            where: { taxId: `TAX-${name}` },
            update: {},
            create: {
                id: data.id,
                name: name,
                shortName: name,
                taxId: `TAX-${name}`,
                types: data.type,
                province: '辽宁',
                city: '营口',
                status: 'ACTIVE'
            }
        });
        REAL_IDS[name] = ent.id;
    }

    // ==================================================================================
    // REPORT 1: 2025-10-17
    // ==================================================================================
    console.log('Processing Report 1: 2025-10-17...');

    // 1.1 Create MarketIntel
    const report1Id = uuidv4();
    const report1Date = new Date('2025-10-17T09:00:00Z');

    await prisma.marketIntel.create({
        data: {
            id: report1Id,
            category: 'B_SEMI_STRUCTURED',
            sourceType: 'FIRST_LINE',
            effectiveTime: report1Date,
            location: '营口港',
            region: ['营口', '辽宁'],
            rawContent: `10月17晴日营口港情况... (Full content omitted for brevity)`,
            summary: '10月17日营口港：价格暂稳，汽运0.6万吨，库存77万吨。主体报价在2120-2160区间。',
            aiAnalysis: {
                summary: '价格暂稳，库存高位(77万吨)。主要收购主体报价稳定，华粮最高2160。',
                sentiment: 'neutral',
                tags: ['#营口港', '#玉米', '#价格稳', '#库存高'],
                confidenceScore: 92,
                entities: Object.keys(ENTITIES).filter(k => k !== '舟山华康' && k !== '长春宏城') // Approx list
            },
            totalScore: 85,
            authorId: SYSTEM_USER_ID,
        }
    });

    // 1.2 Extract Price Data (A-Class Intel)
    const prices1 = [
        // Mainstream Price (Index)
        { name: '营口港', price: '2150-2160', grade: '一等', moisture: 15.0 }, // Mainstream range from text
        { name: '营口港', price: '2135-2150', grade: '二等', moisture: 15.0 },

        { name: '中国华粮', price: '2160-2150', grade: '一等', moisture: 15.0 },
        { name: '营口隆汇', price: 2120, grade: '二等', moisture: 15.0 },
        { name: '辽宁鑫谷', price: 2140, grade: '二等', moisture: 15.0 },
        { name: '大连信美', price: '2145-2135', grade: '二等', moisture: 15.0 },
        { name: '北大荒西隆', price: '2145-2135', grade: '二等', moisture: 15.0 },
        { name: '辽宁粮食集团', price: 2140, grade: '二等', moisture: 15.0 },
        { name: '大连通为', price: '2150-2145', grade: '二等', moisture: 15.0 },
        { name: '大连佳泽', price: 2140, grade: '二等', moisture: 15.0 },
        { name: '黑龙江北合', price: 2140, grade: '二等', moisture: 15.0 },
        { name: '辽宁枫晟', price: 2145, grade: '二等', moisture: 15.0 },
        { name: '农安丰业', price: 2140, grade: '二等', moisture: 15.0 },
    ];

    for (const p of prices1) {
        if (!ENTITIES[p.name]) {
            console.warn(`Skipping unknown entity: ${p.name}`);
            continue;
        }
        await prisma.priceData.upsert({
            where: {
                effectiveDate_commodity_location: {
                    effectiveDate: report1Date,
                    commodity: '玉米',
                    location: p.name
                }
            },
            update: {
                price: parsePrice(p.price),
                moisture: p.moisture,
                intelId: report1Id,
            },
            create: {
                effectiveDate: report1Date,
                commodity: '玉米',
                grade: p.grade,
                location: p.name, // Specific location is the company warehouse
                region: ['营口'],
                price: parsePrice(p.price),
                moisture: p.moisture,
                intelId: report1Id,
                authorId: SYSTEM_USER_ID,
            }
        });

        // Link Entity
        await prisma.intelEntityLink.upsert({
            where: { intelId_enterpriseId: { intelId: report1Id, enterpriseId: REAL_IDS[p.name] } },
            update: {},
            create: {
                intelId: report1Id,
                enterpriseId: REAL_IDS[p.name],
                linkType: 'SUBJECT' as IntelEntityLinkType
            }
        });
    }

    // ==================================================================================
    // REPORT 2: 2025-10-24
    // ==================================================================================
    console.log('Processing Report 2: 2025-10-24...');

    // 2.1 Create MarketIntel
    const report2Id = uuidv4();
    const report2Date = new Date('2025-10-24T09:00:00Z');

    await prisma.marketIntel.create({
        data: {
            id: report2Id,
            category: 'B_SEMI_STRUCTURED',
            sourceType: 'FIRST_LINE',
            effectiveTime: report2Date,
            location: '营口港',
            region: ['营口', '辽宁'],
            rawContent: `10月24晴日营口港情况... (Full content omitted for brevity)`,
            summary: '10月24日营口港：价格全线回落10-30元，库存暴增至95万吨。吉林粮源开始上量。',
            aiAnalysis: {
                summary: '库存暴增至95万吨，价格普跌。粮源产地向吉林/黑龙江纵深转移，港口拥堵风险增加。',
                sentiment: 'negative',
                tags: ['#营口港', '#玉米', '#价格跌', '#库存暴涨', '#产地转移'],
                confidenceScore: 95,
                validationMessage: '库存短时间激增(>20%)',
            },
            totalScore: 88,
            isFlagged: true,
            authorId: SYSTEM_USER_ID,
        }
    });

    // 2.2 Extract Price Data (Price dropped significantly)
    // Note: Manual mapping from user text
    const prices2 = [
        // Mainstream Price (Index)
        { name: '营口港', price: '2125-2130', grade: '一等', moisture: 15.0 },
        { name: '营口港', price: '2110-2120', grade: '二等', moisture: 15.0 },

        { name: '中国华粮', price: '2130-2120', grade: '二等', moisture: 15.0 }, // Was 2160
        { name: '大连信美', price: '2130-2120', grade: '二等' },
        { name: '舟山华康', price: 2120, grade: '二等' },
        { name: '大连通为', price: '2125-2110', grade: '二等' }, // Was 2150
        { name: '北大荒西隆', price: 2125, grade: '二等' },
        { name: '辽宁鑫谷', price: 2130, grade: '二等' },
        { name: '长春宏城', price: '2120-2100', grade: '二等' },
        { name: '辽宁枫晟', price: 2130, grade: '二等' },
        { name: '中国牧工商', price: 2110, grade: '二等' },
        { name: '营口和恒', price: 2120, grade: '二等' },
    ];

    for (const p of prices2) {
        if (!ENTITIES[p.name]) continue;
        await prisma.priceData.upsert({
            where: {
                effectiveDate_commodity_location: {
                    effectiveDate: report2Date,
                    commodity: '玉米',
                    location: p.name
                }
            },
            update: {
                price: parsePrice(p.price),
                intelId: report2Id,
            },
            create: {
                effectiveDate: report2Date,
                commodity: '玉米',
                grade: p.grade,
                location: p.name,
                region: ['营口'],
                price: parsePrice(p.price),
                moisture: 15.0, // Default for comparison
                intelId: report2Id,
                authorId: SYSTEM_USER_ID,
            }
        });

        // Link Entity
        await prisma.intelEntityLink.upsert({
            where: { intelId_enterpriseId: { intelId: report2Id, enterpriseId: REAL_IDS[p.name] } },
            update: {},
            create: {
                intelId: report2Id,
                enterpriseId: REAL_IDS[p.name],
                linkType: 'SUBJECT' as IntelEntityLinkType
            }
        });
    }

    console.log('✅ Seeding Complete. Data is ready for visualization testing.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

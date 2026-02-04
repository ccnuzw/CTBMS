/// <reference types="node" />
import { PrismaClient, PriceSourceType, PriceSubType, GeoLevel } from '@prisma/client';
import { addDays, format, subDays } from 'date-fns';

const prisma = new PrismaClient();

// Helper: Generate random price fluctuation
function generateNextPrice(currentPrice: number, volatility: number = 10): number {
    const change = (Math.random() - 0.5) * volatility * 2;
    return Number((currentPrice + change).toFixed(0)); // Integer prices often more realistic for bulk
}

async function seedPriceHistory() {
    console.log('📈 开始生成历史行情数据 (Seed Price History)...');

    // 1. 获取所有采集点
    const collectionPoints = await prisma.collectionPoint.findMany({
        where: { isActive: true },
    });

    // [NEW] Fetch users for random attribution
    const allUsers = await prisma.user.findMany({ where: { status: 'ACTIVE' } });
    const randomUser = () => allUsers.length > 0 ? allUsers[Math.floor(Math.random() * allUsers.length)] : null;

    console.log(`   - 找到 ${collectionPoints.length} 个采集点，${allUsers.length} 个潜在填报人，准备生成数据...`);

    const TODAY = new Date();
    const DAYS_TO_GENERATE = 90;
    const START_DATE = subDays(TODAY, DAYS_TO_GENERATE);

    let totalRecords = 0;

    for (const cp of collectionPoints) {
        // Skip if no commodities or prices configured
        if (!cp.commodities || cp.commodities.length === 0) continue;

        // Determine PriceSubType based on CP config or default
        const subTypeRaw = cp.defaultSubType || (cp.priceSubTypes.length > 0 ? cp.priceSubTypes[0] : 'LISTED');
        // Map raw string to Enum if needed (Assuming config matches Enum strings, otherwise map)
        // Simple mapping based on known values
        let subType: PriceSubType = PriceSubType.LISTED;
        if (subTypeRaw.includes('成交')) subType = PriceSubType.TRANSACTION;
        else if (subTypeRaw.includes('平舱') || subTypeRaw.includes('FOB')) subType = PriceSubType.FOB;
        else if (subTypeRaw.includes('到港') || subTypeRaw.includes('入厂')) subType = PriceSubType.ARRIVAL;
        else if (subTypeRaw.includes('站台')) subType = PriceSubType.STATION;
        else if (subTypeRaw.includes('批发')) subType = PriceSubType.WHOLESALE;

        // Determine SourceType
        let sourceType: PriceSourceType = PriceSourceType.ENTERPRISE;
        if (cp.type === 'PORT') sourceType = PriceSourceType.PORT;
        else if (cp.type === 'REGION') sourceType = PriceSourceType.REGIONAL;

        // Determine GeoLevel
        let geoLevel: GeoLevel = GeoLevel.ENTERPRISE;
        if (cp.type === 'PORT') geoLevel = GeoLevel.PORT;
        else if (cp.type === 'STATION') geoLevel = GeoLevel.STATION;

        // For each commodity configured for this CP
        for (const commodity of cp.commodities) {
            // Initial Price Baseline (Mock)
            let currentPrice = 2300; // Default Corn
            if (commodity === '大豆') currentPrice = 4600;
            if (commodity === '小麦') currentPrice = 2800;
            if (commodity === '豆粕') currentPrice = 3800;

            // Add some randomness to starting price so all stations don't look identical
            currentPrice += (Math.random() - 0.5) * 200;

            const records = [];

            // Generate daily data
            for (let i = 0; i <= DAYS_TO_GENERATE; i++) {
                const date = addDays(START_DATE, i);

                // Simulate Trend: slight upward trend for Corn, volatility for others
                if (commodity === '玉米' && i > 30 && i < 60) currentPrice += 2; // Bull run mid-term

                currentPrice = generateNextPrice(currentPrice, 5); // Daily fluctuation

                records.push({
                    effectiveDate: date,
                    commodity: commodity,
                    sourceType: sourceType,
                    subType: subType,
                    geoLevel: geoLevel,
                    location: cp.name,
                    province: null, // Could fetch from Region if needed
                    city: null,
                    regionCode: cp.regionCode,
                    longitude: cp.longitude,
                    latitude: cp.latitude,
                    price: currentPrice,
                    collectionPointId: cp.id,
                    authorId: randomUser()?.id || 'system_seed_bot', // [FIX] Random author
                    // Optional props
                    moisture: 14.5,
                    bulkDensity: 720,
                });
            }

            // Batch insert for performance
            // Prisma createMany is supported
            await prisma.priceData.createMany({
                data: records,
                skipDuplicates: true, // In case re-running on same dates
            });

            totalRecords += records.length;
        }
        process.stdout.write('.'); // Progress indicator
    }

    console.log(`\n🎉 历史行情生成完成。共生成 ${totalRecords} 条价格数据。`);
}

seedPriceHistory()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

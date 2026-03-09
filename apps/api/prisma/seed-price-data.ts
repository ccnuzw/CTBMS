/// <reference types="node" />
import { PrismaClient, PriceSourceType, PriceSubType, GeoLevel } from '@prisma/client';

const prisma = new PrismaClient();

// 品种基准价格和波动范围
const COMMODITY_BASE_PRICES: Record<string, { base: number; volatility: number }> = {
    'CORN': { base: 2350, volatility: 80 },
    'SOYBEAN': { base: 4800, volatility: 150 },
    'WHEAT': { base: 2680, volatility: 60 },
    'SORGHUM': { base: 2200, volatility: 70 },
    'SOYBEAN_MEAL': { base: 3850, volatility: 120 },
};

// 类型到 SourceType/SubType 的映射
const TYPE_MAPPINGS: Record<string, { sourceType: PriceSourceType; subType: PriceSubType; geoLevel: GeoLevel }> = {
    PORT: { sourceType: 'PORT', subType: 'ARRIVAL', geoLevel: 'PORT' },
    ENTERPRISE: { sourceType: 'ENTERPRISE', subType: 'PURCHASE', geoLevel: 'ENTERPRISE' },
    MARKET: { sourceType: 'REGIONAL', subType: 'WHOLESALE', geoLevel: 'CITY' },
    REGION: { sourceType: 'REGIONAL', subType: 'LISTED', geoLevel: 'CITY' },
    STATION: { sourceType: 'REGIONAL', subType: 'STATION', geoLevel: 'STATION' },
};

// 生成随机价格波动
function generatePriceChange(volatility: number): number {
    return Math.round((Math.random() - 0.5) * volatility);
}

// 生成日期范围
function getDateRange(days: number): Date[] {
    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push(date);
    }
    return dates;
}

async function main() {
    console.log('🌱 开始播种行情价格数据 (PriceData)...');

    // 1. 获取所有采集点
    const collectionPoints = await prisma.collectionPoint.findMany({
        include: { region: true },
    });

    if (collectionPoints.length === 0) {
        console.log('⚠️ 没有找到采集点，请先运行 seed-enterprise.ts 创建采集点');
        return;
    }

    console.log(`   📍 找到 ${collectionPoints.length} 个采集点`);

    // 2. 获取默认作者 ID（找第一个用户作为数据作者）
    const author = await prisma.user.findFirst();
    if (!author) {
        console.log('⚠️ 没有找到用户，请先运行 seed.ts 创建用户');
        return;
    }
    console.log(`   👤 使用用户 "${author.username}" 作为数据作者`);

    // 3. 生成日期范围（过去 45 天）
    const dates = getDateRange(45);
    console.log(`   📅 生成 ${dates.length} 天的数据 (${dates[0].toISOString().split('T')[0]} ~ ${dates[dates.length - 1].toISOString().split('T')[0]})`);

    // 4. 为每个采集点生成价格数据
    const commodities = ['CORN']; // 主要生成玉米数据，可扩展
    let totalCreated = 0;
    let skipped = 0;

    for (const point of collectionPoints) {
        const typeMapping = TYPE_MAPPINGS[point.type];
        if (!typeMapping) {
            console.log(`   ⚠️ 跳过未知类型采集点: ${point.name} (${point.type})`);
            continue;
        }

        for (const commodity of commodities) {
            const config = COMMODITY_BASE_PRICES[commodity];
            if (!config) continue;

            // 每个采集点有轻微的基准价格差异（模拟不同地区价差）
            const pointBasePriceOffset = Math.round((Math.random() - 0.5) * 100);
            let currentPrice = config.base + pointBasePriceOffset;

            const priceDataList = [];

            for (const date of dates) {
                // 随机生成当天的价格变动
                const dayChange = generatePriceChange(config.volatility / 3);
                currentPrice = Math.max(1500, Math.min(5000, currentPrice + dayChange)); // 限制范围

                // 随机水分（12-16%）
                const moisture = 12 + Math.random() * 4;

                priceDataList.push({
                    sourceType: typeMapping.sourceType,
                    subType: typeMapping.subType,
                    geoLevel: typeMapping.geoLevel,
                    location: point.shortName || point.name,
                    province: point.region?.name?.replace(/省$/, '') || null,
                    city: point.regionCode ? point.regionCode.substring(0, 4) : null,
                    region: point.region?.name ? [point.region.name] : [],
                    collectionPointId: point.id,
                    regionCode: point.regionCode || null,
                    effectiveDate: date,
                    commodity,
                    grade: 'Grade 2',
                    price: currentPrice,
                    moisture: parseFloat(moisture.toFixed(1)),
                    dayChange: dayChange,
                    authorId: author.id,
                });
            }

            // 批量插入（跳过重复）
            try {
                const result = await prisma.priceData.createMany({
                    data: priceDataList,
                    skipDuplicates: true,
                });
                totalCreated += result.count;
                if (result.count < priceDataList.length) {
                    skipped += priceDataList.length - result.count;
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.log(`   ❌ 插入失败 (${point.name}): ${message}`);
            }
        }

        // 进度提示
        if (collectionPoints.indexOf(point) % 10 === 0) {
            console.log(`   ... 已处理 ${collectionPoints.indexOf(point) + 1}/${collectionPoints.length} 个采集点`);
        }
    }

    console.log(`\n🎉 行情数据播种完成！`);
    console.log(`   ✅ 新增 ${totalCreated} 条记录`);
    if (skipped > 0) {
        console.log(`   ⏭️ 跳过 ${skipped} 条重复记录`);
    }
}

main()
    .catch((e) => {
        console.error('❌ Seed 失败:', e);
    })
    .finally(() => prisma.$disconnect());

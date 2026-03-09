/// <reference types="node" />
import { PrismaClient, IntelCategory, IntelSourceType, ContentType, PriceSourceType, PriceSubType, GeoLevel } from '@prisma/client';
import { addDays, format, subDays } from 'date-fns';

const prisma = new PrismaClient();

// Configuration
const END_DATE = new Date('2026-01-25');
const START_DATE = subDays(END_DATE, 90); // 3 Months

type PriceSeedRecord = {
    sourceType: PriceSourceType;
    subType: PriceSubType;
    geoLevel: GeoLevel;
    location: string;
    province: string | null;
    collectionPointId: string;
    effectiveDate: Date;
    commodity: string;
    grade: string;
    price: number;
    dayChange: number;
    authorId: string;
};

type IntelSeedRecord = {
    category: IntelCategory;
    contentType: ContentType;
    sourceType: IntelSourceType;
    effectiveTime: Date;
    location: string;
    rawContent: string;
    summary: string;
    authorId: string;
    aiAnalysis: {
        summary: string;
        sentiment: 'NEUTRAL';
        confidenceScore: number;
    };
};

async function main() {
    console.log(`📈 开始生成季度全量行情数据 (${format(START_DATE, 'yyyy-MM-dd')} ~ ${format(END_DATE, 'yyyy-MM-dd')})...`);

    // 1. Fetch Dependencies
    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No user found');
    const userId = user.id;

    const cps = await prisma.collectionPoint.findMany();
    console.log(`ℹ️ 共找到 ${cps.length} 个采集点，即将全部生成数据...`);

    // 2. Clear Existing Data
    console.log('🧹 清理该时间段历史数据...');
    await prisma.priceData.deleteMany({
        where: { effectiveDate: { gte: START_DATE, lte: END_DATE } }
    });
    await prisma.marketIntel.deleteMany({
        where: {
            effectiveTime: { gte: START_DATE, lte: END_DATE },
            sourceType: { in: [IntelSourceType.FIRST_LINE, IntelSourceType.OFFICIAL] }
        }
    });

    // 3. Initialize Trends
    // Base Price starts at a reasonable level
    let baseNEPrice = 2150;
    let currentMomentum = 0; // Current trend direction

    // 4. Time Series Generation
    let currentDate = START_DATE;
    const allPriceData: PriceSeedRecord[] = [];
    const allIntelData: IntelSeedRecord[] = [];

    while (currentDate <= END_DATE) {
        // Change momentum every ~5-10 days to creating "Waves"
        if (Math.random() < 0.15) {
            currentMomentum = Math.floor(Math.random() * 7) - 3; // -3 to +3 (Bearish to Bullish)
        }

        // Daily Price Move = Momentum + Daily Noise
        const dailyNoise = Math.floor(Math.random() * 9) - 4; // -4 to +4
        baseNEPrice += (currentMomentum + dailyNoise);

        // Loop through ALL CPs
        for (const cp of cps) {
            const name = cp.name;

            // --- Regional & Type Logic ---
            const isNorthPort = ['锦州', '鲅鱼圈', '北良', '大连', '营口', '丹东'].some(k => name.includes(k));
            const isYangtzePort = ['南通', '镇江', '南京', '张家港', '江苏'].some(k => name.includes(k));
            const isSouthPort = ['广东', '黄埔', '蛇口', '湛江', '广西', '钦州', '防城港', '漳州', '福建'].some(k => name.includes(k));

            // Sales Areas
            const isSalesArea = ['山东', '河南', '河北', '北京', '上海', '湖南', '江西', '四川', '西郊', '沙土集', '塔铺', '溧河'].some(k => name.includes(k));
            const isNE = !isSalesArea && !isYangtzePort && !isSouthPort;

            // Calculate Target Price based on Base Price with loose ranges
            let targetPrice = baseNEPrice;

            if (cp.type === 'ENTERPRISE') {
                if (isNE) {
                    targetPrice = baseNEPrice;
                } else {
                    // Sales Ent > Base + Random(200-240)
                    targetPrice = baseNEPrice + 220 + (Math.floor(Math.random() * 20) - 10);
                }
            } else if (cp.type === 'STATION') {
                if (isSalesArea) {
                    // Sales Station > Base + 40 + [120-200]
                    targetPrice = baseNEPrice + 40 + 160 + (Math.floor(Math.random() * 30) - 15);
                } else {
                    // NE Station > Base + 30-50
                    targetPrice = baseNEPrice + 40 + (Math.floor(Math.random() * 10) - 5);
                }
            } else if (cp.type === 'PORT') {
                if (isNorthPort) {
                    // North Port > Base + 140-170
                    targetPrice = baseNEPrice + 155 + (Math.floor(Math.random() * 20) - 10);
                } else if (isYangtzePort) {
                    // Yangtze > North Port + 80-100 -> Base + 245
                    targetPrice = baseNEPrice + 245 + (Math.floor(Math.random() * 20) - 10);
                } else if (isSouthPort) {
                    // South > North Port + 130-150 -> Base + 295
                    targetPrice = baseNEPrice + 295 + (Math.floor(Math.random() * 20) - 10);
                } else {
                    targetPrice = baseNEPrice + 155;
                }
            } else if (cp.type === 'MARKET') {
                targetPrice = baseNEPrice + 300;
            }

            // CP Identity Offset (Consistent per CP)
            const staticOffset = (cp.id.charCodeAt(0) % 20) - 10;

            // Apply Identification
            const finalPrice = targetPrice + staticOffset;

            // Determine Types
            let sourceType: PriceSourceType = PriceSourceType.REGIONAL;
            let subType: PriceSubType = PriceSubType.OTHER;
            let geoLevel: GeoLevel = GeoLevel.CITY;

            if (cp.type === 'PORT') {
                sourceType = PriceSourceType.PORT;
                subType = (isYangtzePort || isSouthPort) ? PriceSubType.ARRIVAL : PriceSubType.FOB;
                geoLevel = GeoLevel.PORT;
            } else if (cp.type === 'ENTERPRISE') {
                sourceType = PriceSourceType.ENTERPRISE;
                subType = PriceSubType.PURCHASE;
                geoLevel = GeoLevel.ENTERPRISE;
            } else if (cp.type === 'STATION') {
                sourceType = PriceSourceType.REGIONAL;
                subType = PriceSubType.STATION;
                geoLevel = GeoLevel.STATION;
            } else if (cp.type === 'MARKET') {
                sourceType = PriceSourceType.REGIONAL;
                subType = PriceSubType.WHOLESALE;
                geoLevel = GeoLevel.CITY;
            }

            // Generate Price Record
            allPriceData.push({
                sourceType,
                subType,
                geoLevel,
                location: cp.name,
                province: cp.regionCode ? '辽宁省' : null,
                collectionPointId: cp.id,
                effectiveDate: currentDate,
                commodity: 'CORN',
                grade: 'Grade 2',
                price: Math.round(finalPrice),
                dayChange: Math.round(currentMomentum + dailyNoise),
                authorId: userId
            });
        }

        // Generate Daily Intel
        let totalPrice = 0;
        const pricesToday = allPriceData.slice(allPriceData.length - cps.length);
        for (const p of pricesToday) totalPrice += p.price;
        const avgPrice = Math.round(totalPrice / cps.length);

        const trendDesc = currentMomentum > 1 ? '强势上涨' : (currentMomentum < -1 ? '冲高回落' : '区间震荡');
        const intelContent = `【${format(currentDate, 'MM-dd')} 市场日报】\n本日全国均价报${avgPrice}元/吨。受主力合约${trendDesc}影响，现货市场情绪${currentMomentum > 0 ? '偏暖' : '转淡'}。东北产区售粮进度${Math.floor(Math.random() * 10) + 30}%，销区补库意愿${Math.random() > 0.5 ? '增强' : '一般'}。`;

        allIntelData.push({
            category: IntelCategory.A_STRUCTURED,
            contentType: ContentType.DAILY_REPORT,
            sourceType: IntelSourceType.FIRST_LINE,
            effectiveTime: currentDate,
            location: '全国',
            rawContent: intelContent,
            summary: `全国均价${avgPrice}元。`,
            authorId: userId,
            aiAnalysis: {
                summary: intelContent,
                sentiment: 'NEUTRAL',
                confidenceScore: 90
            }
        });

        currentDate = addDays(currentDate, 1);
    }

    // 5. Batch Insert
    console.log(`💾 正在写入数据库... (预计 ${allPriceData.length} 条行情)`);

    const PRICE_CHUNK = 500;
    for (let i = 0; i < allPriceData.length; i += PRICE_CHUNK) {
        if (i % 5000 === 0) console.log(`   ...已写入 ${i} 条`);
        await prisma.priceData.createMany({
            data: allPriceData.slice(i, i + PRICE_CHUNK)
        });
    }

    await prisma.marketIntel.createMany({ data: allIntelData });

    console.log('🎉 季度全量数据生成完成！');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

import { PrismaClient, ReportType, ReportPeriod, ReviewStatus, ContentType, IntelSourceType, IntelCategory } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 开始播种研报测试数据 (2025.10 - 2026.01)...');

    // 获取一个测试用户
    const testUser = await prisma.user.findFirst();
    if (!testUser) {
        console.warn('⚠️  未找到测试用户,跳过研报数据播种');
        return;
    }

    // 创建测试情报数据和研报
    const reports = [
        // 1. 玉米周报 (Market, Short-term)
        {
            title: '国内玉米市场周报 - 2025年10月第2周',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2025-10-15'),
            source: '中国农业信息网',
            summary: '本周新季玉米上市量逐渐增加，东北产区天气晴好利于收割，价格小幅回落。深加工企业按需采购，建库意愿不强。',
            keyPoints: [
                { point: '东北及华北新玉米大量上市，供应压力显现', sentiment: 'BEARISH', confidence: 90 },
                { point: '深加工及饲料企业维持低库存策略', sentiment: 'BEARISH', confidence: 85 },
                { point: '港口平舱价周环比下跌20元/吨', sentiment: 'BEARISH', confidence: 95 }
            ],
            prediction: {
                direction: 'BEARISH',
                timeframe: 'SHORT',
                logic: '供应洪峰即将到来，而需求端承接能力有限，短期价格承压。'
            },
            dataPoints: [
                { metric: '锦州港平舱价', value: '2580', unit: '元/吨' },
                { metric: '山东深加工收购均价', value: '2650', unit: '元/吨' }
            ],
            commodities: ['CORN'],
            regions: ['东北', '华北'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 156,
            downloadCount: 23
        },
        // 2. 小麦冬播情况 (Industry, Medium-term)
        {
            title: '2025年冬小麦播种进度与苗情监测',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2025-10-28'),
            source: '国家粮油信息中心',
            summary: '截至10月底，全国冬小麦播种进度已过八成。黄淮海地区墒情适宜，出苗情况良好。部分晚播地块需关注降温影响。',
            keyPoints: [
                { point: '播种进度略快于往年同期', sentiment: 'neutral', confidence: 92 },
                { point: '土壤墒情整体适宜，利于冬前壮苗', sentiment: 'bullish', confidence: 88 }
            ],
            prediction: {
                direction: 'STABLE',
                timeframe: 'MEDIUM',
                logic: '苗情基础较好，若冬前无极端天气，明年产量有保障。'
            },
            dataPoints: [
                { metric: '全国播种进度', value: '82', unit: '%' },
                { metric: '一二类苗占比', value: '88', unit: '%' }
            ],
            commodities: ['WHEAT'],
            regions: ['黄淮海', '西北'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 89,
            downloadCount: 12
        },
        // 3. 全球食糖市场 (Research, Long-term)
        {
            title: '全球食糖供需平衡表预测更新 (2025/26年度)',
            reportType: ReportType.RESEARCH,
            reportPeriod: ReportPeriod.QUARTERLY,
            publishDate: new Date('2025-11-10'),
            source: '国际糖业组织(ISO)',
            summary: '预计2025/26年度全球食糖将出现200万吨的供应缺口。巴西产量虽创新高，作为主要出口国仍主导定价；印度出口限制政策可能延续。',
            keyPoints: [
                { point: '巴西中南部压榨量超预期', sentiment: 'bearish', confidence: 85 },
                { point: '印度及泰国受厄尔尼诺后遗症影响减产', sentiment: 'bullish', confidence: 90 },
                { point: '全球库存消费比进一步下降', sentiment: 'bullish', confidence: 80 }
            ],
            prediction: {
                direction: 'BULLISH',
                timeframe: 'LONG',
                logic: '结构性供应缺口存在，且印度出口政策具有不确定性，支撑国际糖价高位运行。'
            },
            dataPoints: [
                { metric: '全球供应缺口预测', value: '210', unit: '万吨' },
                { metric: '巴西糖产量', value: '4250', unit: '万吨' }
            ],
            commodities: ['SUGAR'],
            regions: ['全球', '巴西', '印度'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 312,
            downloadCount: 67
        },
        // 4. 大豆月报 (Industry, Monthly)
        {
            title: '中国大豆进口与压榨月报 - 2025年11月',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.MONTHLY,
            publishDate: new Date('2025-12-05'),
            source: '汇易咨询',
            summary: '11月大豆到港量庞大，油厂开机率保持高位，豆粕库存快速累积。豆油需求进入旺季但受棕榈油价差压制。',
            keyPoints: [
                { point: '11月大豆到港量创近年同期新高', sentiment: 'bearish', confidence: 95 },
                { point: '豆粕库存周环比增幅超10%', sentiment: 'bearish', confidence: 92 },
                { point: '养殖利润不佳抑制粕类需求', sentiment: 'bearish', confidence: 88 }
            ],
            prediction: {
                direction: 'BEARISH',
                timeframe: 'SHORT',
                logic: '供应宽松格局难改，且下游由于养殖亏损补库谨慎，基差将进一步走弱。'
            },
            dataPoints: [
                { metric: '11月大豆进口量', value: '920', unit: '万吨' },
                { metric: '沿海油厂豆粕库存', value: '85', unit: '万吨' },
                { metric: '压榨利润', value: '-150', unit: '元/吨' }
            ],
            commodities: ['SOYBEAN', 'SOYBEAN_MEAL', 'SOYBEAN_OIL'],
            regions: ['全国', '沿海'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 405,
            downloadCount: 98
        },
        // 5. 棉花政策 (Policy, Adhoc)
        {
            title: '关于主要农作物良种推广补贴政策的通知',
            reportType: ReportType.POLICY,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2025-12-15'),
            source: '农业农村部',
            summary: '为提升优势产区棉花品质，2026年将加大对南疆机采棉良种的补贴力度，鼓励种植高品质长绒棉。',
            keyPoints: [
                { point: '加大南疆高品质棉种补贴', sentiment: 'bullish', confidence: 100 },
                { point: '优化种植结构，调减低质产能', sentiment: 'bullish', confidence: 85 }
            ],
            prediction: {
                direction: 'BULLISH',
                timeframe: 'LONG',
                logic: '政策导向明显，有利于提升国产棉花质量竞争力和种植收益。'
            },
            dataPoints: [
                { metric: '良种补贴标准提高', value: '15', unit: '%' }
            ],
            commodities: ['COTTON'],
            regions: ['新疆'],
            reviewStatus: ReviewStatus.PENDING,
            viewCount: 56,
            downloadCount: 5
        },
        // 6. 生猪年报 (Research, Annual)
        {
            title: '2025年中国生猪市场年度回顾与2026年展望',
            reportType: ReportType.RESEARCH,
            reportPeriod: ReportPeriod.ANNUAL,
            publishDate: new Date('2026-01-08'),
            source: '搜猪网',
            summary: '2025年生猪产能去化缓慢，全年价格低位震荡。展望2026年，随着能繁母猪存栏降至合理区间，猪周期有望迎来向上拐点。',
            keyPoints: [
                { point: '2025全年均价同比下跌12%', sentiment: 'bearish', confidence: 100 },
                { point: '能繁母猪存栏已调减至3900万头', sentiment: 'bullish', confidence: 95 },
                { point: '规模化程度进一步提升', sentiment: 'neutral', confidence: 90 }
            ],
            prediction: {
                direction: 'BULLISH',
                timeframe: 'LONG',
                logic: '产能去化效果将在2026年下半年集中体现，配合宏观消费回暖，猪价具备反转基础。'
            },
            dataPoints: [
                { metric: '2025年均价', value: '14.8', unit: '元/公斤' },
                { metric: '期末能繁母猪', value: '3920', unit: '万头' }
            ],
            commodities: ['HOG'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 890,
            downloadCount: 210
        },
        // 7. 化肥周报 (Market, Weekly)
        {
            title: '尿素市场周报 - 2026年1月第1周',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2026-01-05'),
            source: '隆众资讯',
            summary: '气头装置季节性检修增多，供应端收缩。农业冬储推进缓慢，工业板材需求疲软，市场成交清淡，价格稳中偏弱。',
            keyPoints: [
                { point: '日产量降至16万吨以下', sentiment: 'BULLISH', confidence: 90 },
                { point: '冬储打款进度滞后', sentiment: 'BEARISH', confidence: 85 }
            ],
            prediction: {
                direction: 'VOLATILE',
                timeframe: 'SHORT',
                logic: '供需双弱格局下，价格缺乏大幅波动动力，关注春节前备货节奏。'
            },
            dataPoints: [
                { metric: '尿素日产', value: '15.8', unit: '万吨' },
                { metric: '主流出厂价', value: '2350', unit: '元/吨' }
            ],
            commodities: ['UREA'],
            regions: ['全国', '西南'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 120,
            downloadCount: 15
        },
        // 8. 宏观农业 (Macro, Adhoc)
        {
            title: '2026年宏观经济环境对大宗农产品影响展望',
            reportType: ReportType.RESEARCH,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2026-01-15'),
            source: '中信期货',
            summary: '预计2026年美元指数温和回落下，大宗商品金融属性压力减轻。原油价格中枢上移可能抬升生物柴油原料价格，利好油脂板块。',
            keyPoints: [
                { point: '美联储降息周期开启，利好商品', sentiment: 'BULLISH', confidence: 80 },
                { point: '原油与农产品联动性增强', sentiment: 'NEUTRAL', confidence: 75 }
            ],
            prediction: {
                direction: 'MIXED',
                timeframe: 'ANNUAL',
                logic: '宏观环境趋于宽松，但农产品自身基本面差异大，板块间将呈现分化走势。'
            },
            dataPoints: [
                { metric: 'GDP增速预测', value: '4.8', unit: '%' }
            ],
            commodities: ['SOYBEAN', 'CORN', 'PALM_OIL'],
            regions: ['全球'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 560,
            downloadCount: 120
        },
        // 9. 棕榈油快讯 (Market, Daily)
        {
            title: '马棕油午盘简报 - 2026.01.20',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.DAILY,
            publishDate: new Date('2026-01-20'),
            source: '路透社',
            summary: '马棕油期货盘中跳水，受累于竞品豆油跌势及出口数据疲软。MPOB数据显示库存降幅不及预期。',
            keyPoints: [
                { point: '出口环比下降8.5%', sentiment: 'BEARISH', confidence: 95 },
                { point: '产量虽减但库存仍处高位', sentiment: 'BEARISH', confidence: 85 }
            ],
            prediction: {
                direction: 'BEARISH',
                timeframe: 'SHORT',
                logic: '短线利空集中释放，盘面破位下行测试支撑。'
            },
            dataPoints: [
                { metric: 'BMD收盘涨跌', value: '-65', unit: '点' }
            ],
            commodities: ['PALM_OIL'],
            regions: ['东南亚'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 231,
            downloadCount: 0
        },
        // 10. 饲料行业季报 (Industry, Quarterly)
        {
            title: '饲料行业2025年四季度运行监测报告',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.QUARTERLY,
            publishDate: new Date('2026-01-22'),
            source: '饲料工业协会',
            summary: '四季度饲料总产量同比微降，猪料占比回落，禽料保持增长。受原料成本下降影响，饲料企业毛利有所修复。',
            keyPoints: [
                { point: '猪料产量同比下降3%', sentiment: 'BEARISH', confidence: 90 },
                { point: '原料成本综合降幅5%', sentiment: 'BULLISH', confidence: 95 },
                { point: '行业整合加速', sentiment: 'NEUTRAL', confidence: 80 }
            ],
            prediction: {
                direction: 'STABLE',
                timeframe: 'MEDIUM',
                logic: '下游养殖存栏调整期，饲料需求难有爆发式增长，竞争将转向质量与服务。'
            },
            dataPoints: [
                { metric: '总产量', value: '7800', unit: '万吨' },
                { metric: '毛利率环比提升', value: '1.2', unit: 'pct' }
            ],
            commodities: ['CORN', 'SOYBEAN_MEAL', 'FISH_MEAL'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 145,
            downloadCount: 33
        }
    ];

    for (const reportData of reports) {
        // 先创建 MarketIntel
        const intel = await prisma.marketIntel.create({
            data: {
                rawContent: reportData.summary,
                category: IntelCategory.C_DOCUMENT,
                contentType: ContentType.RESEARCH_REPORT,
                sourceType: IntelSourceType.RESEARCH_INST,
                location: reportData.regions[0] || '全国',
                region: reportData.regions,
                effectiveTime: reportData.publishDate,
                authorId: testUser.id,
                summary: reportData.summary,
            }
        });

        // 创建 ResearchReport
        await prisma.researchReport.create({
            data: {
                title: reportData.title,
                reportType: reportData.reportType,
                reportPeriod: reportData.reportPeriod,
                publishDate: reportData.publishDate,
                source: reportData.source,
                summary: reportData.summary,
                keyPoints: reportData.keyPoints,
                prediction: reportData.prediction,
                dataPoints: reportData.dataPoints,
                commodities: reportData.commodities,
                regions: reportData.regions,
                reviewStatus: reportData.reviewStatus,
                viewCount: reportData.viewCount,
                downloadCount: reportData.downloadCount,
                intelId: intel.id,
            }
        });

        console.log(`   ✅ 创建研报: ${reportData.title}`);
    }

    console.log(`\n✅ 成功创建 ${reports.length} 条研报测试数据 (2025.10-2026.01)`);
}

main()
    .catch((e) => {
        console.error('❌ 研报数据播种失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

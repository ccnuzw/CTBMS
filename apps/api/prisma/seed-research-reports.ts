/// <reference types="node" />
import {
    PrismaClient,
    ReportType,
    ReportPeriod,
    ReviewStatus,
    KnowledgeType,
    KnowledgeStatus,
    KnowledgePeriodType,
    KnowledgeContentFormat,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 开始播种研报测试数据 (新架构: 直接写入 KnowledgeItem)...');

    // 获取一个测试用户
    const testUser = await prisma.user.findFirst();
    if (!testUser) {
        console.warn('⚠️  未找到测试用户,跳过研报数据播种');
        return;
    }

    const reports = [
        // --- 玉米 (CORN) 10篇 ---
        {
            title: '国内玉米市场周报 - 2025年10月第2周',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2025-10-15'),
            source: '中国农业信息网',
            summary:
                '本周新季玉米上市量逐渐增加，东北产区天气晴好利于收割，价格小幅回落。深加工企业按需采购，建库意愿不强。',
            content: `# 国内玉米市场周报
**时间**: 2025年10月第2周
**来源**: 中国农业信息网

## 1. 市场综述
本周新季玉米上市量逐渐增加，东北产区天气晴好利于收割，**价格小幅回落**。深加工企业按需采购。

## 2. 产区动态
- **黑龙江**: 收割进度达 85%，潮粮价格跌至 0.98元/斤。
- **山东**: 上量增加，企业压车现象普遍。

## 3. 后市展望
供应洪峰即将到来，短期价格承压。`,
            keyPoints: [
                { point: '东北及华北新玉米大量上市', sentiment: 'BEARISH', confidence: 90 },
                { point: '深加工企业维持低库存', sentiment: 'BEARISH', confidence: 85 },
            ],
            prediction: { direction: 'BEARISH', timeframe: 'SHORT', logic: '供应增加，需求平淡。' },
            dataPoints: [{ metric: '锦州港平舱价', value: '2580', unit: '元/吨' }],
            commodities: ['CORN'],
            regions: ['东北', '华北'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 156,
            downloadCount: 23,
        },
        {
            title: '东北产区新粮上市进度与质量分析',
            reportType: ReportType.RESEARCH,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2025-10-20'),
            source: '粮油中心',
            summary:
                '今年东北玉米单产明显提升，但由于收割期雨水偏多，部分地区霉变率略高于往年，优质粮源相对稀缺。',
            content: `# 东北产区新粮上市进度与质量分析
今年的玉米丰产已成定局，均亩产提升约 100斤。但受前期降雨影响，**水分偏高**，储存难度大。`,
            keyPoints: [
                { point: '单产提升，总产预期增加', sentiment: 'BEARISH', confidence: 90 },
                { point: '水分偏高，霉变风险加大', sentiment: 'NEUTRAL', confidence: 80 },
            ],
            prediction: {
                direction: 'MIXED',
                timeframe: 'MEDIUM',
                logic: '量增质降，优质粮将有溢价。',
            },
            dataPoints: [{ metric: '平均水分', value: '28', unit: '%' }],
            commodities: ['CORN'],
            regions: ['东北'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 210,
            downloadCount: 45,
        },
        {
            title: '华北玉米深加工企业库存与收购心态调研',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2025-11-05'),
            source: '我的农产品网',
            summary:
                '华北深加工企业厂门到货量维持高位，库存普遍回升至15天以上。由于下游淀粉利润微薄，压价收购意愿较强。',
            content: `# 华北玉米深加工企业调研
企业库存快速回升，厂家**压价意愿强烈**。淀粉亏损幅度扩大，开工率有下调风险。`,
            keyPoints: [
                { point: '库存回升至安全线以上', sentiment: 'BEARISH', confidence: 95 },
                { point: '淀粉加工利润亏损', sentiment: 'BEARISH', confidence: 88 },
            ],
            prediction: { direction: 'BEARISH', timeframe: 'SHORT', logic: '需求端支撑不足。' },
            dataPoints: [{ metric: '平均库存天数', value: '15.5', unit: '天' }],
            commodities: ['CORN', 'CORN_STARCH'],
            regions: ['华北'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 180,
            downloadCount: 30,
        },
        {
            title: '2025/26年度中国玉米供需平衡表展望',
            reportType: ReportType.RESEARCH,
            reportPeriod: ReportPeriod.ANNUAL,
            publishDate: new Date('2025-12-01'),
            source: '农业部',
            summary:
                '预计2025/26年度国内玉米产量2.93亿吨，消费量2.98亿吨，产需缺口收窄。进口替代品（大麦、高粱）到港量预计维持高位。',
            content: `# 2025/26年度玉米供需平衡表
产需缺口收窄，**进口替代品**对国内玉米价格形成天花板效应。`,
            keyPoints: [
                { point: '产需缺口收窄', sentiment: 'BEARISH', confidence: 85 },
                { point: '替代品进口维持高位', sentiment: 'BEARISH', confidence: 90 },
            ],
            prediction: { direction: 'STABLE', timeframe: 'LONG', logic: '供需基本平衡。' },
            dataPoints: [{ metric: '预计产量', value: '2.93', unit: '亿吨' }],
            commodities: ['CORN'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 450,
            downloadCount: 120,
        },
        {
            title: '港口玉米价格日报 - 2025.12.10',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.DAILY,
            publishDate: new Date('2025-12-10'),
            source: '锦州港',
            summary:
                '锦州港新粮集港量3万吨，主流平舱价2560元/吨，较昨日持平。下海量有所增加，南方饲企补库积极性一般。',
            content: `# 港口玉米价格日报
集港量依然在高位，价格企稳。南方饲料厂采购**按需即采**，未见大规模囤货。`,
            keyPoints: [{ point: '价格企稳', sentiment: 'NEUTRAL', confidence: 95 }],
            prediction: { direction: 'STABLE', timeframe: 'SHORT', logic: '上下两难。' },
            dataPoints: [{ metric: '集港量', value: '30000', unit: '吨' }],
            commodities: ['CORN'],
            regions: ['锦州港'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 95,
            downloadCount: 5,
        },
        {
            title: 'CBOT玉米期货走势分析与进口成本测算',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2025-12-20'),
            source: '中粮期货',
            summary:
                '美玉米收割完毕，产量创历史次高。CBOT玉米主力合约跌破450美分。进口玉米完税成本估算在2100元/吨左右，远低于国内现货价格。',
            content: `# CBOT玉米与进口成本
内外价差依然巨大，**进口利润丰厚**。关注后期配额发放及转基因玉米进口政策。`,
            keyPoints: [
                { point: 'CBOT跌破450美分', sentiment: 'BEARISH', confidence: 90 },
                { point: '进口利润维持高位', sentiment: 'BEARISH', confidence: 95 },
            ],
            prediction: { direction: 'BEARISH', timeframe: 'MEDIUM', logic: '外盘低价压制内盘。' },
            dataPoints: [{ metric: '进口完税成本', value: '2100', unit: '元/吨' }],
            commodities: ['CORN'],
            regions: ['全球', '美国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 320,
            downloadCount: 60,
        },
        {
            title: '关于做好2025年秋粮收购工作的通知解读',
            reportType: ReportType.POLICY,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2025-09-30'),
            source: '粮食局',
            summary:
                '主要基调是"保供稳价"，强调多元主体入市，避免出现"卖粮难"。增储计划将根据市场价格动态调整。',
            content: `# 秋粮收购政策解读
政策托底意愿明确，但**不进行强刺激**。旨在平滑市场波动。`,
            keyPoints: [{ point: '保供稳价，防止卖粮难', sentiment: 'STABLE', confidence: 100 }],
            prediction: { direction: 'STABLE', timeframe: 'SHORT', logic: '政策托底。' },
            dataPoints: [],
            commodities: ['CORN', 'RICE'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 120,
            downloadCount: 10,
        },
        {
            title: '拉尼娜现象对南美新季玉米种植的影响评估',
            reportType: ReportType.RESEARCH,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2026-01-15'),
            source: '气象局',
            summary:
                '阿根廷玉米核心产区遭遇旱情，播种进度滞后。巴西首季玉米长势尚可。若干旱持续，南美总产存在下调风险。',
            content: `# 拉尼娜影响评估
阿根廷干旱风险升温，市场开始交易**天气升水**。关注1月底关键降雨。`,
            keyPoints: [{ point: '阿根廷产区干旱', sentiment: 'BULLISH', confidence: 80 }],
            prediction: { direction: 'BULLISH', timeframe: 'MEDIUM', logic: '供应端天气扰动。' },
            dataPoints: [{ metric: '阿根廷降雨距平', value: '-30', unit: '%' }],
            commodities: ['CORN'],
            regions: ['南美'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 280,
            downloadCount: 55,
        },
        {
            title: '饲料配方调整趋势：玉米替代品使用情况调查',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.MONTHLY,
            publishDate: new Date('2026-01-25'),
            source: '饲料协会',
            summary:
                '由于玉米价格回落，饲料企业开始调增玉米在配方中的比例，小麦和高粱的替代优势减弱。',
            content: `# 饲料配方主要变化
玉米性价比回归，**配方占比回升**至 40%-50%。替代品退出。`,
            keyPoints: [{ point: '玉米配方占比提升', sentiment: 'BULLISH', confidence: 85 }],
            prediction: { direction: 'BULLISH', timeframe: 'SHORT', logic: '饲用需求回暖。' },
            dataPoints: [{ metric: '玉米配方占比', value: '45', unit: '%' }],
            commodities: ['CORN', 'WHEAT', 'SORGHUM'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 160,
            downloadCount: 22,
        },
        {
            title: '临储玉米拍卖成交结果分析',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2026-02-10'),
            source: '交易中心',
            summary:
                '本周投放陈稻化谷和定向玉米共计200万吨，成交率依然低迷（15%）。市场陈粮供应充足，新粮上行有顶。',
            content: `# 临储拍卖结果
成交清淡，市场**不缺粮**。陈粮出库即面临亏损。`,
            keyPoints: [{ point: '成交率低迷', sentiment: 'BEARISH', confidence: 95 }],
            prediction: { direction: 'BEARISH', timeframe: 'SHORT', logic: '陈粮压制。' },
            dataPoints: [{ metric: '成交率', value: '15', unit: '%' }],
            commodities: ['CORN'],
            regions: ['东北'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 300,
            downloadCount: 40,
        },

        // --- 小麦 (WHEAT) 4篇 ---
        {
            title: '2025年冬小麦播种进度与苗情监测',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2025-10-28'),
            source: '粮油中心',
            summary:
                '截至10月底，全国冬小麦播种进度已过八成。黄淮海地区墒情适宜，出苗情况良好。',
            content: `# 冬小麦播种监测
播种顺利，苗情**一类苗比例高**。明年丰产基础好。`,
            keyPoints: [
                { point: '播种进度快', sentiment: 'NEUTRAL', confidence: 90 },
                { point: '墒情适宜', sentiment: 'BULLISH', confidence: 85 },
            ],
            prediction: { direction: 'STABLE', timeframe: 'MEDIUM', logic: '生产形势乐观。' },
            dataPoints: [{ metric: '播种进度', value: '82', unit: '%' }],
            commodities: ['WHEAT'],
            regions: ['黄淮海'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 89,
            downloadCount: 12,
        },
        {
            title: '制粉企业小麦收购价格周报 - 2025.12.01',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2025-12-01'),
            source: '中华粮网',
            summary:
                '面粉消费进入旺季，制粉企业开机率提升，小麦收购积极性提高，价格普涨0.01-0.02元/斤。',
            content: `# 制粉企业收购周报
旺季效应显现，**价格坚挺**。企业积极备货过节。`,
            keyPoints: [{ point: '价格普涨', sentiment: 'BULLISH', confidence: 90 }],
            prediction: { direction: 'BULLISH', timeframe: 'SHORT', logic: '春节备货需求。' },
            dataPoints: [{ metric: '收购均价', value: '1.55', unit: '元/斤' }],
            commodities: ['WHEAT'],
            regions: ['河北', '山东'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 110,
            downloadCount: 15,
        },
        {
            title: '2026年小麦最低收购价政策分析',
            reportType: ReportType.POLICY,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2025-10-10'),
            source: '发改委',
            summary:
                '发改委公布2026年生产的小麦（三等）最低收购价为1.19元/斤，较上年持平。政策信号明确：稳口粮不仅是稳面积，也是稳价格预期。',
            content: `# 最低收购价政策公布
价格**持平**，符合市场预期。主要是为了稳定种植收益，保障口粮安全。`,
            keyPoints: [{ point: '最低收购价持平', sentiment: 'NEUTRAL', confidence: 100 }],
            prediction: { direction: 'STABLE', timeframe: 'LONG', logic: '政策托底。' },
            dataPoints: [{ metric: '最低收购价', value: '1.19', unit: '元/斤' }],
            commodities: ['WHEAT'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 300,
            downloadCount: 50,
        },
        {
            title: '政策性小麦库存拍卖情况与成交分析',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2026-01-10'),
            source: '交易中心',
            summary:
                '本周投放最低收购价小麦100万吨，成交率25%，成交均价2450元/吨。饲用替代优势丧失，主要是面粉厂参拍。',
            content: `# 政策粮拍卖周报
饲用需求退出，仅剩**刚需制粉**采购，成交一般。`,
            keyPoints: [{ point: '成交率25%', sentiment: 'NEUTRAL', confidence: 90 }],
            prediction: { direction: 'STABLE', timeframe: 'SHORT', logic: '供需平衡。' },
            dataPoints: [{ metric: '成交均价', value: '2450', unit: '元/吨' }],
            commodities: ['WHEAT'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 98,
            downloadCount: 8,
        },

        // --- 稻谷 (RICE) 3篇 ---
        {
            title: '南方中晚籼稻集中上市，价格稳中偏硬',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2025-11-15'),
            source: '中国稻米网',
            summary:
                '江西、湖南中晚籼稻集中上市，米企入市积极。受托市启动预期支撑，价格表现坚挺，部分地区高于托市价。',
            content: `# 中晚籼稻上市快报
价格**稳中偏强**，优质优价明显。托市政策托底作用强。`,
            keyPoints: [{ point: '价格坚挺', sentiment: 'BULLISH', confidence: 85 }],
            prediction: { direction: 'STABLE', timeframe: 'SHORT', logic: '托市支撑。' },
            dataPoints: [{ metric: '收购价', value: '1.38', unit: '元/斤' }],
            commodities: ['RICE'],
            regions: ['南方', '江西'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 130,
            downloadCount: 10,
        },
        {
            title: '2025年全国稻谷产量预测',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.ANNUAL,
            publishDate: new Date('2025-12-05'),
            source: '统计局',
            summary:
                '预计2025年全国稻谷总产量2.08亿吨，同比略减。主要是由于南方双季稻种植面积小幅下降，但单产保持稳定。',
            content: `# 稻谷产量预测
总产**微减**，口粮绝对安全。结构性矛盾依然存在（籼强粳弱）。`,
            keyPoints: [{ point: '产量微降', sentiment: 'NEUTRAL', confidence: 95 }],
            prediction: { direction: 'STABLE', timeframe: 'LONG', logic: '供需宽松。' },
            dataPoints: [{ metric: '总产量', value: '2.08', unit: '亿吨' }],
            commodities: ['RICE'],
            regions: ['全国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 210,
            downloadCount: 25,
        },
        {
            title: '国际大米市场价格波动对国内的影响',
            reportType: ReportType.RESEARCH,
            reportPeriod: ReportPeriod.ADHOC,
            publishDate: new Date('2026-01-20'),
            source: '海关总署',
            summary:
                '印度放松大米出口限制，国际米价回落。由于国内外价差缩小，预计2026年一季度大米进口量将有所减少。',
            content: `# 国际米价影响分析
国际价格回落，**进口优势减弱**。利好国内稻谷去库存。`,
            keyPoints: [{ point: '进口优势减弱', sentiment: 'BULLISH', confidence: 80 }],
            prediction: { direction: 'STABLE', timeframe: 'MEDIUM', logic: '外部冲击减小。' },
            dataPoints: [{ metric: '国际米价跌幅', value: '5', unit: '%' }],
            commodities: ['RICE'],
            regions: ['全球', '亚洲'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 305,
            downloadCount: 45,
        },

        // --- 大豆 (SOYBEAN) 3篇 ---
        {
            title: '中国大豆进口与压榨月报 - 2025年11月',
            reportType: ReportType.INDUSTRY,
            reportPeriod: ReportPeriod.MONTHLY,
            publishDate: new Date('2025-12-05'),
            source: '汇易咨询',
            summary:
                '11月大豆到港量庞大，油厂开机率保持高位，豆粕库存快速累积。豆油需求进入旺季但受棕榈油价差压制。',
            content: `# 大豆进口月报
到港量大，**库存累积**。压榨利润缩水。`,
            keyPoints: [
                { point: '到港量创新高', sentiment: 'BEARISH', confidence: 95 },
                { point: '豆粕累库', sentiment: 'BEARISH', confidence: 90 },
            ],
            prediction: { direction: 'BEARISH', timeframe: 'SHORT', logic: '供应过剩。' },
            dataPoints: [{ metric: '到港量', value: '920', unit: '万吨' }],
            commodities: ['SOYBEAN', 'SOYBEAN_MEAL'],
            regions: ['沿海'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 405,
            downloadCount: 98,
        },
        {
            title: '豆粕现货基差走势分析',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2026-01-12'),
            source: '天下粮仓',
            summary:
                '华东地区豆粕基差持续走弱，现货价格跌破3000元/吨关口。饲料厂节前备货基本结束，成交清淡。',
            content: `# 豆粕基差分析
基差**走弱**，现货价格承压。节前备货已接近尾声。`,
            keyPoints: [{ point: '基差走弱', sentiment: 'BEARISH', confidence: 90 }],
            prediction: { direction: 'BEARISH', timeframe: 'SHORT', logic: '需求已过。' },
            dataPoints: [{ metric: '现货价格', value: '2980', unit: '元/吨' }],
            commodities: ['SOYBEAN_MEAL'],
            regions: ['华东'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 155,
            downloadCount: 10,
        },
        {
            title: '美豆出口销售数据解读',
            reportType: ReportType.MARKET,
            reportPeriod: ReportPeriod.WEEKLY,
            publishDate: new Date('2026-01-18'),
            source: 'USDA',
            summary:
                'USDA最新数据显示，美豆周度出口销售净增80万吨，符合预期。中国依然是最大买家，由于巴西大豆即将上市，美豆销售窗口期即将关闭。',
            content: `# USDA 出口销售报告
销售数据中规中矩，窗口期**即将关闭**。市场焦点转向南美天气。`,
            keyPoints: [{ point: '销售符合预期', sentiment: 'NEUTRAL', confidence: 85 }],
            prediction: { direction: 'VOLATILE', timeframe: 'SHORT', logic: '南美天气市。' },
            dataPoints: [{ metric: '出口销售', value: '80', unit: '万吨' }],
            commodities: ['SOYBEAN'],
            regions: ['美国'],
            reviewStatus: ReviewStatus.APPROVED,
            viewCount: 220,
            downloadCount: 18,
        },
    ];

    for (const reportData of reports) {
        const periodType = mapReportPeriodToKnowledgePeriodType(reportData.reportPeriod);
        const knowledgeStatus = mapReviewStatusToKnowledgeStatus(reportData.reviewStatus);
        const periodKey = toPeriodKey(reportData.publishDate, periodType);

        // 直接创建 KnowledgeItem（新架构，不经过 MarketIntel/ResearchReport）
        const knowledgeItem = await prisma.knowledgeItem.create({
            data: {
                type: KnowledgeType.RESEARCH,
                title: reportData.title,
                contentFormat: KnowledgeContentFormat.MARKDOWN,
                contentPlain: reportData.content,
                contentRich: reportData.content,
                sourceType: reportData.source || 'INTERNAL_REPORT',
                publishAt: reportData.publishDate,
                effectiveAt: reportData.publishDate,
                periodType,
                periodKey,
                commodities: reportData.commodities,
                region: reportData.regions,
                status: knowledgeStatus,
                authorId: testUser.id,
                viewCount: reportData.viewCount,
                downloadCount: reportData.downloadCount,
            },
        });

        // 创建 KnowledgeAnalysis
        await prisma.knowledgeAnalysis.create({
            data: {
                knowledgeId: knowledgeItem.id,
                summary: reportData.summary,
                reportType: reportData.reportType,
                reportPeriod: reportData.reportPeriod,
                keyPoints: reportData.keyPoints ?? undefined,
                prediction: reportData.prediction ?? undefined,
                dataPoints: reportData.dataPoints ?? undefined,
                tags: reportData.commodities,
            },
        });

        console.log(`   ✅ 创建研报: ${reportData.title}`);
    }

    console.log(`\n✅ 成功创建 ${reports.length} 条研报测试数据 (新架构: 直接写入 KnowledgeItem)`);
}

// Helper Functions

function mapReportPeriodToKnowledgePeriodType(reportPeriod: ReportPeriod): KnowledgePeriodType {
    if (reportPeriod === ReportPeriod.DAILY) return KnowledgePeriodType.DAY;
    if (reportPeriod === ReportPeriod.WEEKLY) return KnowledgePeriodType.WEEK;
    if (reportPeriod === ReportPeriod.MONTHLY) return KnowledgePeriodType.MONTH;
    if (reportPeriod === ReportPeriod.QUARTERLY) return KnowledgePeriodType.QUARTER;
    if (reportPeriod === ReportPeriod.ANNUAL) return KnowledgePeriodType.YEAR;
    return KnowledgePeriodType.ADHOC;
}

function mapReviewStatusToKnowledgeStatus(reviewStatus: ReviewStatus): KnowledgeStatus {
    if (reviewStatus === ReviewStatus.APPROVED) return KnowledgeStatus.PUBLISHED;
    if (reviewStatus === ReviewStatus.REJECTED) return KnowledgeStatus.REJECTED;
    if (reviewStatus === ReviewStatus.ARCHIVED) return KnowledgeStatus.ARCHIVED;
    return KnowledgeStatus.PENDING_REVIEW;
}

function toPeriodKey(date: Date, periodType: KnowledgePeriodType): string {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${d.getUTCDate()}`.padStart(2, '0');

    if (periodType === KnowledgePeriodType.DAY) return `${year}-${month}-${day}`;
    if (periodType === KnowledgePeriodType.MONTH) return `${year}-${month}`;
    if (periodType === KnowledgePeriodType.YEAR) return `${year}`;
    if (periodType === KnowledgePeriodType.WEEK) {
        const week = getIsoWeek(d);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }
    if (periodType === KnowledgePeriodType.QUARTER) {
        const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
        return `${year}-Q${quarter}`;
    }
    return `${year}-${month}-${day}`;
}

function getIsoWeek(date: Date): number {
    const tmp = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

main()
    .catch((e) => {
        console.error('❌ 研报数据播种失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

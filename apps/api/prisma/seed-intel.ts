/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 辅助函数：生成随机日期
function randomDate(daysAgo: number): Date {
    const now = new Date();
    const offset = Math.floor(Math.random() * daysAgo);
    return new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
}

// 辅助函数：随机选择
function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// 事件类型配置
const EVENT_TYPES = [
    { code: 'PRICE_CHANGE', name: '价格变动', category: 'supply', icon: 'DollarOutlined', color: '#1890ff' },
    { code: 'SUPPLY_CHANGE', name: '供应变化', category: 'supply', icon: 'ShopOutlined', color: '#52c41a' },
    { code: 'DEMAND_SHIFT', name: '需求变化', category: 'demand', icon: 'RiseOutlined', color: '#faad14' },
    { code: 'POLICY_UPDATE', name: '政策变动', category: 'policy', icon: 'FileTextOutlined', color: '#722ed1' },
    { code: 'ENTERPRISE_ACTION', name: '企业动态', category: 'supply', icon: 'BankOutlined', color: '#13c2c2' },
    { code: 'WEATHER_IMPACT', name: '天气影响', category: 'weather', icon: 'CloudOutlined', color: '#eb2f96' },
    { code: 'LOGISTICS_INFO', name: '物流动态', category: 'supply', icon: 'CarOutlined', color: '#fa8c16' },
];

// 洞察类型配置
const INSIGHT_TYPES = [
    { code: 'FORECAST', name: '后市预判', category: 'forecast', icon: 'LineChartOutlined', color: '#1890ff' },
    { code: 'SUPPLY_ANALYSIS', name: '供给分析', category: 'analysis', icon: 'AreaChartOutlined', color: '#52c41a' },
    { code: 'DEMAND_ANALYSIS', name: '需求分析', category: 'analysis', icon: 'BarChartOutlined', color: '#faad14' },
    { code: 'MARKET_LOGIC', name: '市场逻辑', category: 'logic', icon: 'NodeIndexOutlined', color: '#722ed1' },
    { code: 'DATA_HIGHLIGHT', name: '数据亮点', category: 'data', icon: 'HighlightOutlined', color: '#13c2c2' },
];

// 模拟情报原始内容
const INTEL_TEMPLATES = [
    {
        location: '锦州港',
        region: ['辽宁省', '锦州市'],
        content: `【锦州港玉米行情日报】今日港口玉米收购价维持在2350元/吨，较昨日上涨20元。到港车辆约85车，贸易商收购积极性较高。水分要求在14%以内，容重720g/L。当前港口库存约42万吨，较上周增加3万吨。后市观点：短期内价格有望继续上涨，建议关注东北产区上量节奏。`,
        events: [
            { subject: '锦州港', action: '价格上涨', content: '玉米收购价上涨20元至2350元/吨', impact: '利好收购方', sentiment: 'bullish' },
        ],
        insights: [
            { title: '短期看涨', content: '预计短期内价格有望继续上涨', direction: 'up', timeframe: 'short' },
        ],
    },
    {
        location: '大连港',
        region: ['辽宁省', '大连市'],
        content: `【大连港早间快报】今日大连港玉米平舱价2340元/吨，持平。到港卡车约62车，较昨日减少18车。贸易商报价稳定，采购需求一般。港口作业正常，预计本周发运南方5船。市场心态：北方港口价格短期稳定，关注南方接货节奏。`,
        events: [
            { subject: '大连港', action: '到港减少', content: '到港车辆减少18车至62车', impact: '库存压力缓解', sentiment: 'neutral' },
        ],
        insights: [
            { title: '价格稳定预期', content: '北方港口价格短期维持稳定', direction: 'stable', timeframe: 'short' },
        ],
    },
    {
        location: '梅花味精（通辽）',
        region: ['内蒙古', '通辽市'],
        content: `【深加工早报】梅花味精通辽厂今日挂牌价2760元/吨，较上周下调20元。厂门收购量约450车，较昨日增加50车。执行水分15%，不限量收购。库存天数约12天。后市看法：东北深加工备货较为充裕，短期价格下行压力较大。`,
        events: [
            { subject: '梅花味精', action: '降价收购', content: '挂牌价下调20元至2760元/吨', impact: '压制当地价格', sentiment: 'bearish' },
        ],
        insights: [
            { title: '短期承压', content: '深加工备货充裕，短期价格下行压力较大', direction: 'down', timeframe: 'short' },
        ],
    },
    {
        location: '象屿生化（绥化）',
        region: ['黑龙江省', '绥化市'],
        content: `【企业动态】象屿生化绥化厂今日玉米收购价2700元/吨，持平上一交易日。日收购量约380车，厂门排队情况正常。库存水平中等，预计维持当前收购节奏。`,
        events: [
            { subject: '象屿生化', action: '维持收购', content: '收购价2700元/吨持稳', impact: '稳定当地价格', sentiment: 'neutral' },
        ],
        insights: [],
    },
    {
        location: '中储粮锦州库',
        region: ['辽宁省', '锦州市'],
        content: `【轮换公告】中储粮锦州直属库公告：自即日起开始2024年度玉米轮换收购，挂牌价2320元/吨。质量标准：水分不超过14%，容重不低于685g/L，杂质不超过1%。计划收购5万吨，收购期至3月底。`,
        events: [
            { subject: '中储粮锦州库', action: '开始收购', content: '启动2024年度玉米轮换收购', impact: '增加区域需求', sentiment: 'bullish' },
        ],
        insights: [
            { title: '需求增量', content: '中储粮轮换收购将增加区域需求支撑', direction: 'up', timeframe: 'medium' },
        ],
    },
    {
        location: '山东潍坊',
        region: ['山东省', '潍坊市'],
        content: `【销区日报】山东潍坊地区玉米到站价2450元/吨，较昨日上涨10元。饲料企业补库积极，采购量明显增加。贸易商报价坚挺，后期看涨心态较浓。本周预计到货3列火车皮，供应偏紧。`,
        events: [
            { subject: '潍坊饲料企业', action: '补库增加', content: '饲料企业采购量明显增加', impact: '提振需求', sentiment: 'bullish' },
        ],
        insights: [
            { title: '销区看涨', content: '销区补库积极，后期价格有望继续走高', direction: 'up', timeframe: 'short' },
        ],
    },
    {
        location: '广东黄埔港',
        region: ['广东省', '广州市'],
        content: `【南方港口】黄埔港内贸玉米报价2520元/吨，较上日持平。港口库存约28万吨，较上周下降2万吨。采购商拿货一般，多观望为主。进口玉米到港报价2480元/吨，与内贸玉米价差缩小。`,
        events: [
            { subject: '黄埔港', action: '库存下降', content: '港口库存较上周下降2万吨', impact: '有利于价格', sentiment: 'bullish' },
        ],
        insights: [
            { title: '内外价差收窄', content: '进口玉米与内贸价差缩小，关注替代效应', direction: 'stable', timeframe: 'medium' },
        ],
    },
    {
        location: '国粮局官网',
        region: ['全国'],
        content: `【政策文件】国家粮食和物资储备局发布《关于加强粮食收购环节监管的通知》，要求各地严格执行政策性粮食收购质量标准，保护种粮农民利益。通知强调对以次充好、压级压价等违规行为加大处罚力度。`,
        events: [
            { subject: '国粮局', action: '发布新政', content: '发布加强粮食收购监管通知', impact: '规范市场秩序', sentiment: 'neutral' },
        ],
        insights: [
            { title: '政策利好农户', content: '监管加强将有利于保护种粮农民利益', direction: 'stable', timeframe: 'long' },
        ],
    },
    {
        location: 'XX期货研究院',
        region: ['全国'],
        content: `【研报摘要】2024年一季度玉米市场回顾：受东北产区上量节奏影响，1月份玉米价格整体承压运行。预计2月份随着农户惜售增强及下游补库需求启动，价格有望企稳反弹。核心观点：关注春节前后贸易商建库节奏。`,
        events: [],
        insights: [
            { title: 'Q1市场展望', content: '预计2月份价格企稳反弹，关注春节前后贸易商建库', direction: 'up', timeframe: 'medium' },
        ],
    },
    {
        location: '吉林长春',
        region: ['吉林省', '长春市'],
        content: `【产区快讯】长春地区农户卖粮积极性一般，多数农户惜售等价。当地收购商挂牌价2280元/吨，较上周下调10元。烘干塔开工率约60%，低于去年同期。预计节前集中售粮压力有限。`,
        events: [
            { subject: '长春收购商', action: '下调挂牌', content: '挂牌价下调10元至2280元/吨', impact: '压制收购价', sentiment: 'bearish' },
        ],
        insights: [
            { title: '农户惜售', content: '农户惜售心态浓厚，节前售粮压力有限', direction: 'stable', timeframe: 'short' },
        ],
    },
];

// 品种列表
const COMMODITIES = ['玉米', '大豆', '小麦', '高粱', '豆粕'];

// 内容类型
const CONTENT_TYPES = ['DAILY_REPORT', 'RESEARCH_REPORT', 'POLICY_DOC'];

// 信源类型
const SOURCE_TYPES = ['FIRST_LINE', 'COMPETITOR', 'OFFICIAL', 'RESEARCH_INST', 'MEDIA'];

async function main() {
    console.log('🌱 开始播种情报测试数据 (Seed Intel)...');

    // 1. 检查或创建测试用户
    let testUser = await prisma.user.findFirst({ where: { username: 'test_user' } });
    if (!testUser) {
        console.log('   - 创建测试用户...');
        testUser = await prisma.user.create({
            data: {
                username: 'test_user',
                email: 'test@example.com',
                name: '测试用户',
            },
        });
    }
    console.log(`   ✅ 测试用户: ${testUser.username}`);

    // 2. 创建事件类型配置
    console.log('   - 创建事件类型配置...');
    const eventTypeMap: Record<string, string> = {};
    for (const et of EVENT_TYPES) {
        const existing = await prisma.eventTypeConfig.findUnique({ where: { code: et.code } });
        if (existing) {
            eventTypeMap[et.code] = existing.id;
        } else {
            const created = await prisma.eventTypeConfig.create({ data: et });
            eventTypeMap[et.code] = created.id;
        }
    }
    console.log(`   ✅ 事件类型: ${Object.keys(eventTypeMap).length}个`);

    // 3. 创建洞察类型配置
    console.log('   - 创建洞察类型配置...');
    const insightTypeMap: Record<string, string> = {};
    for (const it of INSIGHT_TYPES) {
        const existing = await prisma.insightTypeConfig.findUnique({ where: { code: it.code } });
        if (existing) {
            insightTypeMap[it.code] = existing.id;
        } else {
            const created = await prisma.insightTypeConfig.create({ data: it });
            insightTypeMap[it.code] = created.id;
        }
    }
    console.log(`   ✅ 洞察类型: ${Object.keys(insightTypeMap).length}个`);

    // 4. 生成情报数据
    console.log('   - 开始生成情报数据...');
    let intelCount = 0;
    let eventCount = 0;
    let insightCount = 0;

    // 生成50条情报记录
    for (let i = 0; i < 50; i++) {
        const template = randomPick(INTEL_TEMPLATES);
        const daysAgo = Math.floor(Math.random() * 30); // 最近30天
        const effectiveTime = randomDate(daysAgo);
        const contentType = randomPick(CONTENT_TYPES) as 'DAILY_REPORT' | 'RESEARCH_REPORT' | 'POLICY_DOC';
        const sourceType = randomPick(SOURCE_TYPES) as 'FIRST_LINE' | 'COMPETITOR' | 'OFFICIAL' | 'RESEARCH_INST' | 'MEDIA';

        // 创建 MarketIntel
        const intel = await prisma.marketIntel.create({
            data: {
                category: 'B_SEMI_STRUCTURED',
                sourceType,
                effectiveTime,
                location: template.location,
                region: template.region,
                rawContent: template.content,
                summary: template.content.substring(0, 100) + '...',
                contentType,
                completenessScore: 60 + Math.floor(Math.random() * 40),
                scarcityScore: 50 + Math.floor(Math.random() * 50),
                validationScore: 70 + Math.floor(Math.random() * 30),
                totalScore: 60 + Math.floor(Math.random() * 40),
                isFlagged: Math.random() < 0.1, // 10% flagged
                authorId: testUser.id,
            },
        });
        intelCount++;

        // 创建关联事件
        for (const evt of template.events) {
            const eventTypeCode = randomPick(['PRICE_CHANGE', 'SUPPLY_CHANGE', 'ENTERPRISE_ACTION', 'DEMAND_SHIFT']);
            await prisma.marketEvent.create({
                data: {
                    intelId: intel.id,
                    eventTypeId: eventTypeMap[eventTypeCode],
                    sourceText: evt.content,
                    subject: evt.subject,
                    action: evt.action,
                    content: evt.content,
                    impact: evt.impact,
                    impactLevel: randomPick(['HIGH', 'MEDIUM', 'LOW']),
                    sentiment: evt.sentiment,
                    commodity: randomPick(COMMODITIES),
                    eventDate: effectiveTime,
                },
            });
            eventCount++;
        }

        // 创建关联洞察
        for (const ins of template.insights) {
            const insightTypeCode = randomPick(['FORECAST', 'SUPPLY_ANALYSIS', 'MARKET_LOGIC']);
            await prisma.marketInsight.create({
                data: {
                    intelId: intel.id,
                    insightTypeId: insightTypeMap[insightTypeCode],
                    sourceText: ins.content,
                    title: ins.title,
                    content: ins.content,
                    direction: ins.direction,
                    timeframe: ins.timeframe,
                    confidence: 60 + Math.floor(Math.random() * 40),
                    factors: ['价格', '供需', '政策'].slice(0, Math.floor(Math.random() * 3) + 1),
                    commodity: randomPick(COMMODITIES),
                },
            });
            insightCount++;
        }
    }

    console.log(`   ✅ 创建情报: ${intelCount}条`);
    console.log(`   ✅ 创建事件: ${eventCount}条`);
    console.log(`   ✅ 创建洞察: ${insightCount}条`);

    console.log('🎉 情报测试数据 Seed 完成。');
}

main()
    .catch((e) => {
        console.error('❌ Seed 失败:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

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

// 事件类型配置 (引用自 seed-event-types.ts 的标准定义，此处仅保留 Codes 用于生成数据)
const EVENT_TYPE_CODES = [
    'PRICE_CHANGE',
    'SUPPLY_SHOCK',
    'DEMAND_SHIFT',
    'POLICY_UPDATE',
    'ENTERPRISE_ACTION',
    'WEATHER_IMPACT',
    'LOGISTICS_ISSUE'
];

// 洞察类型配置 (Enriched)
const INSIGHT_TYPES = [
    {
        code: 'FORECAST',
        name: '后市预判',
        category: 'Forecast',
        description: '对未来价格趋势或市场走向的预测',
        icon: 'LineChartOutlined',
        color: '#1890ff'
    },
    {
        code: 'SUPPLY_ANALYSIS',
        name: '供给分析',
        category: 'Analysis',
        description: '对供应端（产量、库存、发运）的深度剖析',
        icon: 'AreaChartOutlined',
        color: '#52c41a'
    },
    {
        code: 'DEMAND_ANALYSIS',
        name: '需求分析',
        category: 'Analysis',
        description: '对需求端（采购、消费、替代）的深度剖析',
        icon: 'BarChartOutlined',
        color: '#faad14'
    },
    {
        code: 'MARKET_LOGIC',
        name: '市场逻辑',
        category: 'Logic',
        description: '梳理支撑当前行情的核心逻辑链条',
        icon: 'NodeIndexOutlined',
        color: '#722ed1'
    },
    {
        code: 'DATA_HIGHLIGHT',
        name: '数据亮点',
        category: 'Data',
        description: '研报中提及的关键数据指标',
        icon: 'HighlightOutlined',
        color: '#13c2c2'
    },
];

// 模拟情报原始内容 (增强版：包含 AI 分析字段)
const INTEL_TEMPLATES = [
    {
        location: '锦州港',
        region: ['辽宁省', '锦州市'],
        content: `【锦州港玉米行情日报】今日港口玉米收购价维持在2350元/吨，较昨日上涨20元。到港车辆约85车，贸易商收购积极性较高。水分要求在14%以内，容重720g/L。当前港口库存约42万吨，较上周增加3万吨。后市观点：短期内价格有望继续上涨，建议关注东北产区上量节奏。`,
        events: [
            { subject: '锦州港', action: '价格上涨', content: '玉米收购价上涨20元至2350元/吨', impact: '利好收购方', sentiment: 'BULLISH' },
        ],
        insights: [
            { title: '短期看涨', content: '预计短期内价格有望继续上涨', direction: 'BULLISH', timeframe: 'SHORT', confidence: 85 },
        ],
        // 新增：价格点数据
        pricePoints: [
            { location: '锦州港', price: 2350, change: 20, unit: '元/吨', commodity: 'CORN', note: '收购价' },
        ],
        // 新增：市场心态
        marketSentiment: {
            overall: 'BULLISH',
            score: 65,
            traders: '贸易商收购积极性较高，看涨心态明显',
            summary: '港口收购活跃，市场情绪偏乐观',
        },
        // 新增：后市预判
        forecast: {
            shortTerm: '短期内价格有望继续上涨',
            riskLevel: 'low',
            keyFactors: ['到港量', '库存变化', '下游需求'],
        },
    },
    {
        location: '大连港',
        region: ['辽宁省', '大连市'],
        content: `【大连港早间快报】今日大连港玉米平舱价2340元/吨，持平。到港卡车约62车，较昨日减少18车。贸易商报价稳定，采购需求一般。港口作业正常，预计本周发运南方5船。市场心态：北方港口价格短期稳定，关注南方接货节奏。`,
        events: [
            { subject: '大连港', action: '到港减少', content: '到港车辆减少18车至62车', impact: '库存压力缓解', sentiment: 'neutral' },
        ],
        insights: [
            { title: '价格稳定预期', content: '北方港口价格短期维持稳定', direction: 'Neutral', timeframe: 'short', confidence: 75 },
        ],
        pricePoints: [
            { location: '大连港', price: 2340, change: 0, unit: '元/吨', commodity: '玉米', note: '平舱价' },
        ],
        marketSentiment: {
            overall: 'neutral',
            score: 5,
            traders: '贸易商报价稳定，观望情绪浓厚',
            summary: '市场心态平稳，以观望为主',
        },
        forecast: {
            shortTerm: '短期价格稳定，关注南方接货节奏',
            riskLevel: 'low',
        },
    },
    {
        location: '梅花味精（通辽）',
        region: ['内蒙古', '通辽市'],
        content: `【深加工早报】梅花味精通辽厂今日挂牌价2760元/吨，较上周下调20元。厂门收购量约450车，较昨日增加50车。执行水分15%，不限量收购。库存天数约12天。后市看法：东北深加工备货较为充裕，短期价格下行压力较大。`,
        events: [
            { subject: '梅花味精', action: '降价收购', content: '挂牌价下调20元至2760元/吨', impact: '压制当地价格', sentiment: 'bearish' },
        ],
        insights: [
            { title: '短期承压', content: '深加工备货充裕，短期价格下行压力较大', direction: 'Bearish', timeframe: 'short', confidence: 80 },
        ],
        pricePoints: [
            { location: '梅花味精（通辽）', price: 2760, change: -20, unit: '元/吨', commodity: 'CORN', note: '挂牌价' },
        ],
        marketSentiment: {
            overall: 'BEARISH',
            score: -35,
            processors: '深加工企业库存充裕，采购意愿下降',
            farmers: '农户卖粮积极性上升',
            summary: '供应充足，价格承压',
        },
        forecast: {
            shortTerm: '短期价格下行压力较大',
            mediumTerm: '中期需关注下游消费启动情况',
            riskLevel: 'medium',
            keyFactors: ['库存天数', '收购量', '下游开工率'],
        },
    },
    {
        location: '象屿生化（绥化）',
        region: ['黑龙江省', '绥化市'],
        content: `【企业动态】象屿生化绥化厂今日玉米收购价2700元/吨，持平上一交易日。日收购量约380车，厂门排队情况正常。库存水平中等，预计维持当前收购节奏。`,
        events: [
            { subject: '象屿生化', action: '维持收购', content: '收购价2700元/吨持稳', impact: '稳定当地价格', sentiment: 'neutral' },
        ],
        insights: [],
        pricePoints: [
            { location: '象屿生化（绥化）', price: 2700, change: 0, unit: '元/吨', commodity: 'CORN', note: '收购价' },
        ],
        marketSentiment: {
            overall: 'NEUTRAL',
            score: 0,
            summary: '市场平稳运行',
        },
        forecast: null,
    },
    {
        location: '中储粮锦州库',
        region: ['辽宁省', '锦州市'],
        content: `【轮换公告】中储粮锦州直属库公告：自即日起开始2024年度玉米轮换收购，挂牌价2320元/吨。质量标准：水分不超过14%，容重不低于685g/L，杂质不超过1%。计划收购5万吨，收购期至3月底。`,
        events: [
            { subject: '中储粮锦州库', action: '开始收购', content: '启动2024年度玉米轮换收购', impact: '增加区域需求', sentiment: 'bullish' },
        ],
        insights: [
            { title: '需求增量', content: '中储粮轮换收购将增加区域需求支撑', direction: 'Bullish', timeframe: 'medium', confidence: 90 },
        ],
        pricePoints: [
            { location: '中储粮锦州库', price: 2320, change: null, unit: '元/吨', commodity: 'CORN', note: '轮换收购价' },
        ],
        marketSentiment: {
            overall: 'BULLISH',
            score: 45,
            traders: '贸易商对政策性收购持积极态度',
            summary: '政策性收购启动，提振市场信心',
        },
        forecast: {
            shortTerm: '短期区域价格有支撑',
            mediumTerm: '收购期内价格稳中偏强',
            riskLevel: 'low',
            keyFactors: ['收购进度', '质量标准', '市场供应'],
        },
    },
    {
        location: '山东潍坊',
        region: ['山东省', '潍坊市'],
        content: `【销区日报】山东潍坊地区玉米到站价2450元/吨，较昨日上涨10元。饲料企业补库积极，采购量明显增加。贸易商报价坚挺，后期看涨心态较浓。本周预计到货3列火车皮，供应偏紧。`,
        events: [
            { subject: '潍坊饲料企业', action: '补库增加', content: '饲料企业采购量明显增加', impact: '提振需求', sentiment: 'bullish' },
        ],
        insights: [
            { title: '销区看涨', content: '销区补库积极，后期价格有望继续走高', direction: 'Bullish', timeframe: 'short', confidence: 82 },
        ],
        pricePoints: [
            { location: '山东潍坊', price: 2450, change: 10, unit: '元/吨', commodity: 'CORN', note: '到站价' },
        ],
        marketSentiment: {
            overall: 'BULLISH',
            score: 55,
            traders: '贸易商报价坚挺，看涨心态较浓',
            processors: '饲料企业补库积极',
            summary: '销区需求旺盛，看涨氛围浓厚',
        },
        forecast: {
            shortTerm: '后期价格有望继续走高',
            riskLevel: 'low',
            keyFactors: ['到货量', '饲料需求', '库存水平'],
        },
    },
    {
        location: '广东黄埔港',
        region: ['广东省', '广州市'],
        content: `【南方港口】黄埔港内贸玉米报价2520元/吨，较上日持平。港口库存约28万吨，较上周下降2万吨。采购商拿货一般，多观望为主。进口玉米到港报价2480元/吨，与内贸玉米价差缩小。`,
        events: [
            { subject: '黄埔港', action: '库存下降', content: '港口库存较上周下降2万吨', impact: '有利于价格', sentiment: 'bullish' },
        ],
        insights: [
            { title: '内外价差收窄', content: '进口玉米与内贸价差缩小，关注替代效应', direction: 'Neutral', timeframe: 'medium', confidence: 70 },
        ],
        pricePoints: [
            { location: '黄埔港(内贸)', price: 2520, change: 0, unit: '元/吨', commodity: 'CORN', note: '内贸价' },
            { location: '黄埔港(进口)', price: 2480, change: null, unit: '元/吨', commodity: 'CORN', note: '进口到港价' },
        ],
        marketSentiment: {
            overall: 'NEUTRAL',
            score: 10,
            traders: '采购商多观望为主',
            summary: '南方港口供需平衡，价格稳定',
        },
        forecast: {
            shortTerm: '短期价格稳定',
            mediumTerm: '关注进口替代效应',
            riskLevel: 'medium',
            keyFactors: ['进口到港量', '内外价差', '下游需求'],
        },
    },
    {
        location: '国粮局官网',
        region: ['全国'],
        content: `【政策文件】国家粮食和物资储备局发布《关于加强粮食收购环节监管的通知》，要求各地严格执行政策性粮食收购质量标准，保护种粮农民利益。通知强调对以次充好、压级压价等违规行为加大处罚力度。`,
        events: [
            { subject: '国粮局', action: '发布新政', content: '发布加强粮食收购监管通知', impact: '规范市场秩序', sentiment: 'neutral' },
        ],
        insights: [
            { title: '政策利好农户', content: '监管加强将有利于保护种粮农民利益', direction: 'Neutral', timeframe: 'long', confidence: 88 },
        ],
        pricePoints: [],
        marketSentiment: {
            overall: 'NEUTRAL',
            score: 15,
            farmers: '农户利益得到政策保护',
            summary: '政策环境向好，市场秩序规范',
        },
        forecast: {
            longTerm: '长期有利于市场健康发展',
            riskLevel: 'low',
        },
    },
    {
        location: 'XX期货研究院',
        region: ['全国'],
        content: `【研报摘要】2024年一季度玉米市场回顾：受东北产区上量节奏影响，1月份玉米价格整体承压运行。预计2月份随着农户惜售增强及下游补库需求启动，价格有望企稳反弹。核心观点：关注春节前后贸易商建库节奏。`,
        events: [],
        insights: [
            { title: 'Q1市场展望', content: '预计2月份价格企稳反弹，关注春节前后贸易商建库', direction: 'Bullish', timeframe: 'medium', confidence: 78 },
            { title: '供需格局', content: '东北产区上量节奏是当前主要影响因素', direction: 'Neutral', timeframe: 'short', confidence: 85 },
        ],
        pricePoints: [],
        marketSentiment: {
            overall: 'MIXED',
            score: 25,
            traders: '贸易商建库意愿逐步增强',
            farmers: '农户惜售情绪上升',
            summary: '市场分歧中偏乐观，关注节后走势',
        },
        forecast: {
            shortTerm: '1月份价格承压运行',
            mediumTerm: '2月份有望企稳反弹',
            riskLevel: 'medium',
            keyFactors: ['农户售粮节奏', '贸易商建库', '下游需求启动'],
        },
    },
    {
        location: '吉林长春',
        region: ['吉林省', '长春市'],
        content: `【产区快讯】长春地区农户卖粮积极性一般，多数农户惜售等价。当地收购商挂牌价2280元/吨，较上周下调10元。烘干塔开工率约60%，低于去年同期。预计节前集中售粮压力有限。`,
        events: [
            { subject: '长春收购商', action: '下调挂牌', content: '挂牌价下调10元至2280元/吨', impact: '压制收购价', sentiment: 'bearish' },
        ],
        insights: [
            { title: '农户惜售', content: '农户惜售心态浓厚，节前售粮压力有限', direction: 'Bullish', timeframe: 'short', confidence: 75 },
        ],
        pricePoints: [
            { location: '长春地区', price: 2280, change: -10, unit: '元/吨', commodity: 'CORN', note: '收购商挂牌价' },
        ],
        marketSentiment: {
            overall: 'MIXED',
            score: -5,
            traders: '收购商压价意愿明显',
            farmers: '农户惜售心态浓厚',
            summary: '产区购销博弈，价格小幅承压',
        },
        forecast: {
            shortTerm: '节前售粮压力有限',
            mediumTerm: '关注节后售粮高峰',
            riskLevel: 'medium',
            keyFactors: ['农户售粮节奏', '烘干塔开工', '收购价格'],
        },
    },
    // 新增：多价格点异动数据（用于测试 PriceAlertCard）
    {
        location: '东北产区',
        region: ['辽宁省', '吉林省', '黑龙江省'],
        content: `【东北产区价格异动】今日东北主产区玉米价格普遍上涨，锦州港涨15元至2355元/吨，大连港涨20元至2360元/吨，营口港涨18元至2345元/吨。深加工企业同步提价，象屿生化涨25元，嘉吉涨20元，中粮涨15元。市场看涨情绪升温，贸易商建库意愿增强。`,
        events: [
            { subject: '东北产区', action: '集体涨价', content: '主产区价格普遍上涨15-25元', impact: '提振市场信心', sentiment: 'bullish' },
        ],
        insights: [
            { title: '涨价潮来袭', content: '产区和港口集体涨价，短期看涨', direction: 'Bullish', timeframe: 'short', confidence: 88 },
        ],
        pricePoints: [
            { location: '锦州港', price: 2355, change: 15, unit: '元/吨', commodity: 'CORN', note: '收购价' },
            { location: '大连港', price: 2360, change: 20, unit: '元/吨', commodity: 'CORN', note: '平舱价' },
            { location: '营口港', price: 2345, change: 18, unit: '元/吨', commodity: 'CORN', note: '收购价' },
            { location: '象屿生化', price: 2725, change: 25, unit: '元/吨', commodity: 'CORN', note: '挂牌价' },
            { location: '嘉吉生化', price: 2710, change: 20, unit: '元/吨', commodity: 'CORN', note: '挂牌价' },
            { location: '中粮生化', price: 2695, change: 15, unit: '元/吨', commodity: 'CORN', note: '挂牌价' },
        ],
        marketSentiment: {
            overall: 'BULLISH',
            score: 72,
            traders: '贸易商建库意愿明显增强',
            processors: '深加工同步提价抢粮',
            farmers: '农户惜售情绪加重',
            summary: '市场看涨情绪升温，多方抢粮',
        },
        forecast: {
            shortTerm: '短期价格继续上行',
            mediumTerm: '中期关注到港量变化',
            riskLevel: 'low',
            keyFactors: ['到港节奏', '深加工需求', '贸易商库存'],
        },
    },
    // 新增：纯洞察类数据（用于测试 MarketInsightCard）
    {
        location: '行业研究',
        region: ['全国'],
        content: `【市场深度分析】当前玉米市场呈现三大特征：一是产区惜售情绪浓厚，基层余粮约6成，高于去年同期；二是港口库存处于相对低位，对价格形成支撑；三是下游需求启动偏慢，饲料企业采购节奏放缓。综合来看，短期价格以稳为主，中期关注节后售粮节奏。`,
        events: [],
        insights: [
            { title: '基层余粮偏高', content: '产区基层余粮约6成，高于去年同期', direction: 'Bearish', timeframe: 'medium', confidence: 82, factors: ['余粮水平', '售粮节奏'] },
            { title: '港口库存偏低', content: '港口库存处于相对低位，对价格形成支撑', direction: 'Bullish', timeframe: 'short', confidence: 85, factors: ['库存', '到港量'] },
            { title: '需求启动偏慢', content: '下游需求启动偏慢，饲料企业采购节奏放缓', direction: 'Bearish', timeframe: 'short', confidence: 78, factors: ['饲料需求', '采购节奏'] },
        ],
        pricePoints: [],
        marketSentiment: {
            overall: 'MIXED',
            score: 5,
            traders: '贸易商持观望态度',
            processors: '饲料企业采购节奏放缓',
            farmers: '农户惜售情绪浓厚',
            summary: '多空因素交织，市场分歧明显',
        },
        forecast: {
            shortTerm: '短期价格以稳为主',
            mediumTerm: '中期关注节后售粮节奏',
            longTerm: '长期看供需格局改善',
            riskLevel: 'medium',
            keyFactors: ['基层售粮', '港口库存', '下游需求'],
        },
    },
];

// 品种列表
const COMMODITIES = ['CORN', 'SOYBEAN', 'WHEAT', 'SORGHUM', 'SOYBEAN_MEAL'];

// 内容类型
const CONTENT_TYPES = ['DAILY_REPORT', 'RESEARCH_REPORT', 'POLICY_DOC'];

// 信源类型
const SOURCE_TYPES = ['FIRST_LINE', 'COMPETITOR', 'OFFICIAL', 'RESEARCH_INST', 'MEDIA'];

async function main() {
    console.log('🌱 开始播种情报测试数据 (Seed Intel)...');

    // 1. 获取现有员工用户 (用于随机分配作者)
    const allUsers = await prisma.user.findMany({
        where: { status: 'ACTIVE' }
    });

    // 如果没有用户，创建一个兜底用户
    let defaultUser;
    if (allUsers.length === 0) {
        console.log('   - 未找到现有用户，创建测试用户...');
        defaultUser = await prisma.user.create({
            data: {
                username: 'test_user_' + Date.now(),
                email: `test_${Date.now()}@example.com`,
                name: '测试用户',
            },
        });
        allUsers.push(defaultUser);
    }

    // 清理旧的 Mock 数据 (可选，虽然现在也是随机ID，但为了保持整洁，可以清理特定标记的数据)
    // 但由于现在是用随机用户，不好精准定位“旧数据”，除非全量清除市场情报？
    // 或者我们只清除本次主要使用的几个用户的？
    // 简单起见，这里不进行全量清除，依靠 effectiveTime 倒序在前端展示最新数据。
    // 如果必须幂等，可以考虑清除所有 INTEL_SOURCE_TYPE 为 MOCK 的数据（如果支持），或者简单略过。
    // 鉴于用户刚才要求幂等，我们可以清除所有 category=B_SEMI_STRUCTURED 且 isFlagged=true (模拟的一部分特征) 或者...
    // 最好的办法： seed-intel 专门产生一批带有特殊标记的数据，或者清除所有 Intelligence。
    // 让我们清除所有 MarketIntel 数据作为重置 (开发环境通常可以接受)
    console.log('   - [Reset] 清除旧的情报数据...');
    await prisma.marketEvent.deleteMany({});
    await prisma.marketInsight.deleteMany({});
    await prisma.marketIntel.deleteMany({}); // Cloud be aggressive

    console.log(`   ✅ 加载潜在作报告人: ${allUsers.length} 人`);

    // 2. 创建洞察类型配置
    console.log('   - 创建洞察类型配置...');
    const insightTypeMap: Record<string, string> = {};
    for (const it of INSIGHT_TYPES) {
        // Upsert logic manually
        const existing = await prisma.insightTypeConfig.findUnique({ where: { code: it.code } });
        if (existing) {
            // Update description/category if needed
            await prisma.insightTypeConfig.update({
                where: { id: existing.id },
                data: {
                    name: it.name,
                    category: it.category,
                    description: it.description,
                    icon: it.icon,
                    color: it.color
                }
            });
            insightTypeMap[it.code] = existing.id;
        } else {
            const created = await prisma.insightTypeConfig.create({ data: it });
            insightTypeMap[it.code] = created.id;
        }
    }
    console.log(`   ✅ 洞察类型: ${Object.keys(insightTypeMap).length}个`);

    // 2.5 为 mock 数据准备事件类型 ID 映射
    // 注意：事件类型现在由 seed-event-types.ts 统一管理，这里只查 ID
    const eventTypeMap: Record<string, string> = {};
    for (const code of EVENT_TYPE_CODES) {
        const et = await prisma.eventTypeConfig.findUnique({ where: { code } });
        if (et) {
            eventTypeMap[code] = et.id;
        } else {
            console.warn(`⚠️ Warning: Event type ${code} not found in DB. Make sure seed-event-types.ts runs first.`);
        }
    }

    // 4. 生成情报数据
    console.log('   - 开始生成情报数据...');
    let intelCount = 0;
    let eventCount = 0;
    let insightCount = 0;

    // 生成100条情报记录
    for (let i = 0; i < 100; i++) {
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
                authorId: randomPick(allUsers).id, // [FIX] Random real user
            },
        });
        intelCount++;

        // 创建关联事件
        for (const evt of template.events) {
            // 使用新标准 Code
            const eventTypeCode = randomPick(['PRICE_CHANGE', 'SUPPLY_SHOCK', 'ENTERPRISE_ACTION', 'DEMAND_SHIFT']);
            if (eventTypeMap[eventTypeCode]) {
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

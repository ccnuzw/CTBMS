// Seed for related-analysis demo data (JS version to avoid ts-node dependency)
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const EVENT_TYPES = [
  { code: 'PRICE_CHANGE', name: '价格变动', category: 'supply', icon: 'DollarOutlined', color: '#1890ff' },
  { code: 'SUPPLY_CHANGE', name: '供应变化', category: 'supply', icon: 'ShopOutlined', color: '#52c41a' },
  { code: 'DEMAND_SHIFT', name: '需求变化', category: 'demand', icon: 'RiseOutlined', color: '#faad14' },
];

const INSIGHT_TYPES = [
  { code: 'FORECAST', name: '后市预判', category: 'forecast', icon: 'LineChartOutlined', color: '#1890ff' },
  { code: 'SUPPLY_ANALYSIS', name: '供给分析', category: 'analysis', icon: 'AreaChartOutlined', color: '#52c41a' },
];

function daysAgo(days) {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function ensureUser() {
  const existing = await prisma.user.findFirst({ where: { username: 'test_user' } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      username: 'test_user',
      email: 'test@example.com',
      name: '测试用户',
    },
  });
}

async function ensureEventTypes() {
  const map = {};
  for (const type of EVENT_TYPES) {
    const existing = await prisma.eventTypeConfig.findUnique({ where: { code: type.code } });
    const record = existing || (await prisma.eventTypeConfig.create({ data: type }));
    map[type.code] = record.id;
  }
  return map;
}

async function ensureInsightTypes() {
  const map = {};
  for (const type of INSIGHT_TYPES) {
    const existing = await prisma.insightTypeConfig.findUnique({ where: { code: type.code } });
    const record = existing || (await prisma.insightTypeConfig.create({ data: type }));
    map[type.code] = record.id;
  }
  return map;
}

async function createIntelBundle({
  authorId,
  eventTypeMap,
  insightTypeMap,
  payload,
}) {
  const intel = await prisma.marketIntel.create({
    data: {
      category: 'B_SEMI_STRUCTURED',
      sourceType: payload.sourceType,
      effectiveTime: payload.effectiveTime,
      location: payload.location,
      region: payload.region,
      rawContent: payload.rawContent,
      summary: payload.summary,
      contentType: payload.contentType,
      completenessScore: payload.totalScore - 10,
      scarcityScore: payload.totalScore - 5,
      validationScore: payload.totalScore - 8,
      totalScore: payload.totalScore,
      isFlagged: payload.isFlagged || false,
      authorId,
    },
  });

  for (const event of payload.events || []) {
    await prisma.marketEvent.create({
      data: {
        intelId: intel.id,
        eventTypeId: eventTypeMap[event.eventTypeCode],
        sourceText: event.sourceText,
        subject: event.subject,
        action: event.action,
        content: event.content,
        impact: event.impact,
        impactLevel: event.impactLevel,
        sentiment: event.sentiment,
        commodity: event.commodity,
        regionCode: event.regionCode,
        eventDate: payload.effectiveTime,
      },
    });
  }

  for (const insight of payload.insights || []) {
    await prisma.marketInsight.create({
      data: {
        intelId: intel.id,
        insightTypeId: insightTypeMap[insight.insightTypeCode],
        sourceText: insight.sourceText,
        title: insight.title,
        content: insight.content,
        direction: insight.direction,
        timeframe: insight.timeframe,
        confidence: insight.confidence,
        factors: insight.factors,
        commodity: insight.commodity,
        regionCode: insight.regionCode,
      },
    });
  }

  if (payload.researchReport) {
    await prisma.researchReport.create({
      data: {
        intelId: intel.id,
        title: payload.researchReport.title,
        reportType: payload.researchReport.reportType,
        publishDate: payload.researchReport.publishDate,
        source: payload.researchReport.source,
        summary: payload.researchReport.summary,
        keyPoints: payload.researchReport.keyPoints,
        prediction: payload.researchReport.prediction,
        dataPoints: payload.researchReport.dataPoints,
        commodities: payload.researchReport.commodities,
        regions: payload.researchReport.regions,
        timeframe: payload.researchReport.timeframe,
      },
    });
  }

  return intel.id;
}

async function main() {
  console.log('🌱 开始播种关联分析专用数据...');

  const sqlPath = path.join(__dirname, 'seed.sql');
  if (fs.existsSync(sqlPath)) {
    console.log('   - 正在执行 seed.sql ...');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    console.log('   ✅ 基础数据已入库');
  }

  const user = await ensureUser();
  const eventTypeMap = await ensureEventTypes();
  const insightTypeMap = await ensureInsightTypes();

  const bundles = [
    {
      location: '锦州港',
      region: ['辽宁省', '锦州市'],
      contentType: 'DAILY_REPORT',
      sourceType: 'FIRST_LINE',
      effectiveTime: daysAgo(1),
      summary: '锦州港玉米收购价上涨20元/吨，市场情绪偏多。',
      rawContent: '【锦州港】玉米收购价上涨20元/吨，贸易商补库积极，港口库存小幅下降。',
      totalScore: 86,
      events: [
        {
          eventTypeCode: 'PRICE_CHANGE',
          sourceText: '玉米收购价上涨20元/吨',
          subject: '锦州港',
          action: '价格上涨',
          content: '玉米收购价上涨20元/吨至2350元/吨',
          impact: '刺激北港报价',
          impactLevel: 'MEDIUM',
          sentiment: 'bullish',
          commodity: '玉米',
          regionCode: '辽宁省',
        },
      ],
      insights: [
        {
          insightTypeCode: 'FORECAST',
          sourceText: '短期价格仍有上行空间',
          title: '短期看涨',
          content: '港口库存下降叠加补库需求，价格或继续走高。',
          direction: 'up',
          timeframe: 'short',
          confidence: 82,
          factors: ['库存下降', '补库需求'],
          commodity: '玉米',
          regionCode: '辽宁省',
        },
      ],
    },
    {
      location: '大连港',
      region: ['辽宁省', '大连市'],
      contentType: 'DAILY_REPORT',
      sourceType: 'FIRST_LINE',
      effectiveTime: daysAgo(2),
      summary: '大连港到港车辆减少，价格持稳。',
      rawContent: '【大连港】玉米到港车辆减少，价格维持2350元/吨，港口库存下降。',
      totalScore: 83,
      events: [
        {
          eventTypeCode: 'SUPPLY_CHANGE',
          sourceText: '到港车辆减少',
          subject: '大连港',
          action: '到港减少',
          content: '到港车辆减少，供应压力缓解',
          impact: '利多现货价格',
          impactLevel: 'LOW',
          sentiment: 'neutral',
          commodity: '玉米',
          regionCode: '辽宁省',
        },
      ],
      insights: [
        {
          insightTypeCode: 'SUPPLY_ANALYSIS',
          sourceText: '供应端短期偏紧',
          title: '供应端偏紧',
          content: '北港到港减少叠加库存下降，供应趋紧。',
          direction: 'stable',
          timeframe: 'short',
          confidence: 78,
          factors: ['到港减少', '库存下降'],
          commodity: '玉米',
          regionCode: '辽宁省',
        },
      ],
    },
    {
      location: '吉林长春',
      region: ['吉林省', '长春市'],
      contentType: 'DAILY_REPORT',
      sourceType: 'FIRST_LINE',
      effectiveTime: daysAgo(3),
      summary: '产区卖粮谨慎，挂牌价小幅下调。',
      rawContent: '【长春】农户惜售，收购商挂牌价下调10元/吨。',
      totalScore: 79,
      events: [
        {
          eventTypeCode: 'PRICE_CHANGE',
          sourceText: '挂牌价下调10元/吨',
          subject: '长春收购商',
          action: '下调挂牌',
          content: '挂牌价下调10元/吨至2280元/吨',
          impact: '压制周边价格',
          impactLevel: 'LOW',
          sentiment: 'bearish',
          commodity: '玉米',
          regionCode: '吉林省',
        },
      ],
      insights: [],
    },
    {
      location: '国粮局官网',
      region: ['全国'],
      contentType: 'POLICY_DOC',
      sourceType: 'OFFICIAL',
      effectiveTime: daysAgo(1),
      summary: '发布加强粮食收购监管的通知。',
      rawContent: '【政策】国家粮食和物资储备局发布通知，强调收购监管与质量标准。',
      totalScore: 91,
      events: [
        {
          eventTypeCode: 'DEMAND_SHIFT',
          sourceText: '加强收购监管',
          subject: '国粮局',
          action: '发布通知',
          content: '加强粮食收购监管，规范市场秩序',
          impact: '稳定市场预期',
          impactLevel: 'MEDIUM',
          sentiment: 'neutral',
          commodity: '玉米',
          regionCode: '全国',
        },
      ],
      insights: [],
    },
    {
      location: 'XX期货研究院',
      region: ['辽宁省'],
      contentType: 'RESEARCH_REPORT',
      sourceType: 'RESEARCH_INST',
      effectiveTime: daysAgo(2),
      summary: '研报认为北港库存下降支撑玉米价格。',
      rawContent: '【研报】北港库存下降叠加贸易商补库，预计价格短期偏强。',
      totalScore: 88,
      events: [],
      insights: [
        {
          insightTypeCode: 'FORECAST',
          sourceText: '短期价格偏强',
          title: '价格偏强预期',
          content: '北港库存下降，价格短期偏强。',
          direction: 'up',
          timeframe: 'short',
          confidence: 85,
          factors: ['库存下降', '补库需求'],
          commodity: '玉米',
          regionCode: '辽宁省',
        },
      ],
      researchReport: {
        title: '北港玉米库存下降对现货影响分析',
        reportType: 'RESEARCH',
        publishDate: daysAgo(2),
        source: 'XX期货研究院',
        summary: '北港库存下降支撑现货价格，预计短期偏强。',
        keyPoints: [{ point: '库存下降', sentiment: 'bullish', confidence: 0.78 }],
        prediction: { direction: 'up', timeframe: 'short', reasoning: '补库需求增强' },
        dataPoints: [{ metric: '库存', value: '42万吨', period: '本周' }],
        commodities: ['玉米'],
        regions: ['辽宁省'],
        timeframe: 'short',
      },
    },
  ];

  let created = 0;
  for (const bundle of bundles) {
    await createIntelBundle({
      authorId: user.id,
      eventTypeMap,
      insightTypeMap,
      payload: bundle,
    });
    created += 1;
  }

  console.log(`✅ 已创建关联分析测试情报 ${created} 条`);
  console.log('🎉 关联分析 Seed 完成。');
}

main()
  .catch((error) => {
    console.error('❌ 关联分析 Seed 失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 定义前端规则编辑器兼容的条件格式
interface RuleCondition {
    id: string;
    leftType: 'KEYWORD' | 'COLLECTION_POINT' | 'NUMBER' | 'DATE' | 'REGION' | 'COMMODITY';
    leftValue: string[];
    connector: 'FOLLOWED_BY' | 'FOLLOWED_CONTAINS' | 'PRECEDED_BY' | 'SAME_SENTENCE' | 'SAME_PARAGRAPH';
    rightType: 'KEYWORD' | 'COLLECTION_POINT' | 'NUMBER' | 'DATE' | 'REGION' | 'COMMODITY';
    rightValue: string[];
    extractFields?: Record<string, string>; // e.g. { subject: 'LEFT', action: 'RIGHT' }
}

const generateId = () => Date.now().toString() + Math.floor(Math.random() * 1000);

const RULES = [
    {
        name: '价格上涨监测',
        targetType: 'EVENT',
        eventTypeCode: 'PRICE_CHANGE',
        priority: 10,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['价格', '报价', '挂牌价', '收购价', '平舱价', '出库价', '到港价', '发货价', '批发价', '车板价', '站台价'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['上涨', '上调', '走高', '涨', '高开', '涨势', '回升', '反弹'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: ['玉米', '大豆', '小麦', '稻谷'],
        outputConfig: { direction: 'up' }
    },
    {
        name: '价格下跌监测',
        targetType: 'EVENT',
        eventTypeCode: 'PRICE_CHANGE',
        priority: 10,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['价格', '报价', '挂牌价', '收购价', '平舱价', '出库价', '到港价', '发货价', '批发价', '车板价', '站台价'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['下跌', '下调', '回落', '跌', '低开', '跌势', '走低', '跳水'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: ['玉米', '大豆', '小麦', '稻谷'],
        outputConfig: { direction: 'down' }
    },
    {
        name: '企业停机检修监测',
        targetType: 'EVENT',
        eventTypeCode: 'ENTERPRISE_ACTION',
        priority: 8,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['深加工', '工厂', '企业', '烘干塔', '生产线', '港口', '泊位'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['检修', '停机', '停收', '停工', '停产', '放假'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: [],
    },
    {
        name: '后市看涨观点提取',
        targetType: 'INSIGHT',
        insightTypeCode: 'FORECAST',
        priority: 9,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['后市', '预期', '观点', '分析', '预测'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['看涨', '走强', '乐观', '新高', '坚挺', '强劲', '利好'],
                extractFields: { action: 'RIGHT' }
            }
        ] as RuleCondition[],
        outputConfig: { direction: 'up' }
    },
    {
        name: '后市看空观点提取',
        targetType: 'INSIGHT',
        insightTypeCode: 'FORECAST',
        priority: 9,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['后市', '预期', '观点', '分析', '预测'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['看空', '弱势', '回落', '悲观', '利空', '下行', '承压'],
                extractFields: { action: 'RIGHT' }
            }
        ] as RuleCondition[],
        outputConfig: { direction: 'down' }
    },
    {
        name: '天气灾害预警',
        targetType: 'EVENT',
        eventTypeCode: 'WEATHER_IMPACT',
        priority: 10,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['遭遇', '受', '未来', '预计', '持续'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['暴雨', '大雪', '台风', '洪涝', '干旱', '冰雹', '霜冻', '强降雨'],
                extractFields: { action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: ['玉米', '大豆'],
    },
    {
        name: '物流运输监测',
        targetType: 'EVENT',
        eventTypeCode: 'LOGISTICS_INFO',
        priority: 7,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['运费', '车辆', '汽运', '火运', '船运'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['上涨', '紧张', '稀少', '困难', '堵港', '停运', '受阻', '滞留', '积压', '排队'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: [],
    },
    {
        name: '政策发布监测',
        targetType: 'EVENT',
        eventTypeCode: 'POLICY_UPDATE',
        priority: 10,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['国粮局', '中储粮', '储备', '发改委', '农业部'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['发布', '启动', '调整', '轮换', '补贴', '收购', '拍卖'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: [],
    },
    {
        name: '库存变化监测',
        targetType: 'EVENT',
        eventTypeCode: 'SUPPLY_CHANGE',
        priority: 8,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['库存', '余粮', '结转'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['下降', '累积', '不足', '增加', '减少', '低位', '高位'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: ['玉米', '大豆'],
    },
    {
        name: '企业采购意愿增强',
        targetType: 'EVENT',
        eventTypeCode: 'DEMAND_SHIFT',
        priority: 8,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['企业', '饲料厂', '深加工', '养殖场'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['补库', '采购', '收购', '建库', '备货'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        commodities: [],
    },
    {
        name: '供应压力分析',
        targetType: 'INSIGHT',
        insightTypeCode: 'SUPPLY_ANALYSIS',
        priority: 7,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['基层', '农户', '产区'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['集中上市', '售粮', '上量', '卖粮', '变现'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        outputConfig: {}
    },
    {
        name: '需求疲软分析',
        targetType: 'INSIGHT',
        insightTypeCode: 'DEMAND_ANALYSIS',
        priority: 7,
        conditions: [
            {
                id: generateId(),
                leftType: 'KEYWORD',
                leftValue: ['下游', '终端', '贸易商'],
                connector: 'FOLLOWED_BY',
                rightType: 'KEYWORD',
                rightValue: ['观望', '停收', '疲软', '走货慢', '谨慎'],
                extractFields: { subject: 'LEFT', action: 'RIGHT' }
            }
        ] as RuleCondition[],
        outputConfig: {}
    }
];

async function main() {
    console.log('🌱 开始优化播种提取规则 (Optimized Rules)...');

    for (const rule of RULES) {
        // 1. 查找对应的 Type ID
        let eventTypeId = null;
        let insightTypeId = null;

        if (rule.targetType === 'EVENT' && rule.eventTypeCode) {
            const et = await prisma.eventTypeConfig.findUnique({
                where: { code: rule.eventTypeCode },
            });
            if (!et) {
                console.warn(`⚠️ 未找到事件类型 ${rule.eventTypeCode}，跳过规则 ${rule.name}`);
                continue;
            }
            eventTypeId = et.id;
        }

        if (rule.targetType === 'INSIGHT' && rule.insightTypeCode) {
            const it = await prisma.insightTypeConfig.findUnique({
                where: { code: rule.insightTypeCode },
            });
            if (!it) {
                console.warn(`⚠️ 未找到洞察类型 ${rule.insightTypeCode}，跳过规则 ${rule.name}`);
                continue;
            }
            insightTypeId = it.id;
        }

        // 2. 更新或创建规则 (使用 Upsert 逻辑)
        // 注意：Prisma 没有直接根据 Name 更新的 Upsert，我们先查再更
        const existing = await prisma.extractionRule.findFirst({
            where: { name: rule.name },
        });

        if (existing) {
            // 更新现有规则的 conditions
            await prisma.extractionRule.update({
                where: { id: existing.id },
                data: {
                    conditions: rule.conditions as any, // Cast to any because JSON type
                    outputConfig: rule.outputConfig as any,
                    priority: rule.priority,
                    commodities: rule.commodities
                }
            });
            console.log(`🔄 更新规则: ${rule.name}`);
        } else {
            await prisma.extractionRule.create({
                data: {
                    name: rule.name,
                    targetType: rule.targetType,
                    priority: rule.priority,
                    conditions: rule.conditions as any,
                    outputConfig: rule.outputConfig as any,
                    commodities: rule.commodities,
                    eventTypeId,
                    insightTypeId,
                },
            });
            console.log(`✅ 创建规则: ${rule.name}`);
        }
    }

    console.log('🎉 提取规则优化完成。');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

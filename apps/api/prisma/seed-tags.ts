/// <reference types="node" />
import { PrismaClient, TagScope } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// 1. Tag Groups Definition
// ==========================================
const TAG_GROUPS = [
    { name: '合作评级', code: 'COOP_RATING', isExclusive: true, sortOrder: 1, description: '客户/供应商合作等级分类' },
    { name: '信用风险', code: 'RISK_LEVEL', isExclusive: true, sortOrder: 2, description: '企业信用风险评级' },
    { name: '业务偏好', code: 'BIZ_PREF', isExclusive: false, sortOrder: 3, description: '主要经营品种或模式' },
    { name: '区域属性', code: 'REGION_TYPE', isExclusive: true, sortOrder: 4, description: '企业所属区域类型' },
];

// ==========================================
// 2. Global Tags Definition
// ==========================================
const GLOBAL_TAGS = [
    // Group: 合作评级 (COOP_RATING)
    { name: '战略核心', groupCode: 'COOP_RATING', color: '#f5222d', sortOrder: 1, scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },
    { name: '优质伙伴', groupCode: 'COOP_RATING', color: '#fa8c16', sortOrder: 2, scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },
    { name: '普通合作', groupCode: 'COOP_RATING', color: '#1890ff', sortOrder: 3, scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },
    { name: '考察期', groupCode: 'COOP_RATING', color: '#bfbfbf', sortOrder: 4, scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },

    // Group: 信用风险 (RISK_LEVEL)
    { name: '信用极好', groupCode: 'RISK_LEVEL', color: '#52c41a', sortOrder: 1, icon: 'SafetyCertificateOutlined' },
    { name: '风险可控', groupCode: 'RISK_LEVEL', color: '#13c2c2', sortOrder: 2 },
    { name: '预付受限', groupCode: 'RISK_LEVEL', color: '#722ed1', sortOrder: 3, description: '禁止预付货款' },
    { name: '失信黑名单', groupCode: 'RISK_LEVEL', color: '#cf1322', sortOrder: 4, icon: 'StopOutlined', description: '禁止交易' },

    // Group: 业务偏好 (BIZ_PREF)
    { name: '玉米主力', groupCode: 'BIZ_PREF', color: '#fadb14', scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER, TagScope.MARKET_INFO] },
    { name: '大豆主力', groupCode: 'BIZ_PREF', color: '#a0d911', scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER, TagScope.MARKET_INFO] },
    { name: '进口粮', groupCode: 'BIZ_PREF', color: '#1890ff', scopes: [TagScope.MARKET_INFO, TagScope.CONTRACT] },
    { name: '北粮南运', groupCode: 'BIZ_PREF', color: '#eb2f96', scopes: [TagScope.LOGISTICS] },
    { name: '饲料加工', groupCode: 'BIZ_PREF', color: '#fa541c' },
    { name: '深加工', groupCode: 'BIZ_PREF', color: '#722ed1' },

    // Group: 区域属性 (REGION_TYPE)
    { name: '产区直采', groupCode: 'REGION_TYPE', color: '#52c41a' },
    { name: '港口贸易', groupCode: 'REGION_TYPE', color: '#1890ff' },
    { name: '销区渠道', groupCode: 'REGION_TYPE', color: '#fa8c16' },
];

async function seedTags() {
    console.log('🌱 开始全量标签数据播种 (Redesigned Tags Seed)...');

    // 1. Groups
    const groupMap: Record<string, string> = {}; // code -> id

    for (const g of TAG_GROUPS) {
        const result = await prisma.tagGroup.upsert({
            where: { name: g.name },
            update: {
                description: g.description,
                isExclusive: g.isExclusive,
                sortOrder: g.sortOrder,
            },
            create: {
                name: g.name,
                description: g.description,
                isExclusive: g.isExclusive,
                sortOrder: g.sortOrder,
            },
        });
        groupMap[g.code] = result.id;
        console.log(`   ✅ 标签组: ${g.name}`);
    }

    // 2. Tags
    for (const t of GLOBAL_TAGS) {
        // Find group ID
        const groupId = groupMap[t.groupCode];

        await prisma.tag.upsert({
            where: { name_groupId: { name: t.name, groupId: groupId || '' } }, // Assuming name+group unique composite or logic
            // Note: Schema has @@unique([name, groupId]). If groupId is undefined, it might fail if we assume it exists.
            // For safety, we use findFirst or name+groupId if valid. 
            // Prisma upsert needs a unique key. 
            // Let's use name+groupId. If groupId is null, it's global global. 这里都是有组的.
            update: {
                color: t.color,
                icon: t.icon,
                sortOrder: t.sortOrder,
                scopes: t.scopes || [TagScope.GLOBAL],
                description: t.description,
            },
            create: {
                name: t.name,
                groupId: groupId,
                color: t.color,
                icon: t.icon || null,
                sortOrder: t.sortOrder || 0,
                scopes: t.scopes || [TagScope.GLOBAL],
                description: t.description,
            }
        });
        console.log(`      🏷️ 标签: ${t.name}`);
    }

    console.log('🎉 标签体系重构完成。');
}

seedTags()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

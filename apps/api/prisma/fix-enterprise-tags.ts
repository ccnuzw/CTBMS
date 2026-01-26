
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tag Groups Definitions (based on db query)
const TAG_GROUPS = {
    CREDIT: ['信用极好', '信用良好', '风险关注', '失信黑名单'],
    TIER: ['KA客户', '重点客户', '普通客户', '潜在客户'],
    STAGE: ['初次接触', '意向沟通', '试单', '稳定合作'],
    PRODUCT: ['玉米', '大豆', '豆粕', '小麦'],
};

async function main() {
    console.log('🏷️ 开始重置并优化客商标签绑定...');

    // 1. Clear existing bindings
    console.log('🧹 清除现有客商标签绑定...');
    const deleteResult = await prisma.entityTag.deleteMany({
        where: { entityType: 'CUSTOMER' }
    });
    console.log(`   已删除 ${deleteResult.count} 条旧绑定`);

    // 2. Fetch Resources
    const enterprises = await prisma.enterprise.findMany();
    const allTags = await prisma.tag.findMany({
        where: { scopes: { has: 'CUSTOMER' }, status: 'ACTIVE' }
    });

    if (allTags.length === 0) {
        console.warn('⚠️ 未找到可用标签');
        return;
    }

    // Map tags by name for easy lookup
    const tagMap = new Map();
    allTags.forEach(t => tagMap.set(t.name, t.id));

    console.log(`🏭 找到 ${enterprises.length} 家客商，准备重新打标...`);

    let totalBindings = 0;

    // 3. Smart Binding Logic
    for (const ent of enterprises) {
        const entName = ent.name;
        const selectedTagIds: string[] = [];

        // --- Logic 1: Credit Rating (Mutually Exclusive) ---
        // Big companies usually have good credit, unless specified
        let creditTag = '';
        const isBigCorp = entName.includes('集团') || entName.includes('股份') || entName.includes('中粮') || entName.includes('嘉吉');

        if (Math.random() < 0.05) {
            creditTag = '失信黑名单'; // 5% chance
        } else if (Math.random() < 0.15) {
            creditTag = '风险关注';
        } else {
            // Good credit
            creditTag = isBigCorp ? (Math.random() > 0.3 ? '信用极好' : '信用良好') : (Math.random() > 0.5 ? '信用良好' : '信用极好');
        }
        if (tagMap.has(creditTag)) selectedTagIds.push(tagMap.get(creditTag));


        // --- Logic 2: Customer Tier (Mutually Exclusive) ---
        let tierTag = '';
        if (creditTag === '失信黑名单') {
            tierTag = '潜在客户'; // Blacklisted usually demoted
        } else {
            if (isBigCorp) {
                tierTag = Math.random() > 0.3 ? 'KA客户' : '重点客户';
            } else {
                const r = Math.random();
                if (r > 0.9) tierTag = 'KA客户';
                else if (r > 0.6) tierTag = '重点客户';
                else if (r > 0.3) tierTag = '普通客户';
                else tierTag = '潜在客户';
            }
        }
        if (tagMap.has(tierTag)) selectedTagIds.push(tagMap.get(tierTag));


        // --- Logic 3: Relationship Stage (Mutually Exclusive) ---
        let stageTag = '';
        if (['KA客户', '重点客户'].includes(tierTag)) {
            stageTag = '稳定合作';
        } else if (tierTag === '潜在客户') {
            stageTag = Math.random() > 0.5 ? '初次接触' : '意向沟通';
        } else {
            stageTag = Math.random() > 0.5 ? '稳定合作' : '试单';
        }
        if (tagMap.has(stageTag)) selectedTagIds.push(tagMap.get(stageTag));


        // --- Logic 4: Product Interest (Multiple Allowed) ---
        // Infer from name or random
        const products = [];
        if (entName.includes('玉米') || entName.includes('淀粉') || entName.includes('酒精')) products.push('玉米');
        if (entName.includes('豆') || entName.includes('油') || entName.includes('蛋白')) products.push('大豆', '豆粕');
        if (entName.includes('饲料') || entName.includes('牧业')) products.push('玉米', '豆粕');
        if (entName.includes('面粉')) products.push('小麦');

        // If inferred is empty, pick random
        if (products.length === 0) {
            TAG_GROUPS.PRODUCT.forEach(p => {
                if (Math.random() > 0.7) products.push(p);
            });
        }

        // Add product tags (deduplicated)
        [...new Set(products)].forEach(p => {
            if (tagMap.has(p)) selectedTagIds.push(tagMap.get(p));
        });


        // 4. Batch Insert for this Entity
        const uniqueTagIds = [...new Set(selectedTagIds)];
        for (const tagId of uniqueTagIds) {
            await prisma.entityTag.create({
                data: {
                    entityType: 'CUSTOMER',
                    entityId: ent.id,
                    tagId: tagId
                }
            });
            totalBindings++;
        }
        // console.log(`   + ${ent.shortName || ent.name}: [${uniqueTagIds.length} tags]`);
    }

    console.log(`\n🎉 标签重置完成！共建立 ${totalBindings} 条关联。`);
    console.log('   逻辑校验:');
    console.log('   - 信用互斥 (黑名单 vs 信用极好)');
    console.log('   - 分级互斥 (KA vs 普通)');
    console.log('   - 阶段互斥 (初次接触 vs 稳定合作)');
    console.log('   - 业务推导 (根据公司名推断品种)');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

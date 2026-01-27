
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 开始执行彻底的标签重组 (Deep Clean & Rebind)...');

    // 1. 获取所有企业ID
    const enterprises = await prisma.enterprise.findMany({
        select: { id: true, name: true, types: true }
    });
    const entIds = enterprises.map(e => e.id);

    console.log(`🏭 目标: ${enterprises.length} 家企业`);

    // 2. 彻底清除关联 (包括 Customer, Supplier, Logistics 等所有维度的标签)
    console.log('🧹 正在清除所有历史标签关联...');
    const deleteResult = await prisma.entityTag.deleteMany({
        where: {
            entityId: { in: entIds }
        }
    });
    console.log(`   ✅ 已粉碎 ${deleteResult.count} 条残留关联 (无死角清除)`);

    // 3. 准备标签库 (Tag Dictionary)
    const allTags = await prisma.tag.findMany({ where: { status: 'ACTIVE' } });
    const tagMap = new Map<string, string>();
    allTags.forEach(t => tagMap.set(t.name, t.id));

    // 辅助函数: 安全获取TagID
    const getTagId = (name: string) => tagMap.get(name);

    // 4. 重建绑定 (Unified Logic)
    let totalCreated = 0;

    for (const ent of enterprises) {
        const isSupplier = ent.types.includes('SUPPLIER');
        const isCustomer = ent.types.includes('CUSTOMER') || ent.types.length === 0; // Default to customer if unknown
        const isLogistics = ent.types.includes('LOGISTICS');

        // 临时存储要打的标签名
        const tagsToApply = new Set<string>();

        // --- A. 信用评级 (全局唯一，最为关键) ---
        // 逻辑: 只有 5% 概率是黑名单，10% 风险。大厂通常信用好。
        const isBigCorp = ent.name.includes('集团') || ent.name.includes('股份') || ent.name.includes('中粮');

        let creditTag = '';
        const rand = Math.random();

        if (rand < 0.05) {
            creditTag = '失信黑名单';
        } else if (rand < 0.15) {
            creditTag = '风险关注';
        } else {
            // Good credit
            if (isBigCorp) {
                creditTag = (Math.random() > 0.2) ? '信用极好' : '信用良好';
            } else {
                creditTag = (Math.random() > 0.6) ? '信用极好' : '信用良好';
            }
        }
        tagsToApply.add(creditTag);

        // --- B. 客户分级 & 阶段 (仅针对 Customer) ---
        if (isCustomer) {
            let tierTag = '';
            let stageTag = '';

            if (creditTag === '失信黑名单' || creditTag === '风险关注') {
                tierTag = '潜在客户';
                stageTag = '初次接触'; // 即使以前合作过，风险高了也降级处理
            } else {
                // 正常客户
                if (isBigCorp) {
                    tierTag = Math.random() > 0.3 ? 'KA客户' : '重点客户';
                } else {
                    const r = Math.random();
                    if (r > 0.9) tierTag = 'KA客户';
                    else if (r > 0.5) tierTag = '重点客户';
                    else tierTag = '普通客户';
                }

                // 阶段匹配分级
                if (['KA客户', '重点客户'].includes(tierTag)) {
                    stageTag = '稳定合作';
                } else {
                    stageTag = Math.random() > 0.4 ? '稳定合作' : '试单';
                }
            }
            tagsToApply.add(tierTag);
            tagsToApply.add(stageTag);
        }

        // --- C. 产品/业务 (推导) ---
        const products = [];
        if (ent.name.includes('玉米') || ent.name.includes('淀粉') || ent.name.includes('酒精')) products.push('玉米');
        if (ent.name.includes('豆') || ent.name.includes('油') || ent.name.includes('蛋白')) products.push('大豆', '豆粕');
        if (ent.name.includes('饲料') || ent.name.includes('牧业')) products.push('玉米', '豆粕');
        if (ent.name.includes('面粉')) products.push('小麦');
        if (products.length === 0 && Math.random() > 0.5) products.push('玉米'); // Default fallback

        products.forEach(p => tagsToApply.add(p));

        // --- 执行插入 ---
        for (const tagName of tagsToApply) {
            const tagId = getTagId(tagName);
            if (!tagId) continue;

            // 确定 EntityType: 优先使用 CUSTOMER，如果是纯供应商则用 SUPPLIER
            let entityType: 'CUSTOMER' | 'SUPPLIER' | 'LOGISTICS' = 'CUSTOMER';
            if (!isCustomer && isSupplier) entityType = 'SUPPLIER';
            if (!isCustomer && !isSupplier && isLogistics) entityType = 'LOGISTICS';

            // 写入 (由于已清空，无需 upsert)
            await prisma.entityTag.create({
                data: {
                    entityId: ent.id,
                    tagId: tagId,
                    entityType: entityType
                }
            });
            totalCreated++;
        }
    }

    console.log(`\n🎉 标签重组完成! 共生成 ${totalCreated} 条新关联。`);
    console.log('   已确保每家企业只有一个信用评级，逻辑完全闭环。');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

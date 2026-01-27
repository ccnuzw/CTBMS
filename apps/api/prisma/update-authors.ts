
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 开始更新数据上报来源 (Updating Authors)...');

    // 1. 获取所有可用用户 (排除 admin 和 test_user，或者保留它们作为少数派)
    // 假设真实员工的用户名不是简单的 admin/test
    const allUsers = await prisma.user.findMany({
        select: { id: true, name: true, username: true }
    });

    if (allUsers.length === 0) {
        console.log('❌ 未找到用户数据');
        return;
    }

    console.log(`👤 找到 ${allUsers.length} 个候选用户`);

    // 筛选出更有可能是“真实员工”的用户列表 (排除 automated/system users if any, though randomization is usually fine)
    // 简单起见，使用全量用户池
    const userPool = allUsers.map(u => u.id);

    // 2. 更新 MarketIntel
    const intelCount = await prisma.marketIntel.count();
    console.log(`📝 正在更新 ${intelCount} 条情报记录...`);

    // 由于 Prisma 不支持随机 update，我们需要先查出来再 update，或者批量 update
    // 为了效率和随机性，我们采用分批处理：
    // 其实对于几千条数据，直接遍历更新是可以接受的脚本

    const allIntel = await prisma.marketIntel.findMany({ select: { id: true } });

    let updatedIntel = 0;
    for (const item of allIntel) {
        const randomAuthorId = userPool[Math.floor(Math.random() * userPool.length)];
        await prisma.marketIntel.update({
            where: { id: item.id },
            data: { authorId: randomAuthorId }
        });
        updatedIntel++;
        if (updatedIntel % 50 === 0) process.stdout.write('.');
    }
    console.log(`\n✅ 已更新 ${updatedIntel} 条情报归属`);

    // 3. 更新 PriceData
    const priceCount = await prisma.priceData.count();
    console.log(`💰 正在更新 ${priceCount} 条价格记录...`);

    // 价格数据量较大 (几千条)，我们可以按 chunks 更新，但为了随机性，还是单条或者按采集点分组更新比较好
    // 优化策略：按采集点分组，每个采集点的数据由 1-2 个固定的“负责专员”上报，这样更真实

    const collectionPoints = await prisma.collectionPoint.findMany({ select: { id: true } });

    let updatedPrice = 0;
    for (const cp of collectionPoints) {
        // 为该采集点指定 1 个主要负责人，和 1 个备选负责人
        const owner1 = userPool[Math.floor(Math.random() * userPool.length)];
        const owner2 = userPool[Math.floor(Math.random() * userPool.length)];

        // 查找该采集点的所有价格数据
        const prices = await prisma.priceData.findMany({
            where: { collectionPointId: cp.id },
            select: { id: true }
        });

        for (const p of prices) {
            // 80% 概率是主要负责人，20% 是备选
            const authorId = Math.random() < 0.8 ? owner1 : owner2;
            await prisma.priceData.update({
                where: { id: p.id },
                data: { authorId }
            });
            updatedPrice++;
        }
        process.stdout.write('.');
    }

    console.log(`\n✅ 已更新 ${updatedPrice} 条价格归属`);
    console.log('🎉 上报来源更新完成！');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    try {
        // 查询 REGION 类型的采集点
        const regionPoints = await prisma.collectionPoint.findMany({
            where: { type: 'REGION' },
            select: { id: true, code: true, name: true, isActive: true }
        });

        console.log('=== REGION 类型采集点 ===');
        console.log(JSON.stringify(regionPoints, null, 2));
        console.log(`\n共 ${regionPoints.length} 个`);

        if (regionPoints.length > 0) {
            // 删除 REGION 类型的采集点
            const deleteResult = await prisma.collectionPoint.deleteMany({
                where: { type: 'REGION' }
            });
            console.log(`\n已删除 ${deleteResult.count} 个 REGION 类型采集点`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);

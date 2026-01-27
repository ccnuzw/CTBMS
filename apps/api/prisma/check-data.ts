import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('📊 正在查询数据统计...');

    const countA = await prisma.marketIntel.count({
        where: { category: 'A_STRUCTURED' }
    });

    const countB = await prisma.marketIntel.count({
        where: { category: 'B_SEMI_STRUCTURED' }
    });

    const countPrice = await prisma.priceData.count();

    console.log('------------------------------------------------');
    console.log(`✅ A类情报 (A_STRUCTURED):      ${countA} 条`);
    console.log(`✅ B类情报 (B_SEMI_STRUCTURED): ${countB} 条`);
    console.log(`💰 价格数据 (PriceData):        ${countPrice} 条`);
    console.log('------------------------------------------------');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());

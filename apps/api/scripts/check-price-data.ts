
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking PriceData...');

    // 1. Count total price data
    const count = await prisma.priceData.count();
    console.log(`Total PriceData count: ${count}`);

    if (count === 0) {
        console.log('No PriceData found.');
        return;
    }

    // 2. List recent 20 entries with status and date
    const recentData = await prisma.priceData.findMany({
        take: 20,
        orderBy: { effectiveDate: 'desc' },
        select: {
            id: true,
            collectionPointId: true,
            effectiveDate: true,
            price: true,
            reviewStatus: true,
            collectionPoint: {
                select: {
                    name: true
                }
            }
        }
    });

    console.log('Recent 20 PriceData entries:');
    recentData.forEach(d => {
        console.log(`- [${d.effectiveDate.toISOString().split('T')[0]}] ${d.collectionPoint?.name} (${d.collectionPointId}): ${d.price} | Status: ${d.reviewStatus}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

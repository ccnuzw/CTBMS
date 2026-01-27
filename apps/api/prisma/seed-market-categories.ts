/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
    { name: '粮食', code: 'GRAIN', description: '玉米、小麦、水稻等粮食作物', sortOrder: 1 },
    { name: '油脂油料', code: 'OIL', description: '大豆、菜籽、豆粕等', sortOrder: 2 },
    { name: '生猪畜牧', code: 'LIVESTOCK', description: '生猪、肉禽、养殖等', sortOrder: 3 },
    { name: '物流运输', code: 'LOGISTICS', description: '汽运、火运、海运运费及动态', sortOrder: 4 },
    { name: '气象灾害', code: 'WEATHER', description: '天气预警、自然灾害', sortOrder: 5 },
    { name: '政策解读', code: 'POLICY', description: '收储政策、补贴政策等', sortOrder: 6 },
    { name: '港口动态', code: 'PORT', description: '集港量、船期、检修', sortOrder: 7 },
    { name: '深加工', code: 'PROCESSING', description: '淀粉、酒精、开机率', sortOrder: 8 },
    { name: '宏观经济', code: 'MACRO', description: '汇率、利率、宏观数据', sortOrder: 9 },
    { name: '其他', code: 'OTHER', description: '其他未分类信息', sortOrder: 99 },
];

async function main() {
    console.log('📚 开始播种信息分类 (Seeding Market Categories)...');

    for (const cat of CATEGORIES) {
        await prisma.marketCategory.upsert({
            where: { code: cat.code },
            update: {
                name: cat.name,
                description: cat.description,
                sortOrder: cat.sortOrder,
            },
            create: {
                name: cat.name,
                code: cat.code,
                description: cat.description,
                sortOrder: cat.sortOrder,
            },
        });
        console.log(`   ✅ 分类: ${cat.name} (${cat.code})`);
    }

    console.log('🎉 信息分类播种完成。');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

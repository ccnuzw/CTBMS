import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('📍 更新企业经纬度坐标...\n');

    // 更新部分企业的经纬度
    const updates = [
        { name: '新希望六和股份有限公司', lon: 104.084946, lat: 30.657377 },
        { name: '通威股份有限公司', lon: 104.066548, lat: 30.588411 },
        { name: '海大集团股份有限公司', lon: 113.384073, lat: 22.943731 },
        { name: '正大集团（中国区）', lon: 121.505336, lat: 31.233061 },
        { name: '双胞胎（集团）股份有限公司', lon: 115.892151, lat: 28.676493 },
        { name: '禾丰牧业股份有限公司', lon: 123.429096, lat: 41.796767 },
        { name: '唐人神集团股份有限公司', lon: 113.142111, lat: 27.825744 },
        { name: '中粮生物科技股份有限公司', lon: 117.389719, lat: 32.916287 },
        { name: '西王食品股份有限公司', lon: 117.982857, lat: 37.374307 },
        { name: '中粮贸易有限公司', lon: 116.439127, lat: 39.921234 },
        { name: '嘉吉投资（中国）有限公司', lon: 121.504747, lat: 31.23523 },
        { name: '路易达孚（中国）贸易有限责任公司', lon: 121.477943, lat: 31.236027 },
        { name: '山东渤海实业股份有限公司', lon: 117.970703, lat: 37.382084 },
        { name: '象屿股份有限公司', lon: 118.089425, lat: 24.478825 },
        { name: '中国外运股份有限公司', lon: 116.432499, lat: 39.930368 },
        { name: '山东港口物流集团有限公司', lon: 120.382639, lat: 36.067082 },
        { name: '锦程国际物流集团股份有限公司', lon: 121.618622, lat: 38.914003 },
    ];

    for (const u of updates) {
        const result = await prisma.enterprise.updateMany({
            where: { name: u.name },
            data: { longitude: u.lon, latitude: u.lat },
        });
        if (result.count > 0) {
            console.log(`✅ ${u.name}: (${u.lon}, ${u.lat})`);
        }
    }

    console.log('\n🏷️ 添加标签关联...\n');

    // 查找客户相关标签（假设已有）
    const customerTags = await prisma.tag.findMany({
        where: { scopes: { has: 'CUSTOMER' } },
        take: 10,
    });

    if (customerTags.length === 0) {
        console.log('⚠️ 未找到 CUSTOMER 作用域的标签，跳过标签关联');
        console.log('   请先在"全局标签管理"中创建作用域为"客户"的标签');
    } else {
        console.log(`   找到 ${customerTags.length} 个客户标签`);

        const enterprises = await prisma.enterprise.findMany({ take: 15 });

        for (let i = 0; i < enterprises.length; i++) {
            // 给每个企业随机分配 1-3 个标签
            const tagCount = Math.min(1 + Math.floor(Math.random() * 3), customerTags.length);
            const shuffled = [...customerTags].sort(() => Math.random() - 0.5);
            const selectedTags = shuffled.slice(0, tagCount);

            for (const tag of selectedTags) {
                const existing = await prisma.entityTag.findFirst({
                    where: { entityId: enterprises[i].id, tagId: tag.id },
                });

                if (!existing) {
                    await prisma.entityTag.create({
                        data: {
                            entityType: 'CUSTOMER',
                            entityId: enterprises[i].id,
                            tagId: tag.id,
                        },
                    });
                    console.log(`   ✅ ${enterprises[i].name} <- [${tag.name}]`);
                }
            }
        }
    }

    console.log('\n🎉 完成！');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

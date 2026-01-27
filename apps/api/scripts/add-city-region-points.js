const { PrismaClient } = require('@prisma/client');

/**
 * 重新添加城市/县级地域采集点
 * 这些采集点通过 regionCode 与行政区划松耦合关联
 */
async function main() {
    const prisma = new PrismaClient();

    try {
        // 定义需要添加的城市/县级地域采集点
        // 每个采集点都关联到标准行政区划 regionCode
        const cityPoints = [
            // 黑龙江省
            { code: 'CITY_HARBIN', name: '哈尔滨', regionCode: '230100', shortName: '哈市' },
            { code: 'CITY_QIQIHAR', name: '齐齐哈尔', regionCode: '230200', shortName: '齐市' },
            { code: 'CITY_SUIHUA', name: '绥化', regionCode: '231200', shortName: null },

            // 吉林省
            { code: 'CITY_CHANGCHUN', name: '长春', regionCode: '220100', shortName: '长市' },
            { code: 'CITY_SIPING', name: '四平', regionCode: '220300', shortName: null },
            { code: 'CITY_SONGYUAN', name: '松原', regionCode: '220700', shortName: null },
            { code: 'CITY_GONGZHULING', name: '公主岭', regionCode: '220184', shortName: null },

            // 辽宁省
            { code: 'CITY_SHENYANG', name: '沈阳', regionCode: '210100', shortName: '沈市' },
            { code: 'CITY_DALIAN', name: '大连', regionCode: '210200', shortName: null },
            { code: 'CITY_JINZHOU', name: '锦州', regionCode: '210700', shortName: null },

            // 内蒙古
            { code: 'CITY_TONGLIAO', name: '通辽', regionCode: '150500', shortName: null },
            { code: 'CITY_CHIFENG', name: '赤峰', regionCode: '150400', shortName: null },

            // 山东省
            { code: 'CITY_JINAN', name: '济南', regionCode: '370100', shortName: '济市' },
            { code: 'CITY_QINGDAO', name: '青岛', regionCode: '370200', shortName: null },
            { code: 'CITY_WEIFANG', name: '潍坊', regionCode: '370700', shortName: null },

            // 河南省
            { code: 'CITY_ZHENGZHOU', name: '郑州', regionCode: '410100', shortName: '郑市' },
            { code: 'CITY_ZHOUKOU', name: '周口', regionCode: '411600', shortName: null },

            // 河北省
            { code: 'CITY_SHIJIAZHUANG', name: '石家庄', regionCode: '130100', shortName: '石市' },
            { code: 'CITY_HANDAN', name: '邯郸', regionCode: '130400', shortName: null },
        ];

        console.log('=== 开始添加城市/县级地域采集点 ===\n');

        for (const point of cityPoints) {
            // 检查行政区划是否存在
            const region = await prisma.administrativeRegion.findUnique({
                where: { code: point.regionCode }
            });

            // 使用 upsert 避免重复
            const result = await prisma.collectionPoint.upsert({
                where: { code: point.code },
                update: {
                    name: point.name,
                    shortName: point.shortName,
                    regionCode: region ? point.regionCode : null,
                    isActive: true,
                },
                create: {
                    code: point.code,
                    name: point.name,
                    shortName: point.shortName,
                    type: 'REGION',
                    regionCode: region ? point.regionCode : null,
                    aliases: [],
                    commodities: ['玉米', '大豆'],
                    matchRegionCodes: [],
                    matchKeywords: [],
                    priceSubTypes: ['LISTED', 'TRANSACTION'],
                    isDataSource: true,
                    isActive: true,
                    priority: 10,
                }
            });

            const status = region ? '✅' : '⚠️ (行政区划未找到)';
            console.log(`${status} ${point.code} -> ${point.name} (regionCode: ${point.regionCode})`);
        }

        console.log('\n=== 完成 ===');

        // 统计
        const count = await prisma.collectionPoint.count({ where: { type: 'REGION' } });
        console.log(`当前 REGION 类型采集点总数: ${count}`);

    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);

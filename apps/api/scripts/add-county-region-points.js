const { PrismaClient } = require('@prisma/client');

/**
 * 添加更多县级市和县级县采集点
 */
async function main() {
    const prisma = new PrismaClient();

    try {
        // 定义需要添加的县级市/县级县采集点
        const countyPoints = [
            // 吉林省 - 县级市/县
            { code: 'COUNTY_GONGZHULING', name: '公主岭市', regionCode: '220184', shortName: '公主岭' },
            { code: 'COUNTY_YUSHU', name: '榆树市', regionCode: '220182', shortName: '榆树' },
            { code: 'COUNTY_DEHUI', name: '德惠市', regionCode: '220183', shortName: '德惠' },
            { code: 'COUNTY_FUYU', name: '扶余市', regionCode: '220781', shortName: '扶余' },
            { code: 'COUNTY_LISHU', name: '梨树县', regionCode: '220322', shortName: '梨树' },
            { code: 'COUNTY_QIANGUO', name: '前郭县', regionCode: '220721', shortName: '前郭' },
            { code: 'COUNTY_NONG_AN', name: '农安县', regionCode: '220122', shortName: '农安' },

            // 黑龙江省 - 县级市/县
            { code: 'COUNTY_ZHAODONG', name: '肇东市', regionCode: '231282', shortName: '肇东' },
            { code: 'COUNTY_ANDA', name: '安达市', regionCode: '231281', shortName: '安达' },
            { code: 'COUNTY_HAILUN', name: '海伦市', regionCode: '231283', shortName: '海伦' },
            { code: 'COUNTY_BAYAN', name: '巴彦县', regionCode: '230126', shortName: '巴彦' },
            { code: 'COUNTY_BINXIAN', name: '宾县', regionCode: '230125', shortName: '宾县' },
            { code: 'COUNTY_WUCHANG', name: '五常市', regionCode: '230184', shortName: '五常' },
            { code: 'COUNTY_SHUANGCHENG', name: '双城区', regionCode: '230113', shortName: '双城' },

            // 辽宁省 - 县级市/县
            { code: 'COUNTY_CHANGTU', name: '昌图县', regionCode: '211224', shortName: '昌图' },
            { code: 'COUNTY_KAIYUAN', name: '开原市', regionCode: '211282', shortName: '开原' },
            { code: 'COUNTY_TIELING', name: '铁岭县', regionCode: '211221', shortName: '铁岭县' },
            { code: 'COUNTY_XINMIN', name: '新民市', regionCode: '210181', shortName: '新民' },
            { code: 'COUNTY_LIAOZHONG', name: '辽中区', regionCode: '210115', shortName: '辽中' },
            { code: 'COUNTY_FAKU', name: '法库县', regionCode: '210124', shortName: '法库' },

            // 内蒙古 - 县级
            { code: 'COUNTY_KAILU', name: '开鲁县', regionCode: '150523', shortName: '开鲁' },
            { code: 'COUNTY_NAIMAN', name: '奈曼旗', regionCode: '150525', shortName: '奈曼' },
            { code: 'COUNTY_KULUN', name: '库伦旗', regionCode: '150524', shortName: '库伦' },
            { code: 'COUNTY_HORQIN', name: '科尔沁左翼中旗', regionCode: '150521', shortName: '科左中旗' },

            // 山东省 - 县级市/县
            { code: 'COUNTY_ZHUCHENG', name: '诸城市', regionCode: '370782', shortName: '诸城' },
            { code: 'COUNTY_GAOMI', name: '高密市', regionCode: '370785', shortName: '高密' },
            { code: 'COUNTY_ANQIU', name: '安丘市', regionCode: '370784', shortName: '安丘' },
            { code: 'COUNTY_SHOUGUANG', name: '寿光市', regionCode: '370783', shortName: '寿光' },
            { code: 'COUNTY_QINGZHOU', name: '青州市', regionCode: '370781', shortName: '青州' },

            // 河南省 - 县级市/县
            { code: 'COUNTY_HUAIYANG', name: '淮阳区', regionCode: '411603', shortName: '淮阳' },
            { code: 'COUNTY_XIHUA', name: '西华县', regionCode: '411622', shortName: '西华' },
            { code: 'COUNTY_SHANGSHUI', name: '商水县', regionCode: '411623', shortName: '商水' },
            { code: 'COUNTY_TAIKANG', name: '太康县', regionCode: '411627', shortName: '太康' },
            { code: 'COUNTY_LUYI', name: '鹿邑县', regionCode: '411628', shortName: '鹿邑' },

            // 河北省 - 县级市/县
            { code: 'COUNTY_XINGTAI', name: '邢台县', regionCode: '130521', shortName: '邢台县' },
            { code: 'COUNTY_WEIXIAN', name: '威县', regionCode: '130533', shortName: '威县' },
            { code: 'COUNTY_JULU', name: '巨鹿县', regionCode: '130529', shortName: '巨鹿' },
            { code: 'COUNTY_NINGJIN', name: '宁晋县', regionCode: '130528', shortName: '宁晋' },
        ];

        console.log('=== 开始添加县级市/县级县采集点 ===\n');
        let successCount = 0;
        let skipCount = 0;

        for (const point of countyPoints) {
            // 检查行政区划是否存在
            const region = await prisma.administrativeRegion.findUnique({
                where: { code: point.regionCode }
            });

            // 检查是否已存在
            const existing = await prisma.collectionPoint.findUnique({
                where: { code: point.code }
            });

            if (existing) {
                console.log(`⏭️  ${point.code} 已存在，跳过`);
                skipCount++;
                continue;
            }

            await prisma.collectionPoint.create({
                data: {
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
                    priority: 5,
                }
            });

            const status = region ? '✅' : '⚠️ (行政区划未找到)';
            console.log(`${status} ${point.code} -> ${point.name}`);
            successCount++;
        }

        console.log(`\n=== 完成 ===`);
        console.log(`新增: ${successCount} 个, 跳过: ${skipCount} 个`);

        // 统计
        const count = await prisma.collectionPoint.count({ where: { type: 'REGION' } });
        console.log(`当前 REGION 类型采集点总数: ${count}`);

    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);

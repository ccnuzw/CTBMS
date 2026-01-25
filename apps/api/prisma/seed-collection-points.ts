/// <reference types="node" />
import { PrismaClient, CollectionPointType, RegionLevel } from '@prisma/client';

const prisma = new PrismaClient();

// 1. 定义需要播种的行政区划 (Hierarchy)
const REGIONS_DATA = [
    // 吉林省 (22)
    { code: '220000', name: '吉林省', parent: null, level: RegionLevel.PROVINCE },
    { code: '220100', name: '长春市', parent: '220000', level: RegionLevel.CITY },
    { code: '220122', name: '农安县', parent: '220100', level: RegionLevel.DISTRICT }, // 农安站, 华家站
    { code: '220700', name: '松原市', parent: '220000', level: RegionLevel.CITY },
    { code: '220702', name: '宁江区', parent: '220700', level: RegionLevel.DISTRICT }, // 松原站
    { code: '220800', name: '白城市', parent: '220000', level: RegionLevel.CITY },
    { code: '220821', name: '镇赉县', parent: '220800', level: RegionLevel.DISTRICT }, // 镇赉站

    // 内蒙古 (15)
    { code: '150000', name: '内蒙古自治区', parent: null, level: RegionLevel.PROVINCE },
    { code: '152200', name: '兴安盟', parent: '150000', level: RegionLevel.CITY },
    { code: '152201', name: '乌兰浩特市', parent: '152200', level: RegionLevel.DISTRICT }, // 乌兰浩特北站

    // 山东 (37)
    { code: '370000', name: '山东省', parent: null, level: RegionLevel.PROVINCE },
    { code: '371300', name: '临沂市', parent: '370000', level: RegionLevel.CITY },
    { code: '371321', name: '沂南县', parent: '371300', level: RegionLevel.DISTRICT }, // 沂南站
    { code: '371700', name: '菏泽市', parent: '370000', level: RegionLevel.CITY },
    { code: '371702', name: '牡丹区', parent: '371700', level: RegionLevel.DISTRICT }, // 沙土集站

    // 河南 (41)
    { code: '410000', name: '河南省', parent: null, level: RegionLevel.PROVINCE },
    { code: '410700', name: '新乡市', parent: '410000', level: RegionLevel.CITY },
    { code: '410726', name: '延津县', parent: '410700', level: RegionLevel.DISTRICT }, // 塔铺站
    { code: '411300', name: '南阳市', parent: '410000', level: RegionLevel.CITY },
    { code: '411302', name: '宛城区', parent: '411300', level: RegionLevel.DISTRICT }, // 溧河站

    // 辽宁 (21)
    { code: '210000', name: '辽宁省', parent: null, level: RegionLevel.PROVINCE },
    { code: '210200', name: '大连市', parent: '210000', level: RegionLevel.CITY },
    { code: '210700', name: '锦州市', parent: '210000', level: RegionLevel.CITY },
];

const STATIONS = [
    // --- 港口 (Ports) ---
    {
        name: '北良港',
        code: 'PORT_BEILIANG',
        address: '辽宁省大连市',
        regionCode: '210200',
        commodities: ['玉米', '小麦', '大豆'],
        geo: { lng: 121.614, lat: 38.914 }, // approx
        desc: '港口',
        prices: ['平舱价', '港口价', '集港价'],
        type: CollectionPointType.PORT
    },
    {
        name: '大连港',
        code: 'PORT_DALIAN',
        address: '辽宁省大连市',
        regionCode: '210200',
        commodities: ['玉米', '大豆'],
        geo: { lng: 121.600, lat: 38.900 },
        desc: '港口',
        prices: ['平舱价', '港口价', '集港价'],
        type: CollectionPointType.PORT
    },
    {
        name: '锦州港',
        code: 'PORT_JINZHOU',
        address: '辽宁省锦州市',
        regionCode: '210700',
        commodities: ['玉米'],
        geo: { lng: 121.100, lat: 40.800 },
        desc: '港口',
        prices: ['平舱价', '港口价', '集港价'],
        type: CollectionPointType.PORT
    },

    // --- 北方站点 (产区站台 - Production Area) ---
    {
        name: '农安站',
        code: 'STATION_NONGAN',
        address: '吉林省长春市农安县',
        regionCode: '220122', // 农安县
        commodities: ['玉米', '大豆'],
        geo: { lng: 125.184, lat: 44.432 },
        desc: '产区站台',
        prices: ['站台价-产区', '收购价', '潮粮价']
    },
    {
        name: '乌兰浩特北站',
        code: 'STATION_ULANHOT_N',
        address: '内蒙古自治区兴安盟乌兰浩特市',
        regionCode: '152201', // 乌兰浩特市
        commodities: ['玉米'],
        geo: { lng: 122.093, lat: 46.064 },
        desc: '产区站台',
        prices: ['站台价-产区', '收购价', '潮粮价']
    },
    {
        name: '松原站',
        code: 'STATION_SONGYUAN',
        address: '吉林省松原市宁江区',
        regionCode: '220702', // 宁江区
        commodities: ['玉米', '大豆', '稻谷'],
        geo: { lng: 124.823, lat: 45.141 },
        desc: '产区站台',
        prices: ['站台价-产区', '收购价', '潮粮价']
    },
    {
        name: '华家站',
        code: 'STATION_HUAJIA',
        address: '吉林省长春市农安县华家镇',
        regionCode: '220122', // 农安县
        commodities: ['玉米'],
        geo: { lng: 125.450, lat: 44.200 },
        desc: '产区站台',
        prices: ['站台价-产区', '收购价', '潮粮价']
    },
    {
        name: '镇赉站',
        code: 'STATION_ZHENLAI',
        address: '吉林省白城市镇赉县',
        regionCode: '220821', // 镇赉县
        commodities: ['玉米', '稻谷'],
        geo: { lng: 123.199, lat: 45.848 },
        desc: '产区站台',
        prices: ['站台价-产区', '收购价', '潮粮价']
    },

    // --- 南方站点 (销区站台 - Sales Area) ---
    {
        name: '沂南站',
        code: 'STATION_YINAN',
        address: '山东省临沂市沂南县',
        regionCode: '371321', // 沂南县
        commodities: ['小麦', '玉米'],
        geo: { lng: 118.470, lat: 35.551 },
        desc: '销区站台',
        prices: ['站台价-销区', '到站价', '分销价']
    },
    {
        name: '塔铺站',
        code: 'STATION_TAPU',
        address: '河南省新乡市延津县塔铺街道',
        regionCode: '410726', // 延津县
        commodities: ['小麦', '玉米'],
        geo: { lng: 114.200, lat: 35.250 },
        desc: '销区站台',
        prices: ['站台价-销区', '到站价', '分销价']
    },
    {
        name: '沙土集站',
        code: 'STATION_SHATUJI',
        address: '山东省菏泽市牡丹区沙土镇',
        regionCode: '371702', // 牡丹区
        commodities: ['小麦', '玉米', '大豆'],
        geo: { lng: 115.650, lat: 35.350 },
        desc: '销区站台',
        prices: ['站台价-销区', '到站价', '分销价']
    },
    {
        name: '溧河站',
        code: 'STATION_LIHE',
        address: '河南省南阳市宛城区溧河乡',
        regionCode: '411302', // 宛城区
        commodities: ['小麦', '玉米'],
        geo: { lng: 112.580, lat: 32.950 },
        desc: '销区站台',
        prices: ['站台价-销区', '到站价', '分销价']
    }
];

async function main() {
    console.log('🌏 开始播种行政区划 (Regions)...');

    // 1. 播种行政区划
    for (const r of REGIONS_DATA) {
        await prisma.administrativeRegion.upsert({
            where: { code: r.code },
            update: {
                name: r.name,
                parentCode: r.parent,
                level: r.level
            },
            create: {
                code: r.code,
                name: r.name,
                parentCode: r.parent,
                level: r.level
            }
        });
        console.log(`   + 区划: ${r.name}`);
    }

    console.log('🚉 开始播种采集点站点 (Collection Points)...');

    for (const st of STATIONS) {
        // 构建别名
        const aliases: string[] = [];
        // 如果是站台，且不是港口，加“台”后缀
        const type = (st as any).type || CollectionPointType.STATION;

        if (type === CollectionPointType.STATION) {
            aliases.push(st.name + '台');
        } else {
            aliases.push(st.name); // 港口直接用原名
        }

        const cp = await prisma.collectionPoint.upsert({
            where: { code: st.code },
            update: {
                name: st.name,
                address: st.address,
                longitude: st.geo.lng,
                latitude: st.geo.lat,
                commodities: st.commodities,
                priceSubTypes: st.prices,
                defaultSubType: st.prices[0],
                matchRegionCodes: [st.regionCode.substring(0, 2) + '0000'],
                regionCode: st.regionCode,
                aliases: aliases,
                description: st.desc,
                type: type // Update type if changed
            },
            create: {
                name: st.name,
                code: st.code,
                type: type,
                address: st.address,
                longitude: st.geo.lng,
                latitude: st.geo.lat,
                commodities: st.commodities,
                priceSubTypes: st.prices,
                defaultSubType: st.prices[0],
                matchRegionCodes: [st.regionCode.substring(0, 2) + '0000'],
                regionCode: st.regionCode,
                aliases: aliases,
                description: st.desc,
                isActive: true
            }
        });
        console.log(`✅ 采集点: ${cp.name} [${st.desc}] (${type})`);
    }

    console.log('🎉 采集点与行政区划关联完成。');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

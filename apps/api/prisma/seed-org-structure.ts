/// <reference types="node" />
import { PrismaClient, OrganizationType, UserStatus, Gender } from '@prisma/client';

const prisma = new PrismaClient();

// ----------------------------------------------------------------------
// 1. 姓名与拼音映射库
// ----------------------------------------------------------------------
const CHAR_MAP: Record<string, string> = {
    // Surnames
    '李': 'li', '王': 'wang', '张': 'zhang', '刘': 'liu', '陈': 'chen',
    '杨': 'yang', '赵': 'zhao', '黄': 'huang', '周': 'zhou', '吴': 'wu',
    '徐': 'xu', '孙': 'sun', '胡': 'hu', '朱': 'zhu', '高': 'gao',
    '林': 'lin', '何': 'he', '郭': 'guo', '马': 'ma', '罗': 'luo',
    '梁': 'liang', '宋': 'song', '郑': 'zheng', '谢': 'xie', '韩': 'han',
    '唐': 'tang', '冯': 'feng', '于': 'yu', '董': 'dong', '萧': 'xiao',
    '程': 'cheng', '曹': 'cao', '袁': 'yuan', '邓': 'deng', '许': 'xu',
    '傅': 'fu', '沈': 'shen', '曾': 'zeng', '彭': 'peng', '吕': 'lv',
    '苏': 'su', '卢': 'lu', '蒋': 'jiang', '蔡': 'cai', '贾': 'jia',
    '丁': 'ding', '魏': 'wei', '薛': 'xue', '叶': 'ye', '阎': 'yan',
    '余': 'yu', '潘': 'pan', '杜': 'du', '戴': 'dai', '夏': 'xia',
    '钟': 'zhong', '汪': 'wang', '田': 'tian', '任': 'ren', '姜': 'jiang',
    '范': 'fan', '方': 'fang', '石': 'shi', '姚': 'yao', '谭': 'tan',
    '廖': 'liao', '邹': 'zou', '熊': 'xiong', '金': 'jin', '陆': 'lu',
    '郝': 'hao', '孔': 'kong', '白': 'bai', '崔': 'cui', '康': 'kang',
    '毛': 'mao', '邱': 'qiu', '秦': 'qin', '江': 'jiang', '史': 'shi',
    '顾': 'gu', '侯': 'hou', '邵': 'shao', '孟': 'meng', '龙': 'long',
    '万': 'wan', '段': 'duan', '雷': 'lei', '钱': 'qian', '汤': 'tang',
    '尹': 'yin', '黎': 'li', '易': 'yi', '常': 'chang', '武': 'wu',
    '乔': 'qiao', '贺': 'he', '赖': 'lai', '龚': 'gong', '文': 'wen',

    // Male Names
    '伟': 'wei', '强': 'qiang', '磊': 'lei', '军': 'jun', '洋': 'yang',
    '勇': 'yong', '杰': 'jie', '涛': 'tao', '明': 'ming', '超': 'chao',
    '浩': 'hao', '刚': 'gang', '平': 'ping', '邦': 'bang', '克': 'ke',
    '生': 'sheng', '海': 'hai', '波': 'bo', '建': 'jian', '国': 'guo',
    '华': 'hua', '亮': 'liang', '志': 'zhi', '斌': 'bin', '学': 'xue',
    '辉': 'hui', '力': 'li', '大': 'da', '卫': 'wei', '岩': 'yan',

    // Female Names
    '芳': 'fang', '娜': 'na', '敏': 'min', '静': 'jing', '艳': 'yan',
    '娟': 'juan', '秀': 'xiu', '英': 'ying', '桂': 'gui', '芝': 'zhi',
    '红': 'hong', '玉': 'yu', '兰': 'lan', '梅': 'mei', '丽': 'li',
    '霞': 'xia', '玲': 'ling', '萍': 'ping', '珍': 'zhen', '菲': 'fei',
    '雪': 'xue', '琳': 'lin', '晶': 'jing', '婷': 'ting', '莉': 'li'
};

const SURNAMES = '李王张刘陈杨赵黄周吴徐孙胡朱高林何郭马罗梁宋郑谢韩唐冯于董萧程曹袁邓许傅沈曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文';
const MALE_GIVEN_NAMES = '伟强磊军洋勇杰涛明超浩刚平邦克生海波建国华亮志斌学辉力大卫岩';
const FEMALE_GIVEN_NAMES = '芳娜敏静艳娟秀英桂芝红玉兰梅丽霞玲萍珍菲雪琳晶婷莉';

function generatePerson() {
    const surnameChar = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];

    // Determine Gender
    const gender = Math.random() > 0.5 ? Gender.MALE : Gender.FEMALE;
    const nameList = gender === Gender.MALE ? MALE_GIVEN_NAMES : FEMALE_GIVEN_NAMES;

    const givenLength = Math.random() > 0.7 ? 2 : 1;
    let givenChars = '';

    for (let i = 0; i < givenLength; i++) {
        const char = nameList[Math.floor(Math.random() * nameList.length)];
        givenChars += char;
    }

    const fullName = surnameChar + givenChars;

    // Generate Pinyin
    const surPinyin = CHAR_MAP[surnameChar] || 'user';
    let givenPinyin = '';
    for (let char of givenChars) {
        givenPinyin += CHAR_MAP[char] || '';
    }
    if (!givenPinyin) givenPinyin = gender === Gender.MALE ? 'nan' : 'nv';

    return {
        name: fullName,
        pinyin: `${surPinyin}.${givenPinyin}`,
        gender: gender
    };
}

// ----------------------------------------------------------------------
// 2. 模拟数据库：确保唯一性
// ----------------------------------------------------------------------
const USED_EMAILS = new Set<string>();
const USED_IDS = new Set<string>();

function getUniqueEmail(basePinyin: string): string {
    let email = `${basePinyin}@cofco.com`;
    let counter = 1;
    while (USED_EMAILS.has(email)) {
        email = `${basePinyin}${counter}@cofco.com`;
        counter++;
    }
    USED_EMAILS.add(email);
    return email;
}

function getUniqueId(): string {
    // Generate CT + 8 digits
    let id = '';
    do {
        const num = Math.floor(10000000 + Math.random() * 90000000); // 10000000 - 99999999
        id = `CT${num}`;
    } while (USED_IDS.has(id));
    USED_IDS.add(id);
    return id;
}

function generatePhone(): string {
    const prefixes = ['135', '136', '137', '138', '139', '150', '151', '158', '159', '186', '187', '188', '199'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const suffix = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    return prefix + suffix;
}

function generateHireDate(): Date {
    // Random date within last 5 years
    const end = new Date();
    const start = new Date(end.getFullYear() - 5, 0, 1);
    const timeDiff = end.getTime() - start.getTime();
    const randomTime = Math.random() * timeDiff;
    return new Date(start.getTime() + randomTime);
}

// ----------------------------------------------------------------------
// 3. 用户生成逻辑
// ----------------------------------------------------------------------

async function ensureUser(
    branchId: string,
    deptId: string,
    deptCode: string,
    roleTitle: string, // '部门经理' | '业务专员'
    count: number
) {
    for (let i = 0; i < count; i++) {
        const person = generatePerson();
        const email = getUniqueEmail(person.pinyin);
        const employeeNo = getUniqueId();
        const username = employeeNo;

        await prisma.user.create({
            data: {
                username: username,
                name: person.name,
                email: email,
                phone: generatePhone(),
                hireDate: generateHireDate(),
                gender: person.gender, // Set Gender
                organizationId: branchId,
                departmentId: deptId,
                position: roleTitle,
                status: UserStatus.ACTIVE,
                employeeNo: employeeNo
            }
        });
    }
}

async function main() {
    console.log('🧹 清理旧的虚拟员工数据...');
    // Delete all users that look like they were generated by us (ending in @cofco.com)
    // Avoid deleting real admin if they have @cofco.com, assuming admin is special.
    await prisma.user.deleteMany({
        where: {
            email: { endsWith: '@cofco.com' },
            username: { not: 'admin' } // Protect admin
        }
    });
    console.log('✅ 清理完成');

    console.log('🏢 开始播种组织架构数据 (COFCO Trade Structure)...');

    // 1. 总部：中粮贸易以一级单位存在
    const headquarters = await prisma.organization.upsert({
        where: { code: 'COFCO_TRADE_HQ' },
        update: {},
        create: { name: '中粮贸易', code: 'COFCO_TRADE_HQ', type: OrganizationType.HEADQUARTERS }
    });
    console.log(`✅ 总部: ${headquarters.name}`);

    // 2. 大区 (Level 1 Roots -> Children of HQ)
    const regions = [
        { name: '东北大区', code: 'REGION_NE', type: OrganizationType.REGION },
        { name: '内陆大区', code: 'REGION_INLAND', type: OrganizationType.REGION },
        { name: '沿江大区', code: 'REGION_YANGTZE', type: OrganizationType.REGION },
        { name: '沿海大区', code: 'REGION_COASTAL', type: OrganizationType.REGION },
        { name: '港口平台', code: 'PLATFORM_PORT', type: OrganizationType.REGION },
    ];
    const regionMap: Record<string, string> = {};
    for (const reg of regions) {
        const r = await prisma.organization.upsert({
            where: { code: reg.code },
            update: { parentId: headquarters.id }, // Reparent to HQ
            create: { name: reg.name, code: reg.code, type: reg.type, parentId: headquarters.id }
        });
        regionMap[reg.code] = r.id;
    }

    // Helper to process branches
    const processBranches = async (regionCode: string, branches: { name: string, code: string }[], deptTypes: { name: string, suffix: string }[]) => {
        const regId = regionMap[regionCode];
        if (!regId) return;

        for (const br of branches) {
            const branchOrg = await prisma.organization.upsert({
                where: { code: br.code },
                update: { parentId: regId },
                create: { name: br.name, code: br.code, type: OrganizationType.BRANCH, parentId: regId }
            });
            console.log(`     -> 经营部: ${br.name}`);

            for (const dt of deptTypes) {
                const deptCode = `${br.code}_${dt.suffix}`;
                const d = await prisma.department.upsert({
                    where: { organizationId_code: { organizationId: branchOrg.id, code: deptCode } },
                    update: {},
                    create: { name: dt.name, code: deptCode, organizationId: branchOrg.id }
                });

                // Generate Users (1 Manager, 3 Staff)
                // Since we deleted all old users, we just create new ones.
                await ensureUser(branchOrg.id, d.id, deptCode, '部门经理', 1);
                await ensureUser(branchOrg.id, d.id, deptCode, '业务专员', 3);
            }
        }
    };

    // 3. 内陆大区
    await processBranches('REGION_INLAND', [
        { name: '河北经营部', code: 'BRANCH_HEBEI' },
        { name: '河南经营部', code: 'BRANCH_HENAN' },
        { name: '山东经营部', code: 'BRANCH_SHANDONG' },
        { name: '西北经营部', code: 'BRANCH_NW' },
    ], [
        { name: '饲料原料部', suffix: 'FEED' },
        { name: '食品原料部', suffix: 'FOOD' }
    ]);

    // 4. 东北大区
    await processBranches('REGION_NE', [
        { name: '沈阳经营部', code: 'BRANCH_SY' },
        { name: '通辽经营部', code: 'BRANCH_TL' },
        { name: '佳木斯经营部', code: 'BRANCH_JMS' },
        { name: '齐齐哈尔经营部', code: 'BRANCH_QQHR' },
        { name: '长春经营部', code: 'BRANCH_CC' },
        { name: '吉林经营部', code: 'BRANCH_JL' },
        { name: '白城经营部', code: 'BRANCH_BC' },
        { name: '哈尔滨经营部', code: 'BRANCH_HRB' },
    ], [
        { name: '销售物流部', suffix: 'SALES_LOGISTICS' }
    ]);

    // 5. 沿江大区
    await processBranches('REGION_YANGTZE', [
        { name: '华东经营部', code: 'BRANCH_EAST' },
        { name: '华中经营部', code: 'BRANCH_CENTRAL' },
        { name: '江西经营部', code: 'BRANCH_JX' },
        { name: '南良经营部', code: 'BRANCH_NL' },
        { name: '西南经营部', code: 'BRANCH_SW' },
    ], [
        { name: '饲料原料部', suffix: 'FEED' },
        { name: '食品原料部', suffix: 'FOOD' }
    ]);

    // 6. 沿海大区
    await processBranches('REGION_COASTAL', [
        { name: '珠三角经营部', code: 'BRANCH_PRD' },
        { name: '福建经营部', code: 'BRANCH_FUJIAN' },
        { name: '海南经营部', code: 'BRANCH_HAINAN' },
        { name: '广西经营部', code: 'BRANCH_GUANGXI' },
        { name: '粤西经营部', code: 'BRANCH_WEST_GUANGDONG' },
    ], [
        { name: '饲料原料部', suffix: 'FEED' },
        { name: '食品原料部', suffix: 'FOOD' }
    ]);

    // 7. 港口平台
    await processBranches('PLATFORM_PORT', [
        { name: '锦州平台', code: 'PLATFORM_JZ' },
        { name: '大连平台', code: 'PLATFORM_DL' },
        { name: '丹东平台', code: 'PLATFORM_DD' },
        { name: '鲅鱼圈平台', code: 'PLATFORM_BYQ' },
    ], [
        { name: '港口运营部', suffix: 'OPS' }
    ]);

    console.log('🎉 组织架构与真实人员播种完成。');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

import { PrismaClient, EnterpriseType, ContactRole, EntityStatus } from '@prisma/client';

const prisma = new PrismaClient();

// 企业Mock数据 - 基于真实饲料行业企业
const enterprises = [
    // ===================== 饲料集团 =====================
    {
        name: '新希望六和股份有限公司',
        shortName: '新希望六和',
        taxId: '91510100000000001A',
        types: [EnterpriseType.GROUP, EnterpriseType.SUPPLIER],
        province: '四川省',
        city: '成都市',
        address: '锦江区东大街上东大街段216号',
        description: '中国最大的农牧企业之一，业务涵盖饲料、养殖、食品加工全产业链。年饲料产能超3000万吨。',
        riskScore: 95,
        contacts: [
            { name: '张明远', title: '采购总监', role: ContactRole.PROCUREMENT, phone: '13800138001', email: 'zhang.my@newhope.cn', notes: '决策人' },
            { name: '李华', title: '供应链经理', role: ContactRole.EXECUTION, phone: '13800138002', email: 'li.h@newhope.cn', notes: '响应快' },
            { name: '王芳', title: '财务总监', role: ContactRole.FINANCE, phone: '13800138003', email: 'wang.f@newhope.cn' },
        ],
        bankAccounts: [
            { bankName: '中国工商银行', accountNumber: '4402234801234567890', accountName: '新希望六和股份有限公司', branch: '成都锦江支行', isDefault: true, isWhitelisted: true },
            { bankName: '中国建设银行', accountNumber: '51001234567890123456', accountName: '新希望六和股份有限公司', branch: '成都高新支行', isDefault: false, isWhitelisted: true },
        ],
    },
    {
        name: '通威股份有限公司',
        shortName: '通威股份',
        taxId: '91510100000000002B',
        types: [EnterpriseType.GROUP, EnterpriseType.SUPPLIER],
        province: '四川省',
        city: '成都市',
        address: '高新区天府二街368号',
        description: '全球水产饲料龙头企业，同时也是光伏新能源领军企业。水产饲料全国市场占有率第一。',
        riskScore: 93,
        contacts: [
            { name: '陈建国', title: '原料采购部长', role: ContactRole.PROCUREMENT, phone: '13900139001', email: 'chen.jg@tongwei.com', notes: '关键决策人' },
            { name: '赵丽', title: '财务经理', role: ContactRole.FINANCE, phone: '13900139002', email: 'zhao.l@tongwei.com' },
        ],
        bankAccounts: [
            { bankName: '招商银行', accountNumber: '6226220012345678901', accountName: '通威股份有限公司', branch: '成都分行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '海大集团股份有限公司',
        shortName: '海大集团',
        taxId: '91440100000000003C',
        types: [EnterpriseType.GROUP, EnterpriseType.SUPPLIER],
        province: '广东省',
        city: '广州市',
        address: '番禺区南村镇坑头村海大科技园',
        description: '中国领先的水产饲料、畜禽饲料生产企业，拥有完整的产业链条。',
        riskScore: 92,
        contacts: [
            { name: '林志强', title: '采购中心总经理', role: ContactRole.PROCUREMENT, phone: '13600136001', email: 'lin.zq@haid.com.cn' },
            { name: '黄美玲', title: '结算主管', role: ContactRole.FINANCE, phone: '13600136002', email: 'huang.ml@haid.com.cn' },
        ],
        bankAccounts: [
            { bankName: '中国农业银行', accountNumber: '44050101040012345', accountName: '海大集团股份有限公司', branch: '广州番禺支行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '正大集团（中国区）',
        shortName: '正大集团',
        taxId: '91310000000000004D',
        types: [EnterpriseType.GROUP, EnterpriseType.CUSTOMER, EnterpriseType.SUPPLIER],
        province: '上海市',
        city: '上海市',
        address: '浦东新区陆家嘴环路1000号恒生银行大厦',
        description: '泰国正大集团在华投资企业，涉及饲料、养殖、食品加工、零售等多元化业务。',
        riskScore: 96,
        contacts: [
            { name: 'Michael Wang', title: '采购VP', role: ContactRole.MANAGEMENT, phone: '13700137001', email: 'michael.w@cpgroup.cn', notes: '高管' },
            { name: '钱进', title: '原料部经理', role: ContactRole.PROCUREMENT, phone: '13700137002', email: 'qian.j@cpgroup.cn' },
            { name: '孙莉', title: '财务主管', role: ContactRole.FINANCE, phone: '13700137003', email: 'sun.l@cpgroup.cn' },
        ],
        bankAccounts: [
            { bankName: '汇丰银行', accountNumber: '808012345678901234', accountName: '正大（中国）投资有限公司', branch: '上海分行', isDefault: true, isWhitelisted: true },
        ],
    },

    // ===================== 饲料企业 =====================
    {
        name: '双胞胎（集团）股份有限公司',
        shortName: '双胞胎集团',
        taxId: '91360100000000005E',
        types: [EnterpriseType.CUSTOMER, EnterpriseType.SUPPLIER],
        province: '江西省',
        city: '南昌市',
        address: '经济技术开发区双胞胎大道1号',
        description: '专注于猪饲料研发生产的大型企业集团，在全国拥有超过100家分公司。',
        riskScore: 88,
        contacts: [
            { name: '刘德华', title: '采购总监', role: ContactRole.PROCUREMENT, phone: '13500135001', email: 'liu.dh@sbt.com' },
            { name: '周杰伦', title: '物流经理', role: ContactRole.EXECUTION, phone: '13500135002', email: 'zhou.jl@sbt.com', notes: '物流对接' },
        ],
        bankAccounts: [
            { bankName: '中国银行', accountNumber: '338920123456789012', accountName: '双胞胎（集团）股份有限公司', branch: '南昌高新支行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '禾丰牧业股份有限公司',
        shortName: '禾丰牧业',
        taxId: '91210100000000006F',
        types: [EnterpriseType.CUSTOMER, EnterpriseType.SUPPLIER],
        province: '辽宁省',
        city: '沈阳市',
        address: '沈北新区辉山经济开发区禾丰路1号',
        description: '东北地区最大的饲料生产企业，产品覆盖猪料、禽料、反刍料。',
        riskScore: 85,
        contacts: [
            { name: '金波', title: '采购经理', role: ContactRole.PROCUREMENT, phone: '13400134001', email: 'jin.b@wellhope.cn' },
        ],
        bankAccounts: [
            { bankName: '中国工商银行', accountNumber: '3301234567890123456', accountName: '禾丰牧业股份有限公司', branch: '沈阳分行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '唐人神集团股份有限公司',
        shortName: '唐人神',
        taxId: '91430100000000007G',
        types: [EnterpriseType.CUSTOMER],
        province: '湖南省',
        city: '株洲市',
        address: '天元区长江南路2号唐人神大厦',
        description: '生猪产业链一体化龙头企业，拥有完整的饲料-养殖-屠宰-加工体系。',
        riskScore: 83,
        contacts: [
            { name: '谢瑞', title: '原料采购部长', role: ContactRole.PROCUREMENT, phone: '13300133001', email: 'xie.r@tangrenshen.com' },
            { name: '陈敏', title: '出纳', role: ContactRole.FINANCE, phone: '13300133002', email: 'chen.m@tangrenshen.com' },
        ],
        bankAccounts: [
            { bankName: '中国建设银行', accountNumber: '43001578901234567890', accountName: '唐人神集团股份有限公司', branch: '株洲天元支行', isDefault: true, isWhitelisted: false },
        ],
    },

    // ===================== 深加工企业 =====================
    {
        name: '中粮生物科技股份有限公司',
        shortName: '中粮科技',
        taxId: '91340200000000008H',
        types: [EnterpriseType.CUSTOMER],
        province: '安徽省',
        city: '蚌埠市',
        address: '淮上区沫河口工业园',
        description: '中粮集团旗下玉米深加工龙头企业，主营燃料乙醇、赖氨酸、柠檬酸等产品。',
        riskScore: 94,
        contacts: [
            { name: '肖华', title: '原料采购总监', role: ContactRole.PROCUREMENT, phone: '13200132001', email: 'xiao.h@cofco.com', notes: '年采购量大' },
            { name: '田野', title: '物流主管', role: ContactRole.EXECUTION, phone: '13200132002', email: 'tian.y@cofco.com' },
            { name: '杨光', title: 'CFO助理', role: ContactRole.FINANCE, phone: '13200132003', email: 'yang.g@cofco.com' },
        ],
        bankAccounts: [
            { bankName: '中信银行', accountNumber: '7310012345678901234', accountName: '中粮生物科技股份有限公司', branch: '合肥分行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '诸城兴贸玉米开发有限公司',
        shortName: '兴贸玉米',
        taxId: '91370782000000009I',
        types: [EnterpriseType.CUSTOMER],
        province: '山东省',
        city: '潍坊市',
        address: '诸城市龙都街道兴贸路1号',
        description: '大型玉米深加工企业，主要生产葡萄糖、麦芽糊精、果葡糖浆等产品。',
        riskScore: 82,
        contacts: [
            { name: '孙鹏', title: '采购主管', role: ContactRole.PROCUREMENT, phone: '13100131001', email: 'sun.p@xingmao.com' },
        ],
        bankAccounts: [
            { bankName: '中国农业银行', accountNumber: '1523012345678901234', accountName: '诸城兴贸玉米开发有限公司', branch: '诸城支行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '西王食品股份有限公司',
        shortName: '西王食品',
        taxId: '91371600000000010J',
        types: [EnterpriseType.CUSTOMER, EnterpriseType.SUPPLIER],
        province: '山东省',
        city: '滨州市',
        address: '邹平市西王工业园',
        description: '国内最大的玉米油生产企业，同时生产玉米淀粉、葡萄糖等深加工产品。',
        riskScore: 87,
        contacts: [
            { name: '王磊', title: '原料部负责人', role: ContactRole.PROCUREMENT, phone: '13000130001', email: 'wang.l@xiwang.com.cn' },
            { name: '李娜', title: '财务经理', role: ContactRole.FINANCE, phone: '13000130002', email: 'li.n@xiwang.com.cn' },
        ],
        bankAccounts: [
            { bankName: '兴业银行', accountNumber: '461012345678901234', accountName: '西王食品股份有限公司', branch: '济南分行', isDefault: true, isWhitelisted: true },
        ],
    },

    // ===================== 贸易企业 =====================
    {
        name: '中粮贸易有限公司',
        shortName: '中粮贸易',
        taxId: '91110000000000011K',
        types: [EnterpriseType.SUPPLIER],
        province: '北京市',
        city: '北京市',
        address: '朝阳区朝阳门南大街8号中粮福临门大厦',
        description: '中粮集团核心贸易平台，经营粮油、饲料原料等大宗商品贸易。',
        riskScore: 98,
        contacts: [
            { name: '郑伟', title: '华北区销售总监', role: ContactRole.PROCUREMENT, phone: '12900129001', email: 'zheng.w@cofcotrade.com', notes: 'VIP客户' },
            { name: '高明', title: '物流调度', role: ContactRole.EXECUTION, phone: '12900129002', email: 'gao.m@cofcotrade.com' },
            { name: '刘晓燕', title: '财务总监', role: ContactRole.FINANCE, phone: '12900129003', email: 'liu.xy@cofcotrade.com' },
            { name: '张总', title: '总经理', role: ContactRole.MANAGEMENT, phone: '12900129000', email: 'zhang@cofcotrade.com', notes: '核心决策' },
        ],
        bankAccounts: [
            { bankName: '中国银行', accountNumber: '342856789012345678', accountName: '中粮贸易有限公司', branch: '北京分行营业部', isDefault: true, isWhitelisted: true },
            { bankName: '中国工商银行', accountNumber: '0200012345678901234', accountName: '中粮贸易有限公司', branch: '北京朝阳支行', isDefault: false, isWhitelisted: true },
        ],
    },
    {
        name: '嘉吉投资（中国）有限公司',
        shortName: '嘉吉中国',
        taxId: '91310000000000012L',
        types: [EnterpriseType.SUPPLIER],
        province: '上海市',
        city: '上海市',
        address: '浦东新区银城中路501号上海中心大厦',
        description: '全球最大的私人控股公司嘉吉在华业务总部，经营粮食、饲料、食品等。',
        riskScore: 97,
        contacts: [
            { name: 'David Chen', title: 'Trading Director', role: ContactRole.MANAGEMENT, phone: '12800128001', email: 'david.chen@cargill.com' },
            { name: '李明', title: '销售经理', role: ContactRole.PROCUREMENT, phone: '12800128002', email: 'ming.li@cargill.com' },
        ],
        bankAccounts: [
            { bankName: '花旗银行', accountNumber: '9012345678901234', accountName: '嘉吉投资（中国）有限公司', branch: '上海分行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '路易达孚（中国）贸易有限责任公司',
        shortName: '路易达孚',
        taxId: '91310000000000013M',
        types: [EnterpriseType.SUPPLIER],
        province: '上海市',
        city: '上海市',
        address: '黄浦区圆明园路169号协进大楼',
        description: '法国路易达孚集团在华贸易公司，主营大豆、玉米等农产品贸易。',
        riskScore: 95,
        contacts: [
            { name: 'Sophie Liu', title: '中国区采购负责人', role: ContactRole.PROCUREMENT, phone: '12700127001', email: 'sophie.liu@ldc.com' },
        ],
        bankAccounts: [
            { bankName: '法国巴黎银行', accountNumber: '3456789012345678', accountName: '路易达孚（中国）贸易有限责任公司', branch: '上海分行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '山东渤海实业股份有限公司',
        shortName: '渤海实业',
        taxId: '91371600000000014N',
        types: [EnterpriseType.SUPPLIER, EnterpriseType.CUSTOMER],
        province: '山东省',
        city: '滨州市',
        address: '滨城区滨北街道渤海十八路渤海大厦',
        description: '大型粮油加工和贸易企业，主营大豆压榨、粮食贸易。',
        riskScore: 86,
        contacts: [
            { name: '马超', title: '贸易部经理', role: ContactRole.PROCUREMENT, phone: '12600126001', email: 'ma.c@bohaioil.com' },
            { name: '齐红', title: '财务', role: ContactRole.FINANCE, phone: '12600126002', email: 'qi.h@bohaioil.com' },
        ],
        bankAccounts: [
            { bankName: '中国农业银行', accountNumber: '15282012345678901', accountName: '山东渤海实业股份有限公司', branch: '滨州分行', isDefault: true, isWhitelisted: true },
        ],
    },

    // ===================== 物流企业 =====================
    {
        name: '象屿股份有限公司',
        shortName: '象屿股份',
        taxId: '91350000000000015P',
        types: [EnterpriseType.LOGISTICS, EnterpriseType.SUPPLIER],
        province: '福建省',
        city: '厦门市',
        address: '思明区象屿路88号象屿大厦',
        description: '大型综合物流和农产品供应链服务商，拥有完善的粮食仓储和物流网络。',
        riskScore: 90,
        contacts: [
            { name: '吴飞', title: '物流事业部总监', role: ContactRole.EXECUTION, phone: '12500125001', email: 'wu.f@xiangyu.cn', notes: '物流核心对接' },
            { name: '郑芳', title: '财务', role: ContactRole.FINANCE, phone: '12500125002', email: 'zheng.f@xiangyu.cn' },
        ],
        bankAccounts: [
            { bankName: '厦门国际银行', accountNumber: '888012345678901234', accountName: '象屿股份有限公司', branch: '厦门总行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '中国外运股份有限公司',
        shortName: '中国外运',
        taxId: '91110000000000016Q',
        types: [EnterpriseType.LOGISTICS],
        province: '北京市',
        city: '北京市',
        address: '东城区东直门南大街5号中青旅大厦',
        description: '招商局集团旗下物流旗舰，提供海陆空全方位物流服务。',
        riskScore: 92,
        contacts: [
            { name: '赵强', title: '大客户经理', role: ContactRole.EXECUTION, phone: '12400124001', email: 'zhao.q@sinotrans.com' },
        ],
        bankAccounts: [
            { bankName: '招商银行', accountNumber: '1109876543210987654', accountName: '中国外运股份有限公司', branch: '北京分行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '山东港口物流集团有限公司',
        shortName: '山东港口物流',
        taxId: '91370000000000017R',
        types: [EnterpriseType.LOGISTICS],
        province: '山东省',
        city: '青岛市',
        address: '市北区港青路7号',
        description: '山东港口集团旗下物流平台，提供港口物流、多式联运服务。',
        riskScore: 88,
        contacts: [
            { name: '姜涛', title: '散货物流经理', role: ContactRole.EXECUTION, phone: '12300123001', email: 'jiang.t@sdport.com' },
            { name: '徐静', title: '结算主管', role: ContactRole.FINANCE, phone: '12300123002', email: 'xu.j@sdport.com' },
        ],
        bankAccounts: [
            { bankName: '中国建设银行', accountNumber: '37050166012345678', accountName: '山东港口物流集团有限公司', branch: '青岛分行', isDefault: true, isWhitelisted: true },
        ],
    },
    {
        name: '锦程国际物流集团股份有限公司',
        shortName: '锦程物流',
        taxId: '91210200000000018S',
        types: [EnterpriseType.LOGISTICS],
        province: '辽宁省',
        city: '大连市',
        address: '中山区港湾街20号',
        description: '集国际货代、报关、仓储、运输于一体的综合物流企业。',
        riskScore: 84,
        contacts: [
            { name: '王海', title: '业务总监', role: ContactRole.EXECUTION, phone: '12200122001', email: 'wang.h@jctrans.com' },
        ],
        bankAccounts: [
            { bankName: '交通银行', accountNumber: '212060200012345678', accountName: '锦程国际物流集团股份有限公司', branch: '大连分行', isDefault: true, isWhitelisted: true },
        ],
    },
];

async function main() {
    console.log('🌱 开始导入客商Mock数据...\n');

    for (const enterprise of enterprises) {
        const { contacts, bankAccounts, ...enterpriseData } = enterprise;

        try {
            // 检查是否已存在
            const existing = await prisma.enterprise.findUnique({
                where: { taxId: enterpriseData.taxId },
            });

            if (existing) {
                console.log(`⏭️  跳过已存在: ${enterpriseData.name}`);
                continue;
            }

            // 创建企业和关联数据
            const created = await prisma.enterprise.create({
                data: {
                    ...enterpriseData,
                    contacts: contacts ? { create: contacts } : undefined,
                    bankAccounts: bankAccounts ? { create: bankAccounts } : undefined,
                },
                include: {
                    _count: {
                        select: { contacts: true, bankAccounts: true },
                    },
                },
            });

            console.log(`✅ 创建成功: ${created.name} (联系人: ${created._count.contacts}, 银行账户: ${created._count.bankAccounts})`);
        } catch (error) {
            console.error(`❌ 创建失败: ${enterpriseData.name}`, error);
        }
    }

    // 创建集团-子公司关系
    console.log('\n📊 创建集团-子公司关系...\n');

    // 新希望六和的子公司
    const newHope = await prisma.enterprise.findFirst({ where: { shortName: '新希望六和' } });
    if (newHope) {
        const newHopeSubsidiaries = [
            {
                name: '新希望六和饲料（青岛）有限公司',
                shortName: '新希望青岛',
                taxId: '91370200000000019T',
                types: [EnterpriseType.SUPPLIER],
                province: '山东省',
                city: '青岛市',
                address: '即墨区龙泉街道新希望路1号',
                description: '新希望六和在山东地区的重要饲料生产基地。',
                riskScore: 90,
                parentId: newHope.id,
                contacts: [
                    { name: '宋涛', title: '厂长', role: ContactRole.MANAGEMENT, phone: '15100151001', email: 'song.t@newhope-qd.cn' },
                    { name: '韩梅', title: '采购主管', role: ContactRole.PROCUREMENT, phone: '15100151002', email: 'han.m@newhope-qd.cn' },
                ],
                bankAccounts: [
                    { bankName: '中国工商银行', accountNumber: '37022018012345678', accountName: '新希望六和饲料（青岛）有限公司', branch: '青岛即墨支行', isDefault: true, isWhitelisted: true },
                ],
            },
            {
                name: '新希望六和饲料（沈阳）有限公司',
                shortName: '新希望沈阳',
                taxId: '91210100000000020U',
                types: [EnterpriseType.SUPPLIER],
                province: '辽宁省',
                city: '沈阳市',
                address: '于洪区于洪乡新希望路',
                description: '新希望六和东北地区生产基地。',
                riskScore: 88,
                parentId: newHope.id,
                contacts: [
                    { name: '冯岩', title: '销售经理', role: ContactRole.EXECUTION, phone: '15200152001', email: 'feng.y@newhope-sy.cn' },
                ],
                bankAccounts: [
                    { bankName: '中国银行', accountNumber: '104021018012345678', accountName: '新希望六和饲料（沈阳）有限公司', branch: '沈阳分行', isDefault: true, isWhitelisted: true },
                ],
            },
        ];

        for (const sub of newHopeSubsidiaries) {
            const { contacts, bankAccounts, ...subData } = sub;
            const existing = await prisma.enterprise.findUnique({ where: { taxId: subData.taxId } });
            if (!existing) {
                const created = await prisma.enterprise.create({
                    data: {
                        ...subData,
                        contacts: contacts ? { create: contacts } : undefined,
                        bankAccounts: bankAccounts ? { create: bankAccounts } : undefined,
                    },
                });
                console.log(`✅ 子公司创建: ${created.name} -> 隶属于 ${newHope.shortName}`);
            }
        }
    }

    console.log('\n🎉 Mock数据导入完成！');
    console.log('\n📈 统计信息:');

    const stats = await prisma.enterprise.groupBy({
        by: ['types'],
        _count: true,
    });

    const total = await prisma.enterprise.count();
    const contactCount = await prisma.contact.count();
    const bankAccountCount = await prisma.bankAccount.count();

    console.log(`   总企业数: ${total}`);
    console.log(`   总联系人: ${contactCount}`);
    console.log(`   总银行账户: ${bankAccountCount}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

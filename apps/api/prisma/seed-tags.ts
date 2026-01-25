/// <reference types="node" />
import { PrismaClient, TagScope } from '@prisma/client';

const prisma = new PrismaClient();

const TAG_GROUPS = [
    {
        name: '客户等级',
        description: '客户重要性评级',
        isExclusive: true,
        tags: [
            { name: 'KA客户', color: '#f5222d', scopes: [TagScope.CUSTOMER] },
            { name: '重点客户', color: '#fa8c16', scopes: [TagScope.CUSTOMER] },
            { name: '普通客户', color: '#1890ff', scopes: [TagScope.CUSTOMER] },
            { name: '潜在客户', color: '#bfbfbf', scopes: [TagScope.CUSTOMER] },
        ]
    },
    {
        name: '信用状态',
        description: '企业信用风险标识',
        isExclusive: true,
        tags: [
            { name: '信用极好', color: '#52c41a', scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },
            { name: '信用良好', color: '#13c2c2', scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },
            { name: '风险关注', color: '#faad14', scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },
            { name: '失信黑名单', color: '#f5222d', scopes: [TagScope.CUSTOMER, TagScope.SUPPLIER] },
        ]
    },
    {
        name: '合作阶段',
        description: '与我司的合作深度',
        isExclusive: true,
        tags: [
            { name: '初次接触', color: '#1890ff', scopes: [TagScope.CUSTOMER] },
            { name: '意向沟通', color: '#722ed1', scopes: [TagScope.CUSTOMER] },
            { name: '试单', color: '#eb2f96', scopes: [TagScope.CUSTOMER] },
            { name: '稳定合作', color: '#52c41a', scopes: [TagScope.CUSTOMER] },
        ]
    },
    {
        name: '产品偏好',
        description: '客户主要采购的产品',
        isExclusive: false,
        tags: [
            { name: '玉米', color: '#faad14', scopes: [TagScope.CUSTOMER, TagScope.MARKET_INFO] },
            { name: '大豆', color: '#d4b106', scopes: [TagScope.CUSTOMER, TagScope.MARKET_INFO] },
            { name: '豆粕', color: '#8c8c8c', scopes: [TagScope.CUSTOMER, TagScope.MARKET_INFO] },
            { name: '小麦', color: '#fadb14', scopes: [TagScope.CUSTOMER, TagScope.MARKET_INFO] },
        ]
    },
];

const GLOBAL_TAGS = [
    { name: '紧急', color: '#f5222d', scopes: [TagScope.GLOBAL] },
    { name: '已核实', color: '#52c41a', scopes: [TagScope.MARKET_INFO] },
    { name: '待核实', color: '#faad14', scopes: [TagScope.MARKET_INFO] },
    { name: '市场传闻', color: '#722ed1', scopes: [TagScope.MARKET_INFO] },
];

async function main() {
    console.log('🌱 开始播种全局标签数据 (Seed Tags)...');

    // 1. 创建标签组和组内标签
    for (const group of TAG_GROUPS) {
        const existingGroup = await prisma.tagGroup.findUnique({
            where: { name: group.name },
        });

        let groupId = existingGroup?.id;

        if (!existingGroup) {
            const createdGroup = await prisma.tagGroup.create({
                data: {
                    name: group.name,
                    description: group.description,
                    isExclusive: group.isExclusive,
                }
            });
            groupId = createdGroup.id;
            console.log(`✅ 创建标签组: ${group.name}`);
        } else {
            console.log(`⏭️  标签组已存在: ${group.name}`);
        }

        if (groupId) {
            for (const tag of group.tags) {
                // Check if tag exists within group
                const existingTag = await prisma.tag.findFirst({
                    where: {
                        name: tag.name,
                        groupId: groupId,
                    }
                });

                if (!existingTag) {
                    await prisma.tag.create({
                        data: {
                            name: tag.name,
                            color: tag.color,
                            scopes: tag.scopes,
                            groupId: groupId,
                        }
                    });
                    console.log(`   - 创建组内标签: ${tag.name}`);
                }
            }
        }
    }

    // 2. 创建独立全局标签
    for (const tag of GLOBAL_TAGS) {
        const existingTag = await prisma.tag.findFirst({
            where: {
                name: tag.name,
                groupId: null,
            }
        });

        if (!existingTag) {
            await prisma.tag.create({
                data: {
                    name: tag.name,
                    color: tag.color,
                    scopes: tag.scopes,
                }
            });
            console.log(`✅ 创建独立标签: ${tag.name}`);
        } else {
            console.log(`⏭️  独立标签已存在: ${tag.name}`);
        }
    }

    console.log('🎉 标签数据播种完成。');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

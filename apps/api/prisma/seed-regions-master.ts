/// <reference types="node" />
import { PrismaClient, RegionLevel } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// 定义接口以避免 implicit any 错误
interface RegionData {
    code: string;
    name: string;
    level: RegionLevel;
    parentCode: string | null;
    isActive: boolean;
    sortOrder: number;
}

const prisma = new PrismaClient();

async function seedRegionsMaster() {
    console.log('🚀 开始全量行政区划数据播种 (Master Seed)...');

    // 使用 process.cwd() 确保路径准确，兼容不同执行环境
    const currentDir = process.cwd();
    // console.log(`📂 当前工作目录: ${currentDir}`);
    // console.log(`📂 脚本所在目录: ${__dirname}`);

    // 多策略寻找数据文件
    const possiblePaths = [
        path.join(__dirname, 'regions-data.json'), // 同级目录 (Dev 或已复制)
        path.join(__dirname, '../../prisma/regions-data.json'), // 从 dist/prisma 回溯到源码 prisma (Prod)
        path.join(currentDir, 'regions-data.json'), // CWD 根目录备用
        path.join(currentDir, 'prisma', 'regions-data.json'), // CWD/prisma 备用
    ];

    let jsonPath = '';
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            jsonPath = p;
            break;
        }
    }

    if (!jsonPath) {
        console.error('❌ 数据文件未找到，已尝试路径:', possiblePaths.join('\n'));
        console.log('💡 请先运行: npx ts-node prisma/export-regions.ts');
        return;
    }

    console.log(`📄 读取数据文件: ${jsonPath}`);
    const rawData = fs.readFileSync(jsonPath, 'utf-8');

    // 显式类型断言
    const regions = JSON.parse(rawData) as RegionData[];

    if (!Array.isArray(regions)) {
        console.error('❌ 数据格式错误: 应为数组');
        return;
    }

    console.log(`📦 加载了 ${regions.length} 条行政区数据，准备导入...`);

    // 查询已存在的数据代码，构建 Set 用于快速比对
    const existing = await prisma.administrativeRegion.findMany({
        select: { code: true }
    });
    const existingSet = new Set(existing.map(r => r.code));

    // 过滤出数据库中不存在的记录
    const toCreate = regions.filter(r => !existingSet.has(r.code));

    if (toCreate.length === 0) {
        console.log('✅ 所有数据已存在，无需导入。');
        return;
    }

    console.log(`⚡️ 检测到 ${toCreate.length} 条新数据，正在批量写入...`);

    // 分批写入，防止 SQL 参数过多报错
    const batchSize = 500;
    for (let i = 0; i < toCreate.length; i += batchSize) {
        const batch = toCreate.slice(i, i + batchSize);

        try {
            await prisma.administrativeRegion.createMany({
                data: batch,
                skipDuplicates: true
            });
            const currentCount = Math.min(i + batchSize, toCreate.length);
            console.log(`   - [${currentCount}/${toCreate.length}] 写入成功`);
        } catch (err) {
            console.error(`❌ 批次写入失败 (Index ${i}):`, err);
        }
    }

    console.log('🎉 全量数据播种完成！');
}

seedRegionsMaster()
    .catch((e) => {
        console.error('❌ 脚本执行出错:', e);
        // process.exit(1); // 避免 Process 类型错误，让 node 自动退出
    })
    .finally(() => prisma.$disconnect());

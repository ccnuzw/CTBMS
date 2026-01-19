/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 开始播种基础系统数据 (Seed)...');

    // 1. 执行 seed.sql (初始化角色和用户)
    const sqlPath = path.join(__dirname, 'seed.sql');
    if (fs.existsSync(sqlPath)) {
        console.log('   - 正在执行 seed.sql ...');
        const sql = fs.readFileSync(sqlPath, 'utf-8');

        // Split by semicolon to handle multiple statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            await prisma.$executeRawUnsafe(statement);
        }
        console.log('   ✅ 基础数据已入库');
    } else {
        console.warn('   ⚠️ 未找到 prisma/seed.sql，跳过基础数据初始化');
    }

    // 2. 可以在这里调用其他 seed 脚本，例如 seed-regions-master
    // 但考虑到 regions 数据量大且可选，建议保持分离，在 README 中单独列出。

    console.log('🎉 基础 Seed 完成。');
}

main()
    .catch((e) => {
        console.error('❌ Seed 失败:', e);
        // process.exit(1);
    })
    .finally(() => prisma.$disconnect());

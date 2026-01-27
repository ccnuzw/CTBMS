import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Helper to run child scripts
function runSeedScript(scriptName: string) {
    console.log(`\n▶️  Running ${scriptName}...`);
    try {
        // Detect if we are running in a JS environment (production build)
        const isJsEnv = __filename.endsWith('.js');

        let command = '';
        if (isJsEnv) {
            // In production, we run the compiled .js files from the same directory
            // Replace .ts with .js
            const jsScriptName = scriptName.replace('.ts', '.js');
            const scriptPath = path.join(__dirname, jsScriptName);
            if (!fs.existsSync(scriptPath)) {
                console.warn(`⚠️  Skipping ${scriptName}: Corresponding .js file not found at ${scriptPath}`);
                return;
            }
            // Execute directly with node
            command = `node ${scriptPath}`;
        } else {
            // In dev, use ts-node
            const scriptPath = path.join(__dirname, scriptName);
            command = `npx ts-node ${scriptPath}`;
        }

        execSync(command, { stdio: 'inherit', cwd: __dirname });
    } catch (e) {
        console.error(`❌ ${scriptName} failed.`);
        console.error(e);
        // Don't throw to allow other scripts to try, unless critical
    }
}



async function main() {
    console.log('🌱 Starting Full Database Seeding...');

    // 1. 执行 seed.sql (初始化角色和用户)
    const sqlPath = path.join(__dirname, 'seed.sql');
    if (fs.existsSync(sqlPath)) {
        console.log('   - 正在执行 seed.sql ...');
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const statement of statements) {
            await prisma.$executeRawUnsafe(statement);
        }
        console.log('   ✅ 基础数据已入库');
    }

    // 2. 播种 Prompt 模板
    runSeedScript('seed-prompts.ts');

    // 3. 执行全量业务数据恢复
    console.log('🚀 开始全量业务数据恢复...');

    // 1. 行政区划数据 (Regions - Master Data)
    runSeedScript('seed-regions-master.ts');

    // 2. 企业客商数据 (Enterprises - Core Master Data)
    runSeedScript('seed-enterprise.ts');

    // 3. 组织架构 (Org Structure - Internal)
    runSeedScript('seed-org-structure.ts');

    // 4. 标签系统 (Tags)
    runSeedScript('seed-tags.ts');

    // 5. 市场分类 (Market Categories)
    if (fs.existsSync(path.join(__dirname, 'seed-market-categories.ts'))) {
        runSeedScript('seed-market-categories.ts');
    }

    // 6. 配置与情报数据 (Configs & Intel) 
    runSeedScript('seed-event-types.ts');
    runSeedScript('seed-intel.ts');

    // 7. 采集点配置 (Collection Points)
    runSeedScript('seed-collection-points.ts');

    // 8. 提取规则 (Extraction Rules)
    runSeedScript('seed-extraction-rules.ts');

    // 9. 逻辑映射规则 (Logic Rules - AI 标准化关键)
    runSeedScript('seed-logic-rules.ts');

    // 10. 历史价格数据 (Historical Price Data - 图表演示)
    // 注意: 依赖于采集点数据优先初始化
    if (fs.existsSync(path.join(__dirname, 'seed-price-history.ts'))) {
        runSeedScript('seed-price-history.ts');
    }

    console.log('\n✅ Full Seeding Completed Successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ==========================================
// Prompt Seed Logic (Inline for simplicity or import)
// ==========================================
const PROMPT_DEFAULTS = [
    {
        code: 'MARKET_INTEL_STRUCTURED_A',
        name: 'A类-结构化价格提取',
        category: 'A_STRUCTURED',
        system: `你是 CTBMS 的专业农产品市场分析师。请分析输入内容并以 JSON 格式返回结构化数据。
{{categoryInstructions}}

## 常见采集点参考
{{knownLocations}}

## 常见品种
{{knownCommodities}}

## 输出 JSON 格式（严格遵循，不要包含 markdown 代码块）
{{jsonSchema}}`,
        user: `请从以下A类价格快讯中提取所有价格点。
===== 原文内容 =====
{{content}}
===== 原文结束 =====`
    },
    {
        code: 'MARKET_INTEL_SEMI_STRUCTURED_B',
        name: 'B类-市场动态分析',
        category: 'B_SEMI_STRUCTURED',
        system: `你是 CTBMS 的专业农产品市场分析师。
{{categoryInstructions}}

## 事件类型参考
{{eventTypeCodes}}

## 输出 JSON 格式
{{jsonSchema}}`,
        user: `请分析以下市场动态，提取事件和心态。
===== 原文内容 =====
{{content}}
===== 原文结束 =====`
    },
    {
        code: 'MARKET_INTEL_DOCUMENT_C',
        name: 'C类-研报文档解析',
        category: 'C_DOCUMENT',
        system: `你是 CTBMS 的专业农产品市场分析师。
重点任务：提取市场洞察和预判。

## 输出 JSON 格式
{{jsonSchema}}`,
        user: `请全面深度解析以下研报内容。
===== 原文内容 =====
{{content}}
===== 原文结束 =====`
    },
    {
        code: 'MARKET_INTEL_ENTITY_D',
        name: 'D类-实体档案提取',
        category: 'D_ENTITY',
        system: `你是 CTBMS 的专业农产品市场分析师。
重点任务：识别企业实体信息和产能动态。

## 输出 JSON 格式
{{jsonSchema}}`,
        user: `请从以下内容中提取企业档案信息。
===== 原文内容 =====
{{content}}
===== 原文结束 =====`
    },
    {
        code: 'MARKET_INTEL_BRIEFING',
        name: '智能简报生成',
        category: 'B_SEMI_STRUCTURED',
        system: `你是一名资深的大宗商品市场分析师。请根据提供的市场情报片段，撰写一份【每日市场动态简报】。
要求：
1. 宏观视角：先概述整体市场情绪（看涨/看跌/持稳）。
2. 核心矛盾：提炼当前市场的主要矛盾点。
3. 分类综述：分别从【价格趋势】、【企业动态】、【物流库存】三个维度进行简述。
4. 字数控制：300-500字。
5. 格式：Markdown，重点加粗。`,
        user: `基于以下情报数据生成简报：\n\n{{content}}`
    }
];

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

    // 2. 播种 Prompt 模板 (Upsert)
    console.log('   - 正在更新 Prompt 模板...');
    // Need to cast category to any or import enum, using any to avoid import issues in script
    for (const t of PROMPT_DEFAULTS) {
        await prisma.promptTemplate.upsert({
            where: { code: t.code },
            update: {
                name: t.name,
                category: t.category as any,
                systemPrompt: t.system,
                userPrompt: t.user,
            },
            create: {
                code: t.code,
                name: t.name,
                category: t.category as any,
                systemPrompt: t.system,
                userPrompt: t.user,
                version: 1,
            }
        });
    }
    console.log(`   ✅ 已同步 ${PROMPT_DEFAULTS.length} 个 Prompt 模板`);
    // 2. 可以在这里调用其他 seed 脚本，例如 seed-regions-master
    // 但考虑到 regions 数据量大且可选，建议保持分离，在 README 中单独列出。

    // 3. 执行全量业务数据恢复 (按照依赖顺序)
    console.log('🚀 开始全量业务数据恢复...');

    const seeds = [
        'seed-regions-master.ts',      // 基础: 行政区划
        'seed-org-structure.ts',       // 基础: 组织架构 (部门/人员)
        'seed-tags.ts',                // 基础: 标签系统
        'seed-market-categories.ts',   // 业务: 信息分类
        'seed-enterprise.ts',          // 业务: 客商数据
        'seed-collection-points.ts',   // 业务: 采集点 (依赖客商/地区)
        'seed-intel.ts',               // 业务: 市场情报 (依赖采集点)
        'seed-extraction-rules.ts',    // 配置: 提取规则
        'seed-logic-rules.ts'          // 配置: 业务映射规则
    ];

    for (const seedFile of seeds) {
        const seedPath = path.join(__dirname, seedFile);
        if (fs.existsSync(seedPath)) {
            console.log(`   - [${seedFile}] 正在执行...`);
            try {
                // 使用 ts-node 执行子脚本
                // 注意: 这里假设运行环境已安装 ts-node，在 dev 环境通常是有的
                const { execSync } = require('child_process');
                execSync(`npx ts-node ${seedPath}`, { stdio: 'inherit', cwd: __dirname });
                console.log(`     ✅ ${seedFile} 完成`);
            } catch (err) {
                console.error(`     ❌ ${seedFile} 执行失败`, err);
                // 根据需要决定是否中断，这里选择继续尝试后续脚本
            }
        } else {
            console.warn(`   ⚠️ 未找到 ${seedFile}，已跳过`);
        }
    }

    console.log('🎉 全量数据恢复完成 (Full System Restore Executed)');
}

main()
    .catch((e) => {
        console.error('❌ Seed 失败:', e);
        // process.exit(1);
    })
    .finally(() => prisma.$disconnect());

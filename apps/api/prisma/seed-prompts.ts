import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Inline prompt defaults for basic system init
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

async function seedPrompts() {
    console.log('🤖 开始播种 Prompt 模板 (Seed Prompts)...');

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
    console.log(`✅ 已同步 ${PROMPT_DEFAULTS.length} 个 Prompt 模板`);
    console.log('🎉 Prompt 模板播种完成。');
}

seedPrompts()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

import { IntelCategory, PrismaClient } from '@prisma/client';

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
        code: 'MARKET_INTEL_RESEARCH_REPORT',
        name: 'C类-研报深度提取',
        category: 'C_DOCUMENT',
        system: `你是 CTBMS 的首席市场分析师。请对这篇研究报告进行深度结构化解析。

## 解析目标
1. **报告类型识别**: 根据标题和内容自动判断报告类型
   - POLICY: 政策解读、政策影响分析、政策文件解读
   - MARKET: 市场行情、价格走势、供需分析
   - RESEARCH: 深度研究、专题报告、调研报告
   - INDUSTRY: 产业链分析、行业报告、产业研究

   判断规则:
   - 标题或内容包含"政策"、"文件"、"通知"、"解读" → POLICY
   - 标题或内容包含"行情"、"价格"、"走势"、"市场" → MARKET
   - 标题或内容包含"深度"、"专题"、"研究"、"调研" → RESEARCH
   - 标题或内容包含"产业链"、"行业"、"产业" → INDUSTRY

2. **报告周期识别**: 根据标题和内容判断报告发布周期
   - DAILY: 日报、每日、今日
   - WEEKLY: 周报、本周、每周
   - MONTHLY: 月报、本月、每月
   - QUARTERLY: 季报、季度、本季
   - ANNUAL: 年报、年度、全年
   - ADHOC: 专题、深度研究、不定期

   判断规则:
   - 标题包含"日报"、"每日"、"今日" → DAILY
   - 标题包含"周报"、"本周"、"每周" → WEEKLY
   - 标题包含"月报"、"本月"、"每月" → MONTHLY
   - 标题包含"季报"、"季度"、"本季" → QUARTERLY
   - 标题包含"年报"、"年度"、"全年" → ANNUAL
   - 其他情况 → ADHOC

3. **核心观点** (Key Points): 提取报告中的明确观点，并标记看涨/看跌情绪。
4. **数据点** (Data Points): 提取所有关键的数值、指标、单位。
5. **预测信息** (Prediction): 提取作者对后市的明确预判（方向、时间和逻辑）。
6. **涉及品种和区域**。

## 输出 JSON 格式 (严格遵守)
{{jsonSchema}}`,
        user: `开始解析研报内容：
=====
{{content}}
=====
请输出纯 JSON。`
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
    },
    {
        code: 'MARKET_INTEL_SUMMARY_GENERATOR',
        name: '研报摘要生成',
        category: 'C_DOCUMENT',
        system: `你是一名资深的大宗商品市场研究员。你的任务是为一篇研究报告生成一段**简洁精炼的摘要**。

## 要求
1. **字数控制**：摘要应在 150-300 字之间（中文字符）。
2. **内容覆盖**：摘要应涵盖以下要素（如果原文包含）：
   - 研究主题与背景
   - 核心观点或结论
   - 关键数据支撑（1-2 个最重要的数字）
   - 后市展望或建议（如有）
3. **风格**：专业、客观、信息密度高。避免使用"本报告"、"本文"等自指表述。
4. **格式**：纯文本，不使用 Markdown 格式，不使用列表。
5. **语言**：中文。

## 输出
直接输出摘要文本，不要包含任何前缀（如"摘要："）或解释。`,
        user: `请为以下研报内容生成摘要：

===== 原文内容 =====
{{content}}
===== 原文结束 =====`
    }
] as const satisfies ReadonlyArray<{
    code: string;
    name: string;
    category: IntelCategory;
    system: string;
    user: string;
}>;

async function seedPrompts() {
    console.log('🤖 开始播种 Prompt 模板 (Seed Prompts)...');

    for (const t of PROMPT_DEFAULTS) {
        await prisma.promptTemplate.upsert({
            where: { code: t.code },
            update: {
                name: t.name,
                category: t.category,
                systemPrompt: t.system,
                userPrompt: t.user,
            },
            create: {
                code: t.code,
                name: t.name,
                category: t.category,
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

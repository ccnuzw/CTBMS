import { ExportFormat, ExportReportSection } from '@packages/types';

/**
 * 报告模板定义
 *
 * 每个模板预设了报告名称、格式、包含章节、AI 生成提示词等。
 * 用户可以"一键使用模板"来生成标准化报告。
 */
export interface ReportTemplate {
    /** 模板唯一标识 */
    templateId: string;
    /** 模板中文名 */
    name: string;
    /** 模板描述 */
    description: string;
    /** 所属分类 */
    category: 'DAILY' | 'WEEKLY' | 'RESEARCH' | 'RISK' | 'STRATEGY' | 'CUSTOM';
    /** 默认导出格式 */
    defaultFormat: ExportFormat;
    /** 包含的报告章节 */
    sections: ExportReportSection[];
    /** 报告标题模板（支持 {date} {commodity} 占位符） */
    titleTemplate: string;
    /** 图标 (Ant Design icon name) */
    icon: string;
    /** 颜色标记 */
    color: string;
    /** 预计页数 */
    estimatedPages: number;
    /** AI 总结提示词（让 Agent 更好地生成该类型报告内容） */
    aiPromptHint?: string;
    /** 适用品种（留空表示通用） */
    applicableCommodities?: string[];
}

// ── 内置报告模板 ──────────────────────────────────────────

export const REPORT_TEMPLATES: ReportTemplate[] = [
    // ═══ 日常报告 ═══
    {
        templateId: 'daily-market-overview',
        name: '品种日报',
        description: '记录当日市场行情变动、关键价格点位和短期趋势判断，适合每日收盘后生成。',
        category: 'DAILY',
        defaultFormat: 'PDF',
        sections: ['CONCLUSION', 'EVIDENCE'],
        titleTemplate: '{commodity}市场日报 - {date}',
        icon: 'FileTextOutlined',
        color: '#1890ff',
        estimatedPages: 2,
        aiPromptHint: '请重点关注今日价格涨跌幅、成交量变化、与昨日对比，给出明日走势预判。',
    },
    {
        templateId: 'daily-risk-alert',
        name: '每日风控简报',
        description: '汇总当日触发的风控规则、异常价格波动和预警信号。',
        category: 'DAILY',
        defaultFormat: 'PDF',
        sections: ['CONCLUSION', 'RISK_ASSESSMENT'],
        titleTemplate: '风控日报 - {date}',
        icon: 'AlertOutlined',
        color: '#ff4d4f',
        estimatedPages: 2,
        aiPromptHint: '请列出所有触发的风控规则，按风险等级排序，给出应对建议。',
    },

    // ═══ 周报 ═══
    {
        templateId: 'weekly-market-review',
        name: '周度市场回顾',
        description: '总结本周市场整体走势、关键事件影响、多空因素分析和下周展望。',
        category: 'WEEKLY',
        defaultFormat: 'WORD',
        sections: ['CONCLUSION', 'EVIDENCE', 'RISK_ASSESSMENT'],
        titleTemplate: '{commodity}市场周报（第{weekNumber}周）',
        icon: 'CalendarOutlined',
        color: '#722ed1',
        estimatedPages: 5,
        aiPromptHint: '请从供需两端分析本周走势，结合政策面和资金面给出周度总结，并展望下周。',
    },
    {
        templateId: 'weekly-strategy',
        name: '周度策略报告',
        description: '基于本周分析结果，给出下周具体的操作建议、仓位调整和风险提示。',
        category: 'WEEKLY',
        defaultFormat: 'WORD',
        sections: ['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT'],
        titleTemplate: '{commodity}策略周报 - {date}',
        icon: 'AimOutlined',
        color: '#13c2c2',
        estimatedPages: 6,
        aiPromptHint: '请给出具体可操作的策略建议，包括方向、点位区间、止盈止损位和仓位比例建议。',
    },

    // ═══ 研究报告 ═══
    {
        templateId: 'research-deep-dive',
        name: '深度研究报告',
        description: '对单一品种进行全面深度分析，涵盖基本面、技术面、资金面和政策面。',
        category: 'RESEARCH',
        defaultFormat: 'WORD',
        sections: ['CONCLUSION', 'EVIDENCE', 'DEBATE_PROCESS', 'RISK_ASSESSMENT'],
        titleTemplate: '{commodity}深度研究报告 - {date}',
        icon: 'ExperimentOutlined',
        color: '#2f54eb',
        estimatedPages: 10,
        aiPromptHint: '请从基本面（供需平衡表、库存、产量）、技术面（趋势、支撑阻力）、资金面（持仓变化）和政策面多维度分析。',
    },
    {
        templateId: 'research-cross-variety',
        name: '品种对比研报',
        description: '对比多个相关品种的走势、价差关系和套利机会。',
        category: 'RESEARCH',
        defaultFormat: 'WORD',
        sections: ['CONCLUSION', 'EVIDENCE', 'RISK_ASSESSMENT'],
        titleTemplate: '品种对比分析 - {date}',
        icon: 'SwapOutlined',
        color: '#eb2f96',
        estimatedPages: 8,
        aiPromptHint: '请重点分析品种间的价差走势、相关性变化和可能的套利策略。',
    },

    // ═══ 风控报告 ═══
    {
        templateId: 'risk-comprehensive',
        name: '综合风险评估报告',
        description: '全面评估当前持仓风险、市场风险和操作风险，给出风控建议。',
        category: 'RISK',
        defaultFormat: 'PDF',
        sections: ['CONCLUSION', 'RISK_ASSESSMENT'],
        titleTemplate: '综合风险评估 - {date}',
        icon: 'SafetyCertificateOutlined',
        color: '#fa8c16',
        estimatedPages: 4,
        aiPromptHint: '请按市场风险、信用风险、操作风险分类评估，给出风险矩阵和应对措施。',
    },

    // ═══ 策略报告 ═══
    {
        templateId: 'strategy-debate-summary',
        name: '多方研判报告',
        description: '记录多维度讨论的完整过程和最终裁判结论，适合需要留痕的重要决策。',
        category: 'STRATEGY',
        defaultFormat: 'WORD',
        sections: ['CONCLUSION', 'DEBATE_PROCESS', 'EVIDENCE', 'RISK_ASSESSMENT'],
        titleTemplate: '{commodity}多方研判报告 - {date}',
        icon: 'TeamOutlined',
        color: '#52c41a',
        estimatedPages: 8,
        aiPromptHint: '请完整记录各方观点、交锋过程和最终裁判依据，体现决策的科学性和严谨性。',
    },
];

// ── 辅助函数 ──────────────────────────────────────────────

/** 按分类获取模板 */
export const getTemplatesByCategory = () => {
    const categoryNames: Record<string, string> = {
        DAILY: '日常报告',
        WEEKLY: '周度报告',
        RESEARCH: '研究报告',
        RISK: '风险报告',
        STRATEGY: '策略报告',
        CUSTOM: '自定义',
    };

    const result: Array<{ category: string; categoryName: string; templates: ReportTemplate[] }> = [];
    const groups = new Map<string, ReportTemplate[]>();

    REPORT_TEMPLATES.forEach((t) => {
        if (!groups.has(t.category)) groups.set(t.category, []);
        groups.get(t.category)!.push(t);
    });

    groups.forEach((templates, category) => {
        result.push({
            category,
            categoryName: categoryNames[category] ?? category,
            templates,
        });
    });

    return result;
};

/** 根据 ID 查找模板 */
export const findReportTemplate = (templateId: string): ReportTemplate | undefined =>
    REPORT_TEMPLATES.find((t) => t.templateId === templateId);

/** 渲染标题模板 */
export const renderTitleTemplate = (
    template: string,
    vars: { commodity?: string; date?: string; weekNumber?: string | number },
): string => {
    let title = template;
    title = title.replace('{commodity}', vars.commodity ?? '');
    title = title.replace('{date}', vars.date ?? new Date().toLocaleDateString('zh-CN'));
    title = title.replace('{weekNumber}', String(vars.weekNumber ?? ''));
    return title.trim();
};

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntelCategory, PromptTemplate } from '@prisma/client';

@Injectable()
export class PromptService implements OnModuleInit {
    private readonly logger = new Logger(PromptService.name);
    private templateCache: Map<string, PromptTemplate> = new Map();

    constructor(private readonly prisma: PrismaService) { }

    async onModuleInit() {
        await this.loadTemplates();
        await this.seedDefaultTemplates();
    }

    /**
     * 加载所有激活的模板到缓存
     */
    async loadTemplates() {
        const templates = await this.prisma.promptTemplate.findMany({
            where: { isActive: true },
        });
        this.templateCache.clear();
        for (const t of templates) {
            this.templateCache.set(t.code, t);
        }
        this.logger.log(`已加载 ${templates.length} 个 Prompt 模板`);
    }

    /**
     * 获取并渲染模板
     */
    async getRenderedPrompt(code: string, variables: Record<string, any> = {}): Promise<{ system: string; user: string } | null> {
        let template: PromptTemplate | null | undefined = this.templateCache.get(code);

        // 如果缓存没找到，尝试从库里查（防止新增后未刷新）
        if (!template) {
            template = await this.prisma.promptTemplate.findUnique({
                where: { code },
            });
            if (template && template.isActive) {
                this.templateCache.set(template.code, template);
            }
        }

        if (!template) {
            this.logger.warn(`Prompt template not found: ${code}`);
            return null;
        }

        const system = this.renderString(template.systemPrompt, variables);
        const user = this.renderString(template.userPrompt, variables);

        return { system, user };
    }

    private renderString(template: string, variables: Record<string, any>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
        });
    }

    /**
     * 获取所有模板 (Admin API)
     */
    async findAll() {
        return this.prisma.promptTemplate.findMany({
            orderBy: { code: 'asc' },
        });
    }

    /**
     * 创建模板
     */
    async create(data: any) {
        const result = await this.prisma.promptTemplate.create({
            data: {
                ...data,
                version: 1,
            }
        });
        await this.loadTemplates(); // Refresh cache
        return result;
    }

    /**
     * 更新模板
     */
    async update(id: string, data: any) {
        const result = await this.prisma.promptTemplate.update({
            where: { id },
            data: {
                ...data,
                version: { increment: 1 }, // Auto increment version
            }
        });
        await this.loadTemplates(); // Refresh cache
        return result;
    }

    /**
     * 删除模板
     */
    async delete(id: string) {
        const result = await this.prisma.promptTemplate.delete({
            where: { id },
        });
        await this.loadTemplates(); // Refresh cache
        return result;
    }

    /**
     * 预览渲染结果
     */
    async preview(code: string, variables: Record<string, any>) {
        // First try to find in DB (in case it's a new draft not in cache yet, though we cache on create)
        // Actually for preview we might want to preview *unsaved* changes? 
        // For now let's preview based on code (saved template)
        return this.getRenderedPrompt(code, variables);
    }

    /**
     * 种子数据：如果数据库为空，初始化默认模板
     */
    private async seedDefaultTemplates() {
        const count = await this.prisma.promptTemplate.count();
        if (count > 0) return;

        this.logger.log('初始化默认 Prompt 模板...');

        const defaults = [
            {
                code: 'MARKET_INTEL_STRUCTURED_A',
                name: 'A类-结构化价格提取',
                category: 'A_STRUCTURED' as IntelCategory,
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
                category: 'B_SEMI_STRUCTURED' as IntelCategory,
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
                category: 'C_DOCUMENT' as IntelCategory,
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
                category: 'B_SEMI_STRUCTURED' as IntelCategory, // 复用B类或任意
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

        for (const t of defaults) {
            await this.prisma.promptTemplate.create({
                data: {
                    code: t.code,
                    name: t.name,
                    category: t.category,
                    systemPrompt: t.system,
                    userPrompt: t.user,
                    version: 1,
                }
            });
        }
        this.logger.log('默认 Prompt 模板初始化完成');
    }
}

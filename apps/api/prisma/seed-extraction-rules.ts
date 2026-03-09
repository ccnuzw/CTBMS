/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function seedExtractionRules() {
    console.log('🌱 开始优化播种提取规则 (Optimized Rules Seed)...');

    // Helper to read JSON
    // Helper to read JSON with robust path resolution
    const readJson = (filename: string) => {
        const currentDir = process.cwd();
        const possiblePaths = [
            path.join(__dirname, filename), // Same dir (Dev or copied)
            path.join(__dirname, '../../prisma', filename), // Back to source prisma from dist (Prod)
            path.join(currentDir, filename), // CWD root
            path.join(currentDir, 'prisma', filename), // CWD/prisma
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return JSON.parse(fs.readFileSync(p, 'utf-8'));
            }
        }

        console.warn(`⚠️ Warning: Could not find ${filename} in any search path.`);
        return [];
    };

    const rules = readJson('rules-list.json');

    console.log(`📦 加载规则数据: ${rules.length} 条`);

    for (const rule of rules) {
        // 1. 查找对应的 Type ID
        let eventTypeId = null;
        let insightTypeId = null;

        if (rule.targetType === 'EVENT' && rule.eventTypeCode) {
            const et = await prisma.eventTypeConfig.findUnique({
                where: { code: rule.eventTypeCode },
            });
            if (!et) {
                console.warn(`⚠️ 未找到事件类型 ${rule.eventTypeCode}，跳过规则 ${rule.name}`);
                continue;
            }
            eventTypeId = et.id;
        }

        if (rule.targetType === 'INSIGHT' && rule.insightTypeCode) {
            const it = await prisma.insightTypeConfig.findUnique({
                where: { code: rule.insightTypeCode },
            });
            if (!it) {
                console.warn(`⚠️ 未找到洞察类型 ${rule.insightTypeCode}，跳过规则 ${rule.name}`);
                continue;
            }
            insightTypeId = it.id;
        }

        // 2. 更新或创建规则 (使用 Upsert 逻辑)
        // 注意：Prisma 没有直接根据 Name 更新的 Upsert，我们先查再更
        // Snapshot usually has IDs. If so, use ID.
        let existing = null;
        if (rule.id) {
            existing = await prisma.extractionRule.findUnique({ where: { id: rule.id } });
        }
        // Fallback to name match if ID not found or not provided
        if (!existing) {
            existing = await prisma.extractionRule.findFirst({ where: { name: rule.name } });
        }

        const data = {
            name: rule.name,
            targetType: rule.targetType,
            priority: rule.priority,
            conditions: rule.conditions,
            outputConfig: rule.outputConfig,
            commodities: rule.commodities,
            eventTypeId,
            insightTypeId,
            description: rule.description, // [FIX] Ensure description is updated
            isActive: rule.isActive ?? true
        };

        if (existing) {
            await prisma.extractionRule.update({
                where: { id: existing.id },
                data: data
            });
            console.log(`🔄 更新规则: ${rule.name}`);
        } else {
            await prisma.extractionRule.create({
                data: rule.id ? { id: rule.id, ...data } : data
            });
            console.log(`✅ 创建规则: ${rule.name}`);
        }
    }

    console.log('🎉 提取规则优化完成。');
}

seedExtractionRules()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

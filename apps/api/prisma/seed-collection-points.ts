/// <reference types="node" />
import { PrismaClient, CollectionPointType, RegionLevel } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function seedCollectionPoints() {
    console.log('🚉 开始全量采集点数据播种 (CP Seed)...');

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

    const collectionPoints = readJson('cp-list.json');

    console.log(`📦 加载采集点数据: ${collectionPoints.length} 条`);

    for (const item of collectionPoints) {
        try {
            // Fix for Schema Compatibility (same logic as used in previous seed-snapshot fix)
            const data: any = { ...item };

            // 1. Add missing fields
            if (!data.matchRegionCodes) {
                data.matchRegionCodes = [];
                // Try to use regionCode as default match
                if (data.regionCode && typeof data.regionCode === 'string') {
                    data.matchRegionCodes.push(data.regionCode);
                }
            }

            if (data.isMarketEntity === undefined) {
                data.isMarketEntity = false;
            }

            // 2. Handle FKs
            // enterpriseId: The snapshot might have old UUIDs.
            // If we want to relink to new enterprises, we'd need a map.
            // For now, let's nullify enterpriseId to avoid errors, or only keep it if we are sure.
            // Given we just recreated enterprises with NEW UUIDs, the old IDs are definitely invalid.
            data.enterpriseId = null;

            // 3. Remove relation fields that might conflict with 'create' / 'update' shorthand
            // (e.g. if the JSON object includes 'enterprise' object attached)
            delete data.enterprise;
            delete data.region;
            delete data.entityTags; // We will handle tags separately or need proper connect syntax

            await prisma.collectionPoint.upsert({
                where: { id: item.id },
                update: data,
                create: data,
            });
        } catch (e) {
            console.warn('Failed to seed CollectionPoint ' + item.name, e);
        }
    }

    console.log('🎉 采集点数据恢复完成。');
}

seedCollectionPoints()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

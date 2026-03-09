/// <reference types="node" />
import { CollectionPointType, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

type CollectionPointSeed = {
    id: string;
    code: string;
    name: string;
    shortName?: string | null;
    aliases?: string[];
    type: CollectionPointType;
    matchRegionCodes?: string[];
    regionCode?: string | null;
    address?: string | null;
    longitude?: number | null;
    latitude?: number | null;
    commodities?: string[];
    priceSubTypes?: string[];
    defaultSubType?: string | null;
    isDataSource?: boolean;
    enterpriseId?: string | null;
    priority?: number;
    isActive?: boolean;
    description?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    createdById?: string | null;
    commodityConfigs?: Array<{
        name: string;
        allowedSubTypes: string[];
        defaultSubType?: string | null;
    }>;
    isMarketEntity?: boolean;
    enterprise?: unknown;
    region?: unknown;
    entityTags?: unknown;
};

const prisma = new PrismaClient();

async function seedCollectionPoints() {
    console.log('🚉 开始全量采集点数据播种 (CP Seed)...');

    // Helper to read JSON
    // Helper to read JSON with robust path resolution
    const readJson = (filename: string): CollectionPointSeed[] => {
        const currentDir = process.cwd();
        const possiblePaths = [
            path.join(__dirname, filename), // Same dir (Dev or copied)
            path.join(__dirname, '../../prisma', filename), // Back to source prisma from dist (Prod)
            path.join(currentDir, filename), // CWD root
            path.join(currentDir, 'prisma', filename), // CWD/prisma
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return JSON.parse(fs.readFileSync(p, 'utf-8')) as CollectionPointSeed[];
            }
        }

        console.warn(`⚠️ Warning: Could not find ${filename} in any search path.`);
        return [];
    };

    const collectionPoints = readJson('cp-list.json');

    console.log(`📦 加载采集点数据: ${collectionPoints.length} 条`);

    for (const item of collectionPoints) {
        try {
            const matchRegionCodes = item.matchRegionCodes?.length
                ? item.matchRegionCodes
                : item.regionCode
                  ? [item.regionCode]
                  : [];

            const priceSubTypes = item.priceSubTypes?.length
                ? item.priceSubTypes
                : item.type === 'PORT'
                  ? ['ARRIVAL', 'FOB']
                  : item.type === 'ENTERPRISE'
                    ? ['PURCHASE', 'LISTED']
                    : ['LISTED'];

            const commodities = item.commodities?.length ? item.commodities : ['玉米', '大豆'];

            const commodityConfigs = item.commodityConfigs?.length
                ? item.commodityConfigs
                : commodities.map((commodity) => ({
                      name: commodity,
                      allowedSubTypes: priceSubTypes,
                      defaultSubType: item.defaultSubType ?? priceSubTypes[0],
                  }));

            const data = {
                ...item,
                matchRegionCodes,
                enterpriseId: null,
                commodities,
                priceSubTypes,
                commodityConfigs,
                isMarketEntity: item.isMarketEntity ?? false,
                enterprise: undefined,
                region: undefined,
                entityTags: undefined,
            };

            delete data.enterprise;
            delete data.region;
            delete data.entityTags;

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

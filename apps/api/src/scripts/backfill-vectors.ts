
import { NestFactory } from '@nestjs/core';
import { KnowledgeModule } from '../modules/knowledge/knowledge.module';
import { RagPipelineService } from '../modules/knowledge/rag/rag-pipeline.service';
import { PrismaService } from '../prisma/prisma.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
    const logger = new Logger('BackfillScript');
    const app = await NestFactory.createApplicationContext(KnowledgeModule);
    const prisma = app.get(PrismaService);
    const ragService = app.get(RagPipelineService);

    const configs = await prisma.aIModelConfig.findMany();
    logger.log(`Found ${configs.length} AI Configs. checking for backfill compatibility...`);

    // Deactivate FAST and STRONG if they have no BaseURL (assuming they are blocked) and DEFAULT exists
    const defaultConfig = configs.find(c => c.configKey === 'DEFAULT');
    if (defaultConfig && defaultConfig.apiUrl) {
        logger.log('Disabling FAST and STRONG to favor DEFAULT (sub2api)...');
        await prisma.aIModelConfig.updateMany({
            where: { configKey: { in: ['FAST', 'STRONG'] } },
            data: { isActive: false }
        });
        await prisma.aIModelConfig.update({
            where: { configKey: 'DEFAULT' },
            data: { isActive: true }
        });
        logger.log('Configs updated.');
    } else {
        logger.warn('DEFAULT config not found or has no API URL, proceeding with current state...');
    }

    logger.log('Starting vector backfill...');

    // Find items without vectors
    // Since we don't have a direct "no vectors" relation filter easily accessible without knowing the schema details perfectly (and avoiding heavy queries),
    // we'll iterate recent items and check.
    // Or better: valid active items.

    const items = await prisma.knowledgeItem.findMany({
        where: {
            // You might want to filter by specific types or logic, but for now let's check all relevant ones
            status: { in: ['PUBLISHED', 'APPROVED', 'DRAFT', 'PENDING_REVIEW'] },
            // We can check if they have vectors:
            vectors: {
                none: {}
            }
        },
        take: 100,
        orderBy: { createdAt: 'desc' }
    });

    logger.log(`Found ${items.length} items to backfill.`);

    for (const item of items) {
        logger.log(`Processing item: ${item.title} (${item.id})`);
        try {
            const content = item.contentPlain || item.contentRich || '';
            if (content.trim().length > 0) {
                await ragService.ingest(item.id, content, {
                    sourceType: item.sourceType,
                    type: item.type
                });
                logger.log(`Successfully vectorized ${item.id}`);
            } else {
                logger.warn(`Item ${item.id} has no content, skipping.`);
            }
        } catch (error) {
            logger.error(`Failed to ingest ${item.id}`, error);
        }
    }

    logger.log('Backfill complete.');
    await app.close();
}

bootstrap();

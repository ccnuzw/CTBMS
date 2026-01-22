
import { NestFactory } from '@nestjs/core';
import { AppModule } from './apps/api/src/app.module';
import { PriceDataService } from './apps/api/src/modules/market-intel/price-data.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const service = app.get(PriceDataService);

    try {
        // 1. Mock some IDs (we need real IDs to test properly, or we test empty)
        // First, let's list some CollectionPoints to get valid IDs
        const prisma = app.get('PrismaService');
        const points = await prisma.collectionPoint.findMany({ take: 3 });

        if (points.length === 0) {
            console.log('No collection points found. Cannot test compare.');
            await app.close();
            return;
        }

        const ids = points.map(p => p.id);
        console.log('Testing with IDs:', ids);

        // 2. Call getMultiPointTrend
        console.log('Calling getMultiPointTrend...');
        const result = await service.getMultiPointTrend(ids, '玉米', 30);
        console.log('Result:', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Error during test:', error);
    }

    await app.close();
}

bootstrap();

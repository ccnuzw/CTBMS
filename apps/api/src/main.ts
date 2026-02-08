import { NestFactory } from '@nestjs/core';
// Force restart: 1
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { ZodValidationPipe } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Enable Global Zod Validation Pipe
    app.useGlobalPipes(new ZodValidationPipe());

    // Enable CORS
    app.enableCors();

    // Serve static files from uploads directory
    app.useStaticAssets(join(__dirname, '..', 'uploads'), {
        prefix: '/uploads/',
    });

    // Register Global Exception Filter
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.listen(3000);
    console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();

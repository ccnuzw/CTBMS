import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ZodValidationPipe, patchNestJsSwagger } from 'nestjs-zod';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // Enable Global Zod Validation Pipe
    app.useGlobalPipes(new ZodValidationPipe());

    // Enable CORS
    app.enableCors();

    await app.listen(3000);
    console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();

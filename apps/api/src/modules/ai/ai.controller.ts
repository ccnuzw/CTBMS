import { Controller, Get } from '@nestjs/common';
import { AIService } from './ai.service';

@Controller('ai')
export class AIController {
    constructor(private readonly aiService: AIService) { }

    @Get('test-connection')
    async testConnection() {
        return this.aiService.testConnection();
    }
}

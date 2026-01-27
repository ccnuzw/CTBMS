import { Controller, Get, Post, Sse, MessageEvent } from '@nestjs/common';
import { InitService } from './init.service';
import { Observable } from 'rxjs';

@Controller('init')
export class InitController {
    constructor(private readonly initService: InitService) { }

    /**
     * 检查系统初始化状态
     * GET /init/status
     */
    @Get('status')
    async getStatus() {
        const initialized = await this.initService.isInitialized();
        return {
            initialized,
            message: initialized ? '系统已初始化' : '系统未初始化，请访问 /init 进行初始化',
        };
    }

    /**
     * 执行系统初始化
     * POST /init
     * 或 GET /init（方便浏览器直接访问）
     */
    @Get()
    @Post()
    async initialize() {
        return this.initService.initialize();
    }

    /**
     * Stream seeding process logs via SSE
     * GET /init/seed
     */
    @Post('clear')
    async clearData() {
        return this.initService.clearData();
    }

    @Sse('seed')
    streamSeed(): Observable<MessageEvent> {
        return this.initService.streamSeed();
    }
}

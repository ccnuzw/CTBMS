import { Controller, Get, Post } from '@nestjs/common';
import { InitService } from './init.service';

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
}

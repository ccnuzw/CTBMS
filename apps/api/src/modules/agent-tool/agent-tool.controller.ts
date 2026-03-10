import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ToolAdapterService } from './tool-adapter.service';
import { AgentChatService } from './agent-chat.service';
import { AgentToolCallRequest } from '@packages/types';

@Controller('agent-tools')
export class AgentToolController {
    constructor(
        private readonly toolAdapterService: ToolAdapterService,
        private readonly agentChatService: AgentChatService,
    ) { }

    // ── 工具管理端点 ──────────────────────────────────────────

    /** 获取可用工具列表（UI 展示用） */
    @Get()
    getAvailableTools() {
        return this.toolAdapterService.getAvailableTools();
    }

    /** 获取 OpenAI function calling 格式（LLM 对接用） */
    @Get('openai-functions')
    getOpenAIFunctions() {
        return this.toolAdapterService.getOpenAIFunctions();
    }

    /** 执行工具调用 */
    @Post('execute')
    async executeTool(@Body() request: AgentToolCallRequest) {
        return this.toolAdapterService.executeTool(request);
    }

    // ── 对话助手端点 ──────────────────────────────────────────

    /** 创建新的对话会话 */
    @Post('chat/sessions')
    createChatSession(@Body() body: { userId: string }) {
        return this.agentChatService.createSession(body.userId);
    }

    /** 发送消息（核心对话端点） */
    @Post('chat/sessions/:sessionId/messages')
    async sendMessage(
        @Param('sessionId') sessionId: string,
        @Body() body: { message: string },
    ) {
        return this.agentChatService.chat(sessionId, body.message);
    }

    /** 获取会话历史 */
    @Get('chat/sessions/:sessionId/history')
    getChatHistory(@Param('sessionId') sessionId: string) {
        return this.agentChatService.getSessionHistory(sessionId);
    }

    /** 列出用户的所有会话 */
    @Get('chat/sessions')
    listChatSessions(@Query('userId') userId: string) {
        return this.agentChatService.listSessions(userId);
    }
}

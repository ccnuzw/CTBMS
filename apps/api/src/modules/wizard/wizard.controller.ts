
import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import { WizardService } from './wizard.service';
import { AgentFactoryService } from './agent-factory.service';

@Controller('wizard')
export class WizardController {
    constructor(
        private readonly wizardService: WizardService,
        private readonly agentFactoryService: AgentFactoryService
    ) { }

    @Post('session')
    createSession(@Body() body: { userId: string; personaCode: string }) {
        return this.wizardService.createSession(body.userId, body.personaCode);
    }

    @Get('session/:id')
    getSession(@Param('id') id: string) {
        return this.wizardService.getSession(id);
    }

    @Patch('session/:id')
    updateSession(
        @Param('id') id: string,
        @Body() body: { step: string; data: unknown },
    ) {
        return this.wizardService.updateSession(id, body.step, body.data);
    }

    @Post('session/:id/finalize')
    finalizeSession(@Param('id') id: string) {
        return this.agentFactoryService.createAgentFromSession(id);
    }
}

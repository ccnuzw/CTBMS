
import { Module } from '@nestjs/common';
import { WizardController } from './wizard.controller';
import { WizardService } from './wizard.service';
import { AgentFactoryService } from './agent-factory.service';
import { AgentChatController } from './agent-chat.controller';
import { AgentPersonaModule } from '../agent-persona/agent-persona.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AIModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
    imports: [AgentPersonaModule, PrismaModule, AIModule, KnowledgeModule],
    controllers: [WizardController, AgentChatController],
    providers: [WizardService, AgentFactoryService],
})
export class WizardModule { }

import { Global, Module, OnModuleInit } from '@nestjs/common';
import { AgentSkillService } from './agent-skill.service';
import { AgentSkillController } from './agent-skill.controller';
import { ToolHandlerRegistryService } from './tool-handler-registry.service';
import { CalculateSumMockHandler } from './handlers/calculate-sum.handler';
import { KnowledgeQueryToolHandler } from './handlers/knowledge-query.handler';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Global()
@Module({
    imports: [KnowledgeModule],
    controllers: [AgentSkillController],
    providers: [
        AgentSkillService,
        ToolHandlerRegistryService,
        CalculateSumMockHandler,
        KnowledgeQueryToolHandler
    ],
    exports: [
        AgentSkillService,
        ToolHandlerRegistryService,
    ],
})
export class AgentSkillModule implements OnModuleInit {
    constructor(
        private registry: ToolHandlerRegistryService,
        private calcSumMock: CalculateSumMockHandler,
        private knowledgeQuery: KnowledgeQueryToolHandler,
    ) { }

    onModuleInit() {
        this.registry.registerHandler(this.calcSumMock);
        this.registry.registerHandler(this.knowledgeQuery);
    }
}

import { Global, Module, OnModuleInit } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';

// ── Re-import from individual modules ──
import { AgentPersonaController } from '../agent-persona/agent-persona.controller';
import { AgentPersonaService } from '../agent-persona/agent-persona.service';

import { AgentProfileController } from '../agent-profile/agent-profile.controller';
import { AgentProfileService } from '../agent-profile/agent-profile.service';
import { OutputSchemaRegistryService } from '../agent-profile/output-schema-registry.service';

import { AgentPromptTemplateController } from '../agent-prompt-template/agent-prompt-template.controller';
import { AgentPromptTemplateService } from '../agent-prompt-template/agent-prompt-template.service';

import { AgentSkillController } from '../agent-skill/agent-skill.controller';
import { AgentSkillService } from '../agent-skill/agent-skill.service';
import { ToolHandlerRegistryService } from '../agent-skill/tool-handler-registry.service';
import { CalculateSumMockHandler } from '../agent-skill/handlers/calculate-sum.handler';
import { KnowledgeQueryToolHandler } from '../agent-skill/handlers/knowledge-query.handler';
import { AgentSkillGovernanceJob } from '../agent-skill/agent-skill-governance.job';

/**
 * AgentConfigModule — 统一 Agent 配置中心
 *
 * 合并原有 4 个独立模块：
 *   - AgentPersonaModule   → 角色人设管理
 *   - AgentProfileModule   → Agent 配置档案
 *   - AgentPromptTemplateModule → 提示词模板
 *   - AgentSkillModule     → 技能/工具注册
 *
 * 所有 API 路径保持不变，仅改变内部组织。
 */
@Global()
@Module({
    imports: [KnowledgeModule],
    controllers: [
        AgentPersonaController,
        AgentProfileController,
        AgentPromptTemplateController,
        AgentSkillController,
    ],
    providers: [
        // Persona
        AgentPersonaService,
        // Profile
        AgentProfileService,
        OutputSchemaRegistryService,
        // Prompt Template
        AgentPromptTemplateService,
        // Skill
        AgentSkillService,
        ToolHandlerRegistryService,
        AgentSkillGovernanceJob,
        CalculateSumMockHandler,
        KnowledgeQueryToolHandler,
    ],
    exports: [
        AgentPersonaService,
        AgentProfileService,
        OutputSchemaRegistryService,
        AgentPromptTemplateService,
        AgentSkillService,
        ToolHandlerRegistryService,
    ],
})
export class AgentConfigModule implements OnModuleInit {
    constructor(
        private readonly registry: ToolHandlerRegistryService,
        private readonly calcSumMock: CalculateSumMockHandler,
        private readonly knowledgeQuery: KnowledgeQueryToolHandler,
    ) { }

    onModuleInit() {
        this.registry.registerHandler(this.calcSumMock);
        this.registry.registerHandler(this.knowledgeQuery);
    }
}

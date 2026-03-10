export { AgentConfigModule } from './agent-config.module';

// Re-export all services for backward compatibility
export { AgentPersonaService } from '../agent-persona/agent-persona.service';
export { AgentProfileService } from '../agent-profile/agent-profile.service';
export { OutputSchemaRegistryService } from '../agent-profile/output-schema-registry.service';
export { AgentPromptTemplateService } from '../agent-prompt-template/agent-prompt-template.service';
export { AgentSkillService } from '../agent-skill/agent-skill.service';
export { ToolHandlerRegistryService } from '../agent-skill/tool-handler-registry.service';

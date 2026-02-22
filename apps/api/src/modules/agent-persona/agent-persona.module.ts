
import { Module, Global } from '@nestjs/common';
import { AgentPersonaController } from './agent-persona.controller';
import { AgentPersonaService } from './agent-persona.service';

@Global()
@Module({
    controllers: [AgentPersonaController],
    providers: [AgentPersonaService],
    exports: [AgentPersonaService],
})
export class AgentPersonaModule { }

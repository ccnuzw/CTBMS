
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AgentPersonaService } from './agent-persona.service';

@Controller('agent-personas')
export class AgentPersonaController {
    constructor(private readonly personaService: AgentPersonaService) { }

    @Get()
    findAll() {
        return this.personaService.findAll();
    }

    @Get(':code')
    findOne(@Param('code') code: string) {
        return this.personaService.findOne(code);
    }

    @Post()
    create(@Body() body: unknown) {
        return this.personaService.create(body); // TODO: Add DTO
    }
}

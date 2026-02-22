import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ConnectorService } from './connector.service';

@Controller('connectors')
export class ConnectorController {
    constructor(private readonly connectorService: ConnectorService) { }

    @Get()
    getAllConnectors() {
        return this.connectorService.getAllConnectors();
    }

    @Get(':id')
    getConnector(@Param('id') id: string) {
        return this.connectorService.getConnector(id);
    }

    @Post(':id/execute')
    async execute(
        @Param('id') id: string,
        @Body() body: { endpoint: string; params: Record<string, unknown> },
    ) {
        return this.connectorService.executeEndpoint(id, body.endpoint, body.params);
    }
}

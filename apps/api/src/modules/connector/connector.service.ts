import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import axios from 'axios';
import { get } from 'lodash';
import { ConnectorManifest, ETLProcess } from '@packages/types';

@Injectable()
export class ConnectorService {
    private readonly logger = new Logger(ConnectorService.name);
    private connectorRegistry: Map<string, ConnectorManifest> = new Map();
    private readonly definitionsPath = path.resolve(process.cwd(), 'apps/api/src/modules/connector/definitions');

    constructor() {
        this.loadConnectors();
    }

    /**
     * Load all connector definitions from the filesystem
     */
    private loadConnectors() {
        try {
            if (!fs.existsSync(this.definitionsPath)) {
                this.logger.warn(`Connector definitions directory not found: ${this.definitionsPath}`);
                return;
            }

            const files = fs.readdirSync(this.definitionsPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

            for (const file of files) {
                try {
                    const filePath = path.join(this.definitionsPath, file);
                    const fileContents = fs.readFileSync(filePath, 'utf8');
                    const manifest = yaml.load(fileContents) as ConnectorManifest;

                    if (manifest && manifest.meta && manifest.meta.id) {
                        this.connectorRegistry.set(manifest.meta.id, manifest);
                        this.logger.log(`Loaded connector: ${manifest.meta.id} (${manifest.meta.name})`);
                    }
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
                    this.logger.error(`Failed to load connector file ${file}: ${message}`);
                }
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            this.logger.error(`Failed to initialize connector registry: ${message}`);
        }
    }

    public getConnector(id: string): ConnectorManifest | undefined {
        return this.connectorRegistry.get(id);
    }

    public getAllConnectors(): ConnectorManifest[] {
        return Array.from(this.connectorRegistry.values());
    }

    /**
     * Execute a connector endpoint
     */
    public async executeEndpoint(connectorId: string, endpointId: string, params: Record<string, unknown>) {
        const manifest = this.getConnector(connectorId);
        if (!manifest) {
            throw new BadRequestException(`Connector ${connectorId} not found`);
        }

        const endpoint = manifest.endpoints.find(e => e.id === endpointId);
        if (!endpoint) {
            throw new BadRequestException(`Endpoint ${endpointId} not found in connector ${connectorId}`);
        }

        // specific logic for GET request params construction
        let url = endpoint.url;
        const queryParams: Record<string, unknown> = {};

        if (endpoint.params) {
            for (const paramDef of endpoint.params) {
                const value = params[paramDef.name];
                if (paramDef.required && value === undefined) {
                    throw new BadRequestException(`Missing required parameter: ${paramDef.name}`);
                }

                if (value !== undefined) {
                    if (paramDef.in === 'QUERY') {
                        queryParams[paramDef.name] = value;
                    } else if (paramDef.in === 'PATH') {
                        url = url.replace(`:${paramDef.name}`, String(value));
                    }
                }
            }
        }

        this.logger.log(`Executing ${endpoint.method} ${url} with connector ${connectorId}`);

        try {
            const response = await axios({
                method: endpoint.method,
                url: url,
                params: queryParams,
            });

            let result = response.data;

            // Apply ETL Transformation
            if (manifest.transform) {
                result = await this.applyETL(result, manifest.transform, params);
            }

            return result;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: unknown) { // axios error often has specific structure, keeping any for now but adding comment or using unknown + cast
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Connector execution failed: ${message}`, (error as Record<string, unknown>)?.response);
            throw new BadRequestException(`Connector execution failed: ${message}`);
        }
    }

    /**
     * Apply ETL Pipeline
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async applyETL(data: unknown, pipeline: ETLProcess[], originalParams: Record<string, unknown>): Promise<unknown> {
        let current = data;

        for (const step of pipeline) {
            switch (step.op) {
                case 'json_pick':
                    if (step.args.path) {
                        const path = step.args.path.replace(/^\$\./, '');
                        current = get(current, path);
                    }
                    break;

                case 'template_render':
                    if (step.args.tmpl) {
                        let tmpl = step.args.tmpl;
                        tmpl = tmpl.replace('{{result}}', String(current));
                        for (const [key, value] of Object.entries(originalParams)) {
                            tmpl = tmpl.replace(`{{${key}}}`, String(value));
                        }
                        current = tmpl;
                    }
                    break;
            }
        }
        return current;
    }
}

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import axios from 'axios';
import { get } from 'lodash';
import { ConnectorManifest, ETLProcess } from '@packages/types';
import { PrismaService } from '../../prisma';
import { validateConnectorContract } from './connector-contract.util';

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);
  private connectorRegistry: Map<string, ConnectorManifest> = new Map();
  private readonly definitionsPath = path.resolve(
    process.cwd(),
    'apps/api/src/modules/connector/definitions',
  );

  constructor(private readonly prisma: PrismaService) {
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

      const files = fs
        .readdirSync(this.definitionsPath)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

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
  public async executeEndpoint(
    connectorId: string,
    endpointId: string,
    params: Record<string, unknown>,
  ) {
    const manifest = this.getConnector(connectorId);
    if (manifest) {
      return this.executeManifestEndpoint(manifest, connectorId, endpointId, params);
    }

    const dataConnector = await this.prisma.dataConnector.findFirst({
      where: {
        isActive: true,
        OR: [{ id: connectorId }, { connectorCode: connectorId }],
      },
    });

    if (dataConnector) {
      return this.executeDataConnectorEndpoint(
        this.toRecord(dataConnector),
        connectorId,
        endpointId,
        params,
      );
    }

    throw new BadRequestException(`Connector ${connectorId} not found`);
  }

  private async executeManifestEndpoint(
    manifest: ConnectorManifest,
    connectorId: string,
    endpointId: string,
    params: Record<string, unknown>,
  ) {
    const endpoint = manifest.endpoints.find((e) => e.id === endpointId);
    if (!endpoint) {
      throw new BadRequestException(`Endpoint ${endpointId} not found in connector ${connectorId}`);
    }

    const contractValidation = validateConnectorContract({
      connectorCode: manifest.meta.id,
      connectorType: 'REST_API',
      endpointConfig: { url: endpoint.url },
    });
    if (!contractValidation.valid) {
      throw new BadRequestException(
        `Connector contract invalid: ${contractValidation.missingFields.join(', ')}`,
      );
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
    } catch (error: unknown) {
      // axios error often has specific structure, keeping any for now but adding comment or using unknown + cast
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Connector execution failed: ${message}`,
        (error as Record<string, unknown>)?.response,
      );
      throw new BadRequestException(`Connector execution failed: ${message}`);
    }
  }

  private async executeDataConnectorEndpoint(
    connector: Record<string, unknown>,
    connectorId: string,
    endpointId: string,
    params: Record<string, unknown>,
  ) {
    if (endpointId && !['default', 'execute', 'fetch'].includes(endpointId)) {
      throw new BadRequestException(
        `DataConnector 仅支持 default/execute/fetch 端点标识，当前: ${endpointId}`,
      );
    }

    const contractValidation = validateConnectorContract(connector);
    if (!contractValidation.valid) {
      throw new BadRequestException(
        `Connector contract invalid: ${contractValidation.missingFields.join(', ')}`,
      );
    }

    const connectorType = String(connector.connectorType ?? '').toUpperCase();
    if (!['REST_API', 'EXCHANGE_API', 'GRAPHQL', 'WEBHOOK'].includes(connectorType)) {
      throw new BadRequestException(
        `DataConnector ${connectorId} 暂不支持通过 /connectors 执行该类型: ${connectorType}`,
      );
    }

    const endpointConfig = this.toRecord(connector.endpointConfig);
    const rateLimitConfig = this.toRecord(connector.rateLimitConfig);

    const url = endpointConfig.url;
    if (typeof url !== 'string' || !url.trim()) {
      throw new BadRequestException('DataConnector 缺少 endpointConfig.url');
    }

    const method = this.normalizeHttpMethod(endpointConfig.method);
    const headerInput = this.toRecord(endpointConfig.headers);
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(headerInput)) {
      if (value !== null && value !== undefined) {
        headers[key] = String(value);
      }
    }

    const timeout = this.resolveTimeoutMs(endpointConfig, rateLimitConfig);
    const sendBody = method === 'POST' || method === 'PUT';

    this.logger.log(`Executing ${method} ${url} with data connector ${connectorId}`);

    try {
      const response = await axios({
        method,
        url,
        params: sendBody ? undefined : params,
        data: sendBody ? params : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        timeout,
      });

      let result = response.data;
      const responseMapping = this.toRecord(connector.responseMapping);
      const dataPath = responseMapping.dataPath;
      if (typeof dataPath === 'string' && dataPath.trim()) {
        result = get(result, dataPath.trim(), result);
      }

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `DataConnector execution failed: ${message}`,
        (error as Record<string, unknown>)?.response,
      );
      throw new BadRequestException(`Connector execution failed: ${message}`);
    }
  }

  /**
   * Apply ETL Pipeline
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async applyETL(
    data: unknown,
    pipeline: ETLProcess[],
    originalParams: Record<string, unknown>,
  ): Promise<unknown> {
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

  private toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private normalizeHttpMethod(value: unknown): 'GET' | 'POST' | 'PUT' | 'DELETE' {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (normalized === 'POST' || normalized === 'PUT' || normalized === 'DELETE') {
      return normalized;
    }
    return 'GET';
  }

  private resolveTimeoutMs(
    endpointConfig: Record<string, unknown>,
    rateLimitConfig: Record<string, unknown>,
  ): number {
    const endpointTimeoutPolicy = this.toRecord(endpointConfig.timeoutPolicy);
    const fromEndpoint = this.parsePositiveNumber(endpointTimeoutPolicy.requestTimeoutMs);
    if (fromEndpoint !== null) {
      return fromEndpoint;
    }

    const fromRateLimitMs = this.parsePositiveNumber(rateLimitConfig.timeoutMs);
    if (fromRateLimitMs !== null) {
      return fromRateLimitMs;
    }

    const fromRateLimitSeconds = this.parsePositiveNumber(rateLimitConfig.timeoutSeconds);
    if (fromRateLimitSeconds !== null) {
      return fromRateLimitSeconds <= 120 ? fromRateLimitSeconds * 1000 : fromRateLimitSeconds;
    }

    return 30_000;
  }

  private parsePositiveNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  }
}

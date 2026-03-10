import { z } from 'zod';

// --- ETL Process ---
export const ETLProcessSchema = z.object({
  op: z.enum(['json_pick', 'list_slice', 'unit_convert', 'template_render', 'flatten_nested']),
  args: z.record(z.unknown()),
});

export const ConnectorAuthSchema = z.object({
  type: z.enum(['NONE', 'API_KEY', 'OAUTH2']),
  param: z.string().optional(),
  in: z.enum(['QUERY', 'BODY', 'PATH', 'HEADER']).optional(),
  config: z
    .object({
      header_name: z.string().optional(),
      token_prefix: z.string().optional(),
    })
    .optional(),
});

export type ConnectorAuth = z.infer<typeof ConnectorAuthSchema>;

const ConnectorEndpointParamSchema = z.object({
  name: z.string(),
  required: z.boolean(),
  in: z.enum(['QUERY', 'BODY', 'PATH', 'HEADER']),
  description: z.string().optional(),
  default: z.unknown().optional(),
});

const ConnectorEndpointSchema = z.object({
  id: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  url: z.string(),
  params: z.array(ConnectorEndpointParamSchema).optional(),
});

const ConnectorContractJsonSchema = z.record(z.unknown());

const ConnectorMetaSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  category: z.enum(['FINANCE', 'NEWS', 'UTILITY']).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  auth: ConnectorAuthSchema.optional(),
});

export type ETLProcess = z.infer<typeof ETLProcessSchema>;

// --- Connector Manifest ---
export const ConnectorManifestSchema = z.object({
  meta: ConnectorMetaSchema,
  auth: ConnectorAuthSchema.optional(),
  endpoints: z.array(ConnectorEndpointSchema),
  transform: z.array(ETLProcessSchema).optional(),
  endpointConfig: ConnectorContractJsonSchema.optional(),
  queryTemplates: ConnectorContractJsonSchema.optional(),
  responseMapping: ConnectorContractJsonSchema.optional(),
  freshnessPolicy: ConnectorContractJsonSchema.optional(),
  rateLimitConfig: ConnectorContractJsonSchema.optional(),
  healthCheckConfig: ConnectorContractJsonSchema.optional(),
});

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;

// --- API DTOs ---
export const ExecuteConnectorRequestSchema = z.object({
  connectorId: z.string(),
  endpointId: z.string(),
  params: z.record(z.unknown()),
  debug: z.boolean().optional(),
});

export type ExecuteConnectorRequest = z.infer<typeof ExecuteConnectorRequestSchema>;

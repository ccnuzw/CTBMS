type ConnectorJson = Record<string, unknown> | null | undefined;

export type RuntimeConnectorContract = {
  connectorCode?: string;
  connectorType?: string;
  endpointConfig?: ConnectorJson;
  queryTemplates?: ConnectorJson;
  responseMapping?: ConnectorJson;
  freshnessPolicy?: ConnectorJson;
  rateLimitConfig?: ConnectorJson;
  healthCheckConfig?: ConnectorJson;
};

export type ConnectorContractValidationResult = {
  valid: boolean;
  missingFields: string[];
  requiredFields: string[];
};

export type ConnectorPayloadSchemaMode = 'request' | 'response';

export type ConnectorSchemaValidationResult = {
  valid: boolean;
  issues: string[];
  schemaPath: string | null;
};

const REQUIRED_FIELDS_BY_TYPE: Record<string, string[]> = {
  REST_API: ['endpointConfig.url'],
  EXCHANGE_API: ['endpointConfig.url'],
  GRAPHQL: ['endpointConfig.url'],
  WEBHOOK: ['endpointConfig.url'],
  INTERNAL_DB: ['queryTemplates.tableName|queryTemplates.standardDataset'],
  FILE_IMPORT: ['endpointConfig.filePath'],
};

const CUSTOM_REQUIRED_FIELDS_PATHS = [
  'healthCheckConfig.requiredFields',
  'endpointConfig.requiredFields',
];

export const validateConnectorContract = (
  contract: RuntimeConnectorContract | Record<string, unknown>,
  options?: {
    additionalRequiredFields?: string[];
  },
): ConnectorContractValidationResult => {
  const connectorType = normalizeConnectorType(readByPath(contract, 'connectorType'));
  const requiredFields = dedupeStringList([
    'connectorType',
    ...(REQUIRED_FIELDS_BY_TYPE[connectorType] ?? []),
    ...resolveCustomRequiredFields(contract),
    ...(options?.additionalRequiredFields ?? []),
  ]);

  const missingFields = requiredFields.filter(
    (fieldSpec) => !hasValueForFieldSpec(contract, fieldSpec),
  );
  return {
    valid: missingFields.length === 0,
    missingFields,
    requiredFields,
  };
};

export const validateConnectorSchemaDefinitions = (
  contract: RuntimeConnectorContract | Record<string, unknown>,
): ConnectorSchemaValidationResult => {
  const issues: string[] = [];
  const requestSchema = resolveContractSchema(contract, 'request');
  const responseSchema = resolveContractSchema(contract, 'response');

  if (requestSchema.schema !== undefined) {
    validateSchemaDefinitionNode(requestSchema.schema, '$request', issues, 0);
  }
  if (responseSchema.schema !== undefined) {
    validateSchemaDefinitionNode(responseSchema.schema, '$response', issues, 0);
  }

  return {
    valid: issues.length === 0,
    issues,
    schemaPath: requestSchema.path ?? responseSchema.path,
  };
};

export const validateConnectorPayloadBySchema = (
  contract: RuntimeConnectorContract | Record<string, unknown>,
  mode: ConnectorPayloadSchemaMode,
  payload: unknown,
): ConnectorSchemaValidationResult => {
  const { schema, path } = resolveContractSchema(contract, mode);
  if (schema === undefined) {
    return {
      valid: true,
      issues: [],
      schemaPath: null,
    };
  }

  const issues: string[] = [];
  validatePayloadAgainstSchema(
    schema,
    payload,
    '$',
    issues,
    {
      strictRequired: mode === 'response',
    },
    0,
  );

  return {
    valid: issues.length === 0,
    issues,
    schemaPath: path,
  };
};

const resolveCustomRequiredFields = (
  contract: RuntimeConnectorContract | Record<string, unknown>,
): string[] => {
  const customFields: string[] = [];
  for (const path of CUSTOM_REQUIRED_FIELDS_PATHS) {
    const value = readByPath(contract, path);
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        customFields.push(item.trim());
      }
    }
  }
  return customFields;
};

const hasValueForFieldSpec = (
  contract: RuntimeConnectorContract | Record<string, unknown>,
  fieldSpec: string,
): boolean => {
  const alternatives = fieldSpec
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  if (alternatives.length === 0) {
    return true;
  }

  return alternatives.some((path) => hasValueAtPath(contract, path));
};

const hasValueAtPath = (target: unknown, path: string): boolean => {
  const value = readByPath(target, path);
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
};

const readByPath = (target: unknown, path: string): unknown => {
  if (!path) {
    return undefined;
  }
  const segments = path.split('.').filter(Boolean);
  let cursor: unknown = target;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

const normalizeConnectorType = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toUpperCase();
};

const dedupeStringList = (items: string[]): string[] => {
  const set = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!item || set.has(item)) {
      continue;
    }
    set.add(item);
    result.push(item);
  }
  return result;
};

const SUPPORTED_SCHEMA_TYPE_MARKERS = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'datetime',
  'date',
  'object',
  'array',
  'any',
]);

const resolveContractSchema = (
  contract: RuntimeConnectorContract | Record<string, unknown>,
  mode: ConnectorPayloadSchemaMode,
): { schema: unknown; path: string | null } => {
  const pathCandidates =
    mode === 'request'
      ? ['queryTemplates.requestSchema', 'requestSchema', 'endpointConfig.requestSchema']
      : ['responseMapping.responseSchema', 'responseSchema', 'queryTemplates.responseSchema'];

  for (const path of pathCandidates) {
    const value = readByPath(contract, path);
    if (value !== undefined && value !== null) {
      return {
        schema: value,
        path,
      };
    }
  }

  return {
    schema: undefined,
    path: null,
  };
};

const validateSchemaDefinitionNode = (
  schema: unknown,
  path: string,
  issues: string[],
  depth: number,
) => {
  if (issues.length >= 20) {
    return;
  }
  if (depth > 10) {
    issues.push(`${path}: schema depth exceeds 10`);
    return;
  }

  if (schema === null || schema === undefined) {
    issues.push(`${path}: schema cannot be null`);
    return;
  }

  if (typeof schema === 'string') {
    if (!SUPPORTED_SCHEMA_TYPE_MARKERS.has(schema.trim().toLowerCase())) {
      issues.push(`${path}: unsupported type marker '${schema}'`);
    }
    return;
  }

  if (Array.isArray(schema)) {
    if (schema.length === 0) {
      issues.push(`${path}: array schema cannot be empty`);
      return;
    }

    const isEnumCandidate = schema.every(
      (item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
    );
    if (isEnumCandidate) {
      return;
    }

    if (schema.length > 1) {
      issues.push(`${path}: array schema must have one item schema or enum literals`);
      return;
    }

    validateSchemaDefinitionNode(schema[0], `${path}[0]`, issues, depth + 1);
    return;
  }

  if (!isRecord(schema)) {
    issues.push(`${path}: unsupported schema node type '${typeof schema}'`);
    return;
  }

  if (isJsonSchemaNode(schema)) {
    validateJsonSchemaDefinitionNode(schema, path, issues, depth + 1);
    return;
  }

  for (const [key, value] of Object.entries(schema)) {
    validateSchemaDefinitionNode(value, `${path}.${key}`, issues, depth + 1);
  }
};

const validatePayloadAgainstSchema = (
  schema: unknown,
  payload: unknown,
  path: string,
  issues: string[],
  options: { strictRequired: boolean },
  depth: number,
) => {
  if (issues.length >= 20) {
    return;
  }
  if (depth > 10) {
    issues.push(`${path}: payload depth exceeds 10`);
    return;
  }

  if (typeof schema === 'string') {
    validatePrimitiveByMarker(schema, payload, path, issues);
    return;
  }

  if (Array.isArray(schema)) {
    if (schema.length === 0) {
      issues.push(`${path}: empty schema array is not allowed`);
      return;
    }
    const isEnumCandidate = schema.every(
      (item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
    );
    if (isEnumCandidate) {
      if (Array.isArray(payload)) {
        const denied = payload.filter((item) => !schema.includes(item as never));
        if (denied.length > 0) {
          issues.push(`${path}: value not in enum set`);
        }
        return;
      }
      if (!schema.includes(payload as never)) {
        issues.push(`${path}: value not in enum set`);
      }
      return;
    }

    if (!Array.isArray(payload)) {
      issues.push(`${path}: expected array`);
      return;
    }
    const itemSchema = schema[0];
    payload.forEach((item, index) => {
      validatePayloadAgainstSchema(
        itemSchema,
        item,
        `${path}[${index}]`,
        issues,
        options,
        depth + 1,
      );
    });
    return;
  }

  if (!isRecord(schema)) {
    issues.push(`${path}: invalid schema node`);
    return;
  }

  if (isJsonSchemaNode(schema)) {
    validatePayloadAgainstJsonSchema(schema, payload, path, issues, options, depth + 1);
    return;
  }

  if (!isRecord(payload)) {
    issues.push(`${path}: expected object`);
    return;
  }

  for (const [rawKey, childSchema] of Object.entries(schema)) {
    const optional = rawKey.endsWith('?');
    const key = optional ? rawKey.slice(0, -1) : rawKey;
    const value = payload[key];
    if ((value === undefined || value === null) && options.strictRequired && !optional) {
      issues.push(`${path}.${key}: missing required field`);
      continue;
    }
    if (value === undefined || value === null) {
      continue;
    }
    validatePayloadAgainstSchema(childSchema, value, `${path}.${key}`, issues, options, depth + 1);
  }
};

const validateJsonSchemaDefinitionNode = (
  schema: Record<string, unknown>,
  path: string,
  issues: string[],
  depth: number,
) => {
  const type = schema.type;
  if (typeof type === 'string') {
    if (!SUPPORTED_SCHEMA_TYPE_MARKERS.has(type.toLowerCase())) {
      issues.push(`${path}: unsupported json schema type '${type}'`);
    }
  }

  const properties = schema.properties;
  if (properties !== undefined && !isRecord(properties)) {
    issues.push(`${path}.properties: should be object`);
  }
  if (isRecord(properties)) {
    for (const [key, value] of Object.entries(properties)) {
      validateSchemaDefinitionNode(value, `${path}.properties.${key}`, issues, depth + 1);
    }
  }

  if (schema.items !== undefined) {
    validateSchemaDefinitionNode(schema.items, `${path}.items`, issues, depth + 1);
  }
};

const validatePayloadAgainstJsonSchema = (
  schema: Record<string, unknown>,
  payload: unknown,
  path: string,
  issues: string[],
  options: { strictRequired: boolean },
  depth: number,
) => {
  const type = typeof schema.type === 'string' ? schema.type.toLowerCase() : undefined;

  if (type) {
    validatePrimitiveByMarker(type, payload, path, issues);
    if (issues.length > 0) {
      return;
    }
  }

  if (type === 'array' && schema.items !== undefined && Array.isArray(payload)) {
    payload.forEach((item, index) => {
      validatePayloadAgainstSchema(
        schema.items,
        item,
        `${path}[${index}]`,
        issues,
        options,
        depth + 1,
      );
    });
    return;
  }

  const properties = isRecord(schema.properties) ? schema.properties : null;
  if (!properties) {
    return;
  }

  if (!isRecord(payload)) {
    issues.push(`${path}: expected object`);
    return;
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      )
    : [];

  for (const [key, childSchema] of Object.entries(properties)) {
    const value = payload[key];
    if (
      (value === undefined || value === null) &&
      options.strictRequired &&
      required.includes(key)
    ) {
      issues.push(`${path}.${key}: missing required field`);
      continue;
    }
    if (value === undefined || value === null) {
      continue;
    }
    validatePayloadAgainstSchema(childSchema, value, `${path}.${key}`, issues, options, depth + 1);
  }
};

const validatePrimitiveByMarker = (
  marker: string,
  value: unknown,
  path: string,
  issues: string[],
) => {
  const normalized = marker.trim().toLowerCase();
  if (normalized === 'any') {
    return;
  }

  if (normalized === 'string') {
    if (typeof value !== 'string') {
      issues.push(`${path}: expected string`);
    }
    return;
  }

  if (normalized === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(`${path}: expected number`);
    }
    return;
  }

  if (normalized === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      issues.push(`${path}: expected integer`);
    }
    return;
  }

  if (normalized === 'boolean') {
    if (typeof value !== 'boolean') {
      issues.push(`${path}: expected boolean`);
    }
    return;
  }

  if (normalized === 'datetime' || normalized === 'date') {
    if (typeof value !== 'string' || !isValidDateString(value, normalized === 'date')) {
      issues.push(`${path}: expected ${normalized} string`);
    }
    return;
  }

  if (normalized === 'object') {
    if (!isRecord(value)) {
      issues.push(`${path}: expected object`);
    }
    return;
  }

  if (normalized === 'array') {
    if (!Array.isArray(value)) {
      issues.push(`${path}: expected array`);
    }
    return;
  }

  issues.push(`${path}: unsupported marker '${marker}'`);
};

const isJsonSchemaNode = (schema: Record<string, unknown>): boolean => {
  return (
    'type' in schema ||
    'properties' in schema ||
    'items' in schema ||
    'required' in schema ||
    '$schema' in schema
  );
};

const isValidDateString = (value: string, dateOnly: boolean): boolean => {
  if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime());
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

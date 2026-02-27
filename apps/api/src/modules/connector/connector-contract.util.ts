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

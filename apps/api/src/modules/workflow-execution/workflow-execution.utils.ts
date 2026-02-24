import { Prisma } from '@prisma/client';
import { WorkflowFailureCategory } from '@packages/types';

export type WorkflowFailureCode =
  | 'EXECUTION_TIMEOUT'
  | 'EXECUTION_CANCELED'
  | 'NODE_TIMEOUT'
  | 'NODE_EXECUTOR_ERROR'
  | 'NODE_RESULT_FAILED'
  | 'EXECUTION_INTERNAL_ERROR';

export class WorkflowExecutionHandledError extends Error {
  constructor(
    message: string,
    public readonly failureCategory: WorkflowFailureCategory,
    public readonly failureCode: WorkflowFailureCode,
    public readonly targetStatus: 'FAILED' | 'CANCELED' = 'FAILED',
  ) {
    super(message);
    this.name = 'WorkflowExecutionHandledError';
  }
}

export class WorkflowTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowTimeoutError';
  }
}

export function classifyFailure(error: unknown): {
  message: string;
  failureCategory: WorkflowFailureCategory;
  failureCode: WorkflowFailureCode;
} {
  if (error instanceof WorkflowExecutionHandledError) {
    return {
      message: error.message,
      failureCategory: error.failureCategory,
      failureCode: error.failureCode,
    };
  }

  if (error instanceof WorkflowTimeoutError) {
    return {
      message: error.message,
      failureCategory: 'TIMEOUT',
      failureCode: 'NODE_TIMEOUT',
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      failureCategory: 'EXECUTOR',
      failureCode: 'NODE_EXECUTOR_ERROR',
    };
  }

  return {
    message: '执行失败',
    failureCategory: 'INTERNAL',
    failureCode: 'EXECUTION_INTERNAL_ERROR',
  };
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'P2002';
}

export function readMeta(outputSnapshot: Record<string, unknown>): Record<string, unknown> {
  const meta = outputSnapshot._meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return {};
  }
  return meta as Record<string, unknown>;
}

export function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

export function uniqueStringList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const set = new Set<string>();
  for (const item of source) {
    if (typeof item !== 'string') {
      continue;
    }
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    set.add(normalized);
  }
  return [...set];
}

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function toRecord(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function parseConditionLiteral(raw: string): unknown {
  const value = raw.trim();
  if (!value) {
    return '';
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const parsedNumber = Number(value);
  if (Number.isFinite(parsedNumber)) {
    return parsedNumber;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function compareConditionValues(actual: unknown, expected: unknown, operator: string): boolean {
  const normalizeOperator = operator.toLowerCase();
  if (normalizeOperator === '==') {
    return actual === expected;
  }
  if (normalizeOperator === '!=') {
    return actual !== expected;
  }
  if (normalizeOperator === 'eq') {
    return actual === expected;
  }
  if (normalizeOperator === 'neq') {
    return actual !== expected;
  }
  if (normalizeOperator === 'in') {
    return Array.isArray(expected) && expected.includes(actual);
  }
  if (normalizeOperator === 'not_in') {
    return Array.isArray(expected) && !expected.includes(actual);
  }
  if (normalizeOperator === 'exists') {
    return actual !== undefined && actual !== null;
  }
  if (normalizeOperator === 'not_exists') {
    return actual === undefined || actual === null;
  }

  const actualNumber = toFiniteNumber(actual);
  const expectedNumber = toFiniteNumber(expected);
  if (actualNumber === null || expectedNumber === null) {
    return false;
  }

  if (normalizeOperator === '>' || normalizeOperator === 'gt') {
    return actualNumber > expectedNumber;
  }
  if (normalizeOperator === '>=' || normalizeOperator === 'gte') {
    return actualNumber >= expectedNumber;
  }
  if (normalizeOperator === '<' || normalizeOperator === 'lt') {
    return actualNumber < expectedNumber;
  }
  if (normalizeOperator === '<=' || normalizeOperator === 'lte') {
    return actualNumber <= expectedNumber;
  }
  return false;
}

export function readValueByPath(source: Record<string, unknown>, path: string): unknown {
  if (!path.trim()) {
    return undefined;
  }
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((item) => item.trim())
    .filter(Boolean);
  let current: unknown = source;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function toInteger(value: unknown, fallback: number, min: number, max: number): number {
  let parsed = fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    parsed = Math.trunc(value);
  } else if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      parsed = Math.trunc(numeric);
    }
  }
  return Math.max(min, Math.min(max, parsed));
}

export async function executeWithTimeout<T>(
  task: () => Promise<T>,
  timeoutSeconds: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new WorkflowTimeoutError(timeoutMessage));
    }, timeoutSeconds);

    task()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

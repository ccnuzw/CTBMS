// ─── MarketData 纯工具函数 ───────────────────────────────────────────────────
// 提取自 MarketDataService，均为无状态的纯函数或简单静态方法。
// 主 Service 通过 MarketDataHelpers.xxx() 调用。

import { BadRequestException } from '@nestjs/common';
import type {
    ReconciliationJob,
    ReconciliationListSortBy,
    ReconciliationListSortOrder,
    ReconciliationDataset,
    RollbackDrillStatus,
    StandardDataset,
    ReconciliationCutoverExecutionRecord,
} from './market-data.types';

// ─── Parsing ─────────────────────────────────────────────────────────────────

export function parseOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        return undefined;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return undefined;
}

export function parseOptionalDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
        throw new BadRequestException(`Invalid datetime value: ${value}`);
    }
    return parsed;
}

export function parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }
    return false;
}

export function parseFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

export function parsePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (Number.isInteger(value) && value > 0) return value;
        return null;
    }
    if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return null;
}

export function parseNonNegativeInteger(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    const parsed = parseFiniteNumber(value);
    if (parsed === undefined) return undefined;
    const int = Math.trunc(parsed);
    if (int < 0) return undefined;
    return int;
}

export function parseInteger(value: unknown): number {
    const parsed = parseFiniteNumber(value);
    if (parsed === undefined) return 0;
    const int = Math.trunc(parsed);
    return int >= 0 ? int : 0;
}

export function parseRetryCount(value: unknown): number {
    const parsed = parseFiniteNumber(value);
    if (parsed === undefined) return 0;
    if (parsed <= 0) return 0;
    return Math.trunc(parsed);
}

export function parseJsonValue<T>(value: unknown): T | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch {
            return undefined;
        }
    }
    return value as T;
}

// ─── Date / Time ─────────────────────────────────────────────────────────────

export function toUtcDateKey(value: string | Date | unknown): string {
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) {
        return new Date().toISOString().slice(0, 10);
    }
    return parsed.toISOString().slice(0, 10);
}

export function toIsoString(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) return undefined;
    return parsed.toISOString();
}

export function toTimestampMs(value: unknown): number {
    if (value === null || value === undefined) return Number.NEGATIVE_INFINITY;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) return Number.NEGATIVE_INFINITY;
    return parsed.getTime();
}

// ─── Normalization ───────────────────────────────────────────────────────────

export function normalizeCoverageRate(value: unknown, fallback: number): number {
    const parsed = parseFiniteNumber(value);
    if (parsed === undefined) return fallback;
    if (parsed < 0) return 0;
    if (parsed > 1) return 1;
    return parsed;
}

export function normalizeReconciliationStatus(status: string): ReconciliationJob['status'] {
    if (
        status === 'PENDING' ||
        status === 'RUNNING' ||
        status === 'DONE' ||
        status === 'FAILED' ||
        status === 'CANCELLED'
    ) {
        return status;
    }
    return 'FAILED';
}

export function normalizeRollbackDrillStatus(status: string | undefined): RollbackDrillStatus {
    if (
        status === 'PLANNED' ||
        status === 'RUNNING' ||
        status === 'PASSED' ||
        status === 'FAILED'
    ) {
        return status;
    }
    return 'PASSED';
}

export function normalizeReconciliationDataset(dataset: string): ReconciliationDataset {
    if (dataset === 'SPOT_PRICE' || dataset === 'FUTURES_QUOTE' || dataset === 'MARKET_EVENT') {
        return dataset;
    }
    return 'SPOT_PRICE';
}

export function normalizeReconciliationSortBy(sortBy?: string): ReconciliationListSortBy {
    if (!sortBy) return 'createdAt';
    const candidate = sortBy as ReconciliationListSortBy;
    if (
        candidate === 'createdAt' ||
        candidate === 'status' ||
        candidate === 'dataset'
    ) {
        return candidate;
    }
    return 'createdAt';
}

export function normalizeReconciliationSortOrder(sortOrder?: string): ReconciliationListSortOrder {
    if (sortOrder === 'asc' || sortOrder === 'ASC') return 'asc';
    return 'desc';
}

export function parseStandardDatasetsFromEnv(
    value: string | undefined,
): StandardDataset[] | undefined {
    if (!value) return undefined;

    const tokens = value
        .split(',')
        .map((item) => item.trim().toUpperCase())
        .filter((item) => item.length > 0);
    if (tokens.length === 0) return undefined;

    const mapped = tokens
        .map((item) => {
            if (item === 'SPOT_PRICE' || item === 'PRICE_DATA' || item === 'SPOT') {
                return 'SPOT_PRICE' as const;
            }
            if (item === 'FUTURES_QUOTE' || item === 'FUTURES_QUOTE_SNAPSHOT' || item === 'FUTURES') {
                return 'FUTURES_QUOTE' as const;
            }
            if (item === 'MARKET_EVENT' || item === 'MARKET_INTEL' || item === 'EVENT') {
                return 'MARKET_EVENT' as const;
            }
            return undefined;
        })
        .filter((item): item is StandardDataset => Boolean(item));

    if (mapped.length === 0) return undefined;

    return mapped.filter((item, index, all) => all.indexOf(item) === index);
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

export function getReconciliationSortValue(
    job: ReconciliationJob,
    sortBy: ReconciliationListSortBy,
): number | string | null {
    switch (sortBy) {
        case 'createdAt':
            return job.createdAt ? new Date(job.createdAt).getTime() : 0;
        case 'dataset':
            return job.dataset ?? '';
        case 'status':
            return job.status ?? '';
        default:
            return null;
    }
}

export function compareReconciliationJobs(
    a: ReconciliationJob,
    b: ReconciliationJob,
    sortBy: ReconciliationListSortBy,
    sortOrder: ReconciliationListSortOrder,
): number {
    const directionMultiplier = sortOrder === 'asc' ? 1 : -1;
    const aValue = getReconciliationSortValue(a, sortBy);
    const bValue = getReconciliationSortValue(b, sortBy);

    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return directionMultiplier;
    if (bValue === null) return -directionMultiplier;

    if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * directionMultiplier;
    }
    if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * directionMultiplier;
    }
    return 0;
}

// ─── Dimension matching ──────────────────────────────────────────────────────

export function extractScalarDimensions(
    input: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return undefined;
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                normalized[key] = trimmed;
            }
            continue;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            normalized[key] = value;
            continue;
        }
        if (typeof value === 'boolean') {
            normalized[key] = value;
        }
    }

    if (Object.keys(normalized).length === 0) {
        return undefined;
    }

    return normalized;
}

export function isEquivalentDimensionValue(actualValue: unknown, expectedValue: unknown): boolean {
    if (typeof actualValue === 'string' || typeof expectedValue === 'string') {
        return (
            String(actualValue).trim().toUpperCase() === String(expectedValue).trim().toUpperCase()
        );
    }

    const actualNumber = parseFiniteNumber(actualValue);
    const expectedNumber = parseFiniteNumber(expectedValue);
    if (actualNumber !== undefined && expectedNumber !== undefined) {
        return actualNumber === expectedNumber;
    }

    if (typeof actualValue === 'boolean' && typeof expectedValue === 'boolean') {
        return actualValue === expectedValue;
    }

    return actualValue === expectedValue;
}

export function matchesReconciliationGateDimensions(
    jobDimensions: Record<string, unknown> | undefined,
    requestedDimensions: Record<string, unknown>,
): boolean {
    if (Object.keys(requestedDimensions).length === 0) return true;

    const normalizedJobDimensions = extractScalarDimensions(jobDimensions);
    if (!normalizedJobDimensions) return true;

    for (const [key, expectedValue] of Object.entries(requestedDimensions)) {
        const actualValue = normalizedJobDimensions[key];
        if (actualValue === undefined || actualValue === null) continue;
        if (!isEquivalentDimensionValue(actualValue, expectedValue)) return false;
    }

    return true;
}

// ─── Idempotency / Keys ──────────────────────────────────────────────────────

export function buildCompensationSweepIdempotencyKey(slotMinutes: number): string {
    const safeSlotMinutes = Math.max(1, Math.min(60, slotMinutes));
    const slotMs = safeSlotMinutes * 60 * 1000;
    const slotStart = new Date(Math.floor(Date.now() / slotMs) * slotMs)
        .toISOString()
        .replace(/[:.]/g, '-');
    return `auto-compensation-${safeSlotMinutes}m-${slotStart}`;
}

export function buildCompensationBatchInFlightKey(
    userId: string,
    idempotencyKey: string,
): string {
    return `compensation-batch-in-flight:${userId}:${idempotencyKey}`;
}

// ─── Cutover helpers ─────────────────────────────────────────────────────────

export function recordHasCutoverDataset(
    record: ReconciliationCutoverExecutionRecord,
    datasets: StandardDataset[],
): boolean {
    if (datasets.length === 0) return true;
    return record.datasets.some((dataset) => datasets.includes(dataset));
}

export function isCutoverExecutionCompensationPending(
    record: ReconciliationCutoverExecutionRecord,
): boolean {
    return (
        (record.status === 'FAILED' || record.status === 'PARTIAL') &&
        record.compensationApplied !== true
    );
}

// ─── Async ───────────────────────────────────────────────────────────────────

export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new BadRequestException(message));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

export async function sleep(ms: number): Promise<void> {
    const duration = Math.max(0, ms);
    await new Promise<void>((resolve) => setTimeout(resolve, duration));
}

// ─── Error ───────────────────────────────────────────────────────────────────

export function stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function extractErrorCode(error: unknown): string {
    return typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
}

function hasMissingTableHint(message: string): boolean {
    return (
        message.includes('does not exist') ||
        message.includes('relation') ||
        message.includes('column') ||
        message.includes('undefined') ||
        message.includes('42703') ||
        message.includes('42704') ||
        message.includes('p2021')
    );
}

export function isReconciliationPersistenceMissingTableError(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2021') return true;

    const message = stringifyError(error).toLowerCase();
    const containsTable =
        message.includes('datareconciliationjob') || message.includes('datareconciliationdiff');
    const containsEnum = message.includes('reconcilejobstatus');
    const containsColumn = message.includes('summarypass');
    const containsRetryColumn =
        message.includes('retriedfromjobid') || message.includes('retrycount');
    const containsCancelColumn =
        message.includes('cancelledat') || message.includes('cancelreason');
    const missingHint =
        hasMissingTableHint(message) || message.includes('invalid input value for enum');
    return (
        (containsTable || containsEnum || containsColumn || containsRetryColumn || containsCancelColumn) &&
        missingHint
    );
}

export function isReconciliationDailyMetricsPersistenceMissingTableError(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2021') return true;

    const message = stringifyError(error).toLowerCase();
    return message.includes('datareconciliationdailymetric') && hasMissingTableHint(message);
}

export function isRollbackDrillPersistenceMissingTableError(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2021') return true;

    const message = stringifyError(error).toLowerCase();
    const containsTarget =
        message.includes('datareconciliationrollbackdrill') ||
        message.includes('reconciliationrollbackdrillstatus');
    const missingHint =
        hasMissingTableHint(message) || message.includes('invalid input value for enum');
    return containsTarget && missingHint;
}

export function isM1ReadinessReportPersistenceMissingTableError(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2021') return true;

    const message = stringifyError(error).toLowerCase();
    return message.includes('datareconciliationm1readinessreport') && hasMissingTableHint(message);
}

export function isCutoverDecisionPersistenceMissingTableError(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2021') return true;

    const message = stringifyError(error).toLowerCase();
    const containsTarget =
        message.includes('datareconciliationcutoverdecision') ||
        message.includes('reconciliationcutoverdecisionstatus');
    const missingHint =
        hasMissingTableHint(message) || message.includes('invalid input value for enum');
    return containsTarget && missingHint;
}

export function isCutoverExecutionPersistenceMissingTableError(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2021') return true;

    const message = stringifyError(error).toLowerCase();
    const containsTarget =
        message.includes('datareconciliationcutoverexecution') ||
        message.includes('reconciliationcutoverexecutionaction') ||
        message.includes('reconciliationcutoverexecutionstatus');
    const missingHint =
        hasMissingTableHint(message) || message.includes('invalid input value for enum');
    return containsTarget && missingHint;
}

export function isCutoverCompensationBatchPersistenceMissingTableError(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2021') return true;

    const message = stringifyError(error).toLowerCase();
    const containsTarget =
        message.includes('datareconciliationcutovercompensationbatch') ||
        message.includes('reconciliationcutovercompensationbatchstatus');
    const containsColumns =
        message.includes('idempotencykey') ||
        message.includes('replayed') ||
        message.includes('control') ||
        message.includes('disablereconciliationgate');
    const missingHint =
        hasMissingTableHint(message) || message.includes('invalid input value for enum');
    return (containsTarget || containsColumns) && missingHint;
}

export function isCutoverCompensationBatchIdempotencyConflict(error: unknown): boolean {
    if (extractErrorCode(error) === 'P2002') return true;

    const message = stringifyError(error).toLowerCase();
    return (
        (message.includes('duplicate key') ||
            message.includes('23505') ||
            message.includes('unique')) &&
        message.includes(
            'datareconciliationcutovercompensationbatch_requestedbyuserid_idempotencykey_key',
        )
    );
}

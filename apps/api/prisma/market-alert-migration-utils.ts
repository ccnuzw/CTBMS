export const ALERT_RULE_DOMAIN = 'MARKET_ALERT_RULE';

export const MARKET_ALERT_RULE_TYPES = [
    'DAY_CHANGE_ABS',
    'DAY_CHANGE_PCT',
    'DEVIATION_FROM_MEAN_PCT',
    'CONTINUOUS_DAYS',
] as const;
export type MarketAlertRuleType = (typeof MARKET_ALERT_RULE_TYPES)[number];

export const MARKET_ALERT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type MarketAlertSeverity = (typeof MARKET_ALERT_SEVERITIES)[number];

export const MARKET_ALERT_DIRECTIONS = ['UP', 'DOWN', 'BOTH'] as const;
export type MarketAlertDirection = (typeof MARKET_ALERT_DIRECTIONS)[number];

type LegacyRuleRow = {
    id: string;
    pattern: string;
    description: string | null;
    targetValue: string;
    priority: number;
    isActive: boolean;
};

type LegacyRulePayload = {
    name?: string;
    type?: string;
    threshold?: number | string;
    days?: number | string;
    direction?: string;
    severity?: string;
};

export type NormalizedAlertRule = {
    legacyRuleId: string;
    name: string;
    type: MarketAlertRuleType;
    threshold: number | null;
    days: number | null;
    direction: MarketAlertDirection;
    severity: MarketAlertSeverity;
    priority: number;
    isActive: boolean;
};

function parseJsonPayload(value: string): LegacyRulePayload | null {
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed as LegacyRulePayload;
    } catch {
        return null;
    }
}

function parsePositiveNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function parseContinuousDays(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 2) return null;
    return parsed;
}

function parseDirection(value: unknown): MarketAlertDirection {
    const text = String(value ?? '').toUpperCase();
    if (MARKET_ALERT_DIRECTIONS.includes(text as MarketAlertDirection)) {
        return text as MarketAlertDirection;
    }
    return 'BOTH';
}

function parseSeverity(value: unknown): MarketAlertSeverity {
    const text = String(value ?? '').toUpperCase();
    if (MARKET_ALERT_SEVERITIES.includes(text as MarketAlertSeverity)) {
        return text as MarketAlertSeverity;
    }
    return 'MEDIUM';
}

function parseType(value: unknown): MarketAlertRuleType | null {
    const text = String(value ?? '').toUpperCase();
    if (MARKET_ALERT_RULE_TYPES.includes(text as MarketAlertRuleType)) {
        return text as MarketAlertRuleType;
    }
    return null;
}

export function normalizeLegacyAlertRule(row: LegacyRuleRow): {
    ok: true;
    value: NormalizedAlertRule;
} | {
    ok: false;
    error: string;
} {
    const payload = parseJsonPayload(row.targetValue);
    const type = parseType(payload?.type ?? row.pattern);
    if (!type) {
        return { ok: false, error: `invalid type: ${payload?.type ?? row.pattern}` };
    }

    const threshold = parsePositiveNumber(payload?.threshold);
    const days = parseContinuousDays(payload?.days);
    if (type === 'CONTINUOUS_DAYS') {
        if (days === null) {
            return { ok: false, error: 'CONTINUOUS_DAYS requires integer days >= 2' };
        }
    } else if (threshold === null) {
        return { ok: false, error: `${type} requires threshold > 0` };
    }

    const displayName = String(payload?.name ?? row.description ?? '').trim();
    const name = displayName || `预警规则-${row.id.slice(0, 8)}`;

    return {
        ok: true,
        value: {
            legacyRuleId: row.id,
            name,
            type,
            threshold: type === 'CONTINUOUS_DAYS' ? null : threshold,
            days: type === 'CONTINUOUS_DAYS' ? days : null,
            direction: parseDirection(payload?.direction),
            severity: parseSeverity(payload?.severity),
            priority: Number.isFinite(row.priority) ? row.priority : 0,
            isActive: Boolean(row.isActive),
        },
    };
}

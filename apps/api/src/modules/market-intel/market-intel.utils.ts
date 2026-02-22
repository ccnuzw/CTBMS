import { ContentType as PrismaContentType, IntelSourceType as PrismaIntelSourceType, PriceSubType } from '@prisma/client';

export const LEGACY_PRICE_SUBTYPE_TO_CANONICAL: Record<string, PriceSubType> = {
    STATION_ORIGIN: PriceSubType.STATION,
    STATION_DEST: PriceSubType.STATION,
};

export function resolveIntelSourceTypes(values?: string[]) {
    if (!values) return [];
    return values.filter((value): value is PrismaIntelSourceType =>
        Object.values(PrismaIntelSourceType).includes(value as PrismaIntelSourceType),
    );
}

export function resolveContentTypes(values?: string[]) {
    if (!values) return [];
    return values.filter((value): value is PrismaContentType =>
        Object.values(PrismaContentType).includes(value as PrismaContentType),
    );
}

export function normalizePriceSubType(value?: string | null) {
    if (!value) return null;
    const normalized = value.trim().toUpperCase();
    if (!normalized) return null;
    if (LEGACY_PRICE_SUBTYPE_TO_CANONICAL[normalized]) {
        return LEGACY_PRICE_SUBTYPE_TO_CANONICAL[normalized];
    }
    if (Object.values(PriceSubType).includes(normalized as PriceSubType)) {
        return normalized as PriceSubType;
    }
    return null;
}

export function normalizeHotTopic(topic: string) {
    return topic.replace(/^#/, '').trim();
}

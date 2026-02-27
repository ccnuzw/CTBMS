/**
 * ConversationUtilsService
 *
 * Pure utility/normalization functions extracted from AgentConversationService.
 * Stateless — no DB access, no side effects.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SlotMap, ReplyOption } from './conversation.types';

@Injectable()
export class ConversationUtilsService {
    // ── JSON / Type Coercion ─────────────────────────────────────────────────

    toJson(value: unknown): Prisma.InputJsonValue | undefined {
        if (value === undefined) {
            return undefined;
        }
        return value as Prisma.InputJsonValue;
    }

    toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    toArray(value: unknown): unknown[] {
        return Array.isArray(value) ? value : [];
    }

    pickString(value: unknown): string | null {
        if (typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    isUuid(value: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }

    // ── Slot Normalization ───────────────────────────────────────────────────

    normalizeSlots(raw: unknown): SlotMap {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {};
        }
        return raw as SlotMap;
    }

    mergeSlots(...slots: Array<SlotMap | Record<string, unknown> | undefined>): SlotMap {
        const merged: SlotMap = {};
        for (const item of slots) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                continue;
            }
            Object.assign(merged, item);
        }
        return merged;
    }

    isSlotMissing(value: unknown): boolean {
        if (value === null || value === undefined) {
            return true;
        }
        if (typeof value === 'string') {
            return value.trim().length === 0;
        }
        if (Array.isArray(value)) {
            return value.length === 0;
        }
        return false;
    }

    // ── Execution Status ─────────────────────────────────────────────────────

    mapExecutionStatus(status: string): 'EXECUTING' | 'DONE' | 'FAILED' {
        if (status === 'SUCCESS') {
            return 'DONE';
        }
        if (status === 'FAILED' || status === 'CANCELED') {
            return 'FAILED';
        }
        return 'EXECUTING';
    }

    // ── Result Normalization ─────────────────────────────────────────────────

    normalizeResult(outputRecord: Record<string, unknown>) {
        const facts = this.normalizeFacts(outputRecord.facts);
        const analysis = this.pickString(outputRecord.analysis) ?? this.pickString(outputRecord.summary) ?? '';
        const actions = this.normalizeActions(outputRecord.actions);
        const confidence = this.normalizeNumber(outputRecord.confidence);
        const dataTimestamp = this.pickString(outputRecord.dataTimestamp) ?? new Date().toISOString();

        return {
            facts,
            analysis,
            actions,
            confidence,
            dataTimestamp,
        };
    }

    normalizeFacts(value: unknown): Array<{ text: string; citations: Array<Record<string, unknown>> }> {
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .map((item) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) {
                    return null;
                }
                const row = item as Record<string, unknown>;
                const text = this.pickString(row.text) ?? '';
                const citations = Array.isArray(row.citations)
                    ? row.citations.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
                    : [];
                if (!text) {
                    return null;
                }
                return {
                    text,
                    citations: citations as Array<Record<string, unknown>>,
                };
            })
            .filter((item): item is { text: string; citations: Array<Record<string, unknown>> } => Boolean(item));
    }

    normalizeActions(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {
                spot: [],
                futures: [],
                riskDisclosure: '建议仅供参考，请结合业务实际与风控要求审慎执行。',
            };
        }
        const record = value as Record<string, unknown>;
        return {
            ...record,
            riskDisclosure:
                this.pickString(record.riskDisclosure) ??
                '建议仅供参考，请结合业务实际与风控要求审慎执行。',
        };
    }

    normalizeNumber(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return 0;
    }

    // ── JSON Parsing ─────────────────────────────────────────────────────────

    parseJsonObject(value: string): Record<string, unknown> | null {
        const text = value.trim();
        if (!text) {
            return null;
        }
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            return null;
        } catch {
            const block = text.match(/\{[\s\S]*\}/);
            if (!block) {
                return null;
            }
            try {
                const parsed = JSON.parse(block[0]);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed as Record<string, unknown>;
                }
            } catch {
                return null;
            }
            return null;
        }
    }

    // ── Reply Options Normalization ──────────────────────────────────────────

    normalizeReplyOptions(raw: unknown, fallback: ReplyOption[]): ReplyOption[] {
        if (!Array.isArray(raw)) {
            return fallback;
        }

        const normalized = raw
            .map((item) => this.toRecord(item))
            .map((item, index) => {
                const mode = this.pickString(item.mode);
                const normalizedMode = mode === 'OPEN_TAB' ? 'OPEN_TAB' : 'SEND';
                const label = this.pickString(item.label) ?? '';
                const tabRaw = this.pickString(item.tab);
                const tab =
                    tabRaw === 'progress' || tabRaw === 'result' || tabRaw === 'delivery' || tabRaw === 'schedule'
                        ? (tabRaw as 'progress' | 'result' | 'delivery' | 'schedule')
                        : undefined;
                return {
                    id: this.pickString(item.id) ?? `llm_option_${index + 1}`,
                    label,
                    mode: normalizedMode as 'SEND' | 'OPEN_TAB',
                    value: this.pickString(item.value) ?? undefined,
                    tab,
                };
            })
            .filter((item) => item.label)
            .slice(0, 4);

        return normalized.length ? normalized : fallback;
    }
}

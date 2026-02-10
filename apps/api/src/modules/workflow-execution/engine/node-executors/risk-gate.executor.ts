import { Injectable } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
type DegradeAction = 'HOLD' | 'REDUCE' | 'REVIEW_ONLY';

const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    EXTREME: 4,
};

@Injectable()
export class RiskGateNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'RiskGateNodeExecutor';

    supports(node: WorkflowNode): boolean {
        return node.type === 'risk-gate';
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = context.node.config as Record<string, unknown>;
        const riskProfileCode = typeof config.riskProfileCode === 'string'
            ? config.riskProfileCode.trim()
            : '';
        if (!riskProfileCode) {
            throw new Error('risk-gate 节点缺少 riskProfileCode 配置');
        }

        const riskLevel = this.resolveRiskLevel(context.input);
        const blockerRules = this.readBlockerRules(config.blockerRules);
        const blockerHits = blockerRules.filter((fieldPath) =>
            this.hasBlockingSignal(this.readValueByPath(context.input, fieldPath)),
        );
        const threshold = this.resolveBlockThreshold(config, context.paramSnapshot);
        const degradeAction = this.parseDegradeAction(config.degradeAction) ?? 'HOLD';
        const hardBlock = config.hardBlock === true;

        const blockedByRiskLevel = RISK_LEVEL_ORDER[riskLevel] >= RISK_LEVEL_ORDER[threshold];
        const blocked = blockedByRiskLevel || blockerHits.length > 0;
        const reasonSegments: string[] = [];
        if (blockedByRiskLevel) {
            reasonSegments.push(`riskLevel=${riskLevel} 达到阻断阈值 ${threshold}`);
        }
        if (blockerHits.length > 0) {
            reasonSegments.push(`命中 blockerRules: ${blockerHits.join(', ')}`);
        }
        const blockReason = blocked ? reasonSegments.join('；') : '';
        const status = blocked && hardBlock ? 'FAILED' : 'SUCCESS';
        const message = status === 'FAILED'
            ? `风险闸门阻断：${blockReason || '命中阻断条件'}`
            : undefined;
        const baseMeta = this.readMeta(context.input);

        return {
            status,
            message,
            output: {
                ...context.input,
                summarySchemaVersion: '1.0',
                riskLevel,
                riskGatePassed: !blocked,
                riskGateBlocked: blocked,
                blockers: blockerHits,
                blockerCount: blockerHits.length,
                blockReason: blockReason || null,
                degradeAction: blocked ? degradeAction : null,
                riskProfileCode,
                threshold,
                blockedByRiskLevel,
                hardBlock,
                riskGateNodeId: context.node.id,
                riskEvaluatedAt: new Date().toISOString(),
                _meta: {
                    ...baseMeta,
                    riskGate: {
                        riskProfileCode,
                        riskLevel,
                        threshold,
                        blockedByRiskLevel,
                        blockerHits,
                        hardBlock,
                    },
                },
            },
        };
    }

    private readBlockerRules(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
    }

    private readMeta(input: Record<string, unknown>): Record<string, unknown> {
        const meta = input._meta;
        if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
            return {};
        }
        return meta as Record<string, unknown>;
    }

    private resolveRiskLevel(input: Record<string, unknown>): RiskLevel {
        const directRiskLevel = this.parseRiskLevel(input.riskLevel);
        if (directRiskLevel) {
            return directRiskLevel;
        }

        const riskObject = input.risk;
        if (riskObject && typeof riskObject === 'object' && !Array.isArray(riskObject)) {
            const nestedRiskLevel = this.parseRiskLevel(
                (riskObject as Record<string, unknown>).level,
            );
            if (nestedRiskLevel) {
                return nestedRiskLevel;
            }
        }

        const hitScore = this.readNumber(input.hitScore)
            ?? this.readNumber(input.confidence)
            ?? this.readNumber(input.score);
        if (hitScore === null) {
            return 'MEDIUM';
        }

        if (hitScore >= 80) {
            return 'LOW';
        }
        if (hitScore >= 60) {
            return 'MEDIUM';
        }
        if (hitScore >= 40) {
            return 'HIGH';
        }
        return 'EXTREME';
    }

    private parseRiskLevel(value: unknown): RiskLevel | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return this.parseRiskLevelFromNumber(value);
        }
        if (typeof value !== 'string') {
            return null;
        }
        const normalized = value.trim().toUpperCase();
        if (
            normalized === 'LOW'
            || normalized === 'MEDIUM'
            || normalized === 'HIGH'
            || normalized === 'EXTREME'
        ) {
            return normalized;
        }
        if (normalized === 'L') {
            return 'LOW';
        }
        if (normalized === 'M') {
            return 'MEDIUM';
        }
        if (normalized === 'H') {
            return 'HIGH';
        }
        if (normalized === 'E') {
            return 'EXTREME';
        }
        if (normalized === '低') {
            return 'LOW';
        }
        if (normalized === '中') {
            return 'MEDIUM';
        }
        if (normalized === '高') {
            return 'HIGH';
        }
        if (normalized === '极高') {
            return 'EXTREME';
        }

        const asNumber = Number(normalized);
        if (Number.isFinite(asNumber)) {
            return this.parseRiskLevelFromNumber(asNumber);
        }
        return null;
    }

    private parseRiskLevelFromNumber(value: number): RiskLevel {
        const normalized = Math.round(value);
        if (normalized <= 1) {
            return 'LOW';
        }
        if (normalized <= 2) {
            return 'MEDIUM';
        }
        if (normalized <= 3) {
            return 'HIGH';
        }
        return 'EXTREME';
    }

    private resolveBlockThreshold(
        config: Record<string, unknown>,
        paramSnapshot?: Record<string, unknown>,
    ): RiskLevel {
        const configThreshold = this.parseRiskLevel(config.blockWhenRiskGte);
        if (configThreshold) {
            return configThreshold;
        }

        const candidateKeys = this.buildThresholdCandidateKeys(config);
        const snapshotThreshold = this.readRiskLevelFromParamSnapshot(paramSnapshot, candidateKeys);
        if (snapshotThreshold) {
            return snapshotThreshold;
        }

        return 'HIGH';
    }

    private buildThresholdCandidateKeys(config: Record<string, unknown>): string[] {
        const dynamicKeys = [
            config.thresholdParamCode,
            config.thresholdParamPath,
            config.blockThresholdParamCode,
            config.blockThresholdParamPath,
        ]
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean);
        const fallbackKeys = [
            'SIGNAL_BLOCK_RISK_GTE',
            'RISK_GATE_BLOCK_WHEN_GTE',
            'RISK_BLOCK_LEVEL',
            'risk.blockWhenGte',
        ];

        return Array.from(new Set([...dynamicKeys, ...fallbackKeys]));
    }

    private readRiskLevelFromParamSnapshot(
        paramSnapshot: Record<string, unknown> | undefined,
        candidateKeys: string[],
    ): RiskLevel | null {
        if (!paramSnapshot || candidateKeys.length === 0) {
            return null;
        }

        const containers = [
            paramSnapshot,
            this.readObject(paramSnapshot.params),
            this.readObject(paramSnapshot.parameters),
            this.readObject(paramSnapshot.values),
            this.readObject(paramSnapshot.resolvedParams),
        ].filter((value): value is Record<string, unknown> => Boolean(value));

        for (const key of candidateKeys) {
            for (const container of containers) {
                const rawValue = key.includes('.')
                    ? this.readValueByPath(container, key)
                    : container[key];
                const normalizedValue = this.unwrapParamValue(rawValue);
                const parsed = this.parseRiskLevel(normalizedValue);
                if (parsed) {
                    return parsed;
                }
            }
        }

        return null;
    }

    private parseDegradeAction(value: unknown): DegradeAction | null {
        if (typeof value !== 'string') {
            return null;
        }
        const normalized = value.trim().toUpperCase();
        if (normalized === 'HOLD' || normalized === 'REDUCE' || normalized === 'REVIEW_ONLY') {
            return normalized;
        }
        return null;
    }

    private hasBlockingSignal(value: unknown): boolean {
        if (value === null || value === undefined) {
            return false;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            return Number.isFinite(value) && value > 0;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (!normalized || normalized === 'false' || normalized === '0' || normalized === 'none') {
                return false;
            }
            return true;
        }
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        return true;
    }

    private readObject(value: unknown): Record<string, unknown> | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return null;
        }
        return value as Record<string, unknown>;
    }

    private unwrapParamValue(value: unknown): unknown {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return value;
        }

        const record = value as Record<string, unknown>;
        if (record.value !== undefined) {
            return record.value;
        }
        if (record.currentValue !== undefined) {
            return record.currentValue;
        }
        if (record.effectiveValue !== undefined) {
            return record.effectiveValue;
        }
        return value;
    }

    private readValueByPath(input: Record<string, unknown>, path: string): unknown {
        if (!path) {
            return undefined;
        }

        const segments = path
            .replace(/\[(\d+)\]/g, '.$1')
            .split('.')
            .map((segment) => segment.trim())
            .filter(Boolean);

        let current: unknown = input;
        for (const segment of segments) {
            if (current === null || current === undefined) {
                return undefined;
            }
            if (Array.isArray(current)) {
                const index = Number(segment);
                if (!Number.isInteger(index) || index < 0 || index >= current.length) {
                    return undefined;
                }
                current = current[index];
                continue;
            }
            if (typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[segment];
        }
        return current;
    }

    private readNumber(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return null;
    }
}

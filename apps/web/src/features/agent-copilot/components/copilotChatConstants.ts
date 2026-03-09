// ─── CopilotChatView 常量与工具函数 ─────────────────────────────────────────
// 提取自 CopilotChatView.tsx，减少组件文件体积

import React from 'react';
import {
    BarChartOutlined,
    LineChartOutlined,
    NodeIndexOutlined,
    RobotOutlined,
    SafetyOutlined,
} from '@ant-design/icons';
import type {
    ConversationEvidenceItem,
    ConversationFreshnessStatus,
    ConversationResultConfidenceGate,
    ConversationResultQualityBreakdown,
    ConversationResultTraceability,
} from '../api/conversations';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CopilotChatViewProps {
    isAdminUser: boolean;
    onSwitchToAdmin?: () => void;
}

export type LocalConversationTurn = {
    id: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    content: string;
    structuredPayload?: Record<string, unknown>;
    createdAt: string;
    pending?: boolean;
    failed?: boolean;
};

// ─── 场景卡片 ───────────────────────────────────────────────────────────────

export const scenarioCards = [
    {
        key: 'weekly-review',
        icon: React.createElement(BarChartOutlined, { style: { fontSize: 28, color: '#1677ff' } }),
        title: '看本周玉米行情',
        description: '结合产区、港口和销区情况，快速总结本周内贸玉米变化',
        prompt: '请结合产区上量、港口库存、销区到货和成交情况，帮我总结过去一周内贸玉米行情变化并提示风险。',
    },
    {
        key: 'forecast-3m',
        icon: React.createElement(LineChartOutlined, { style: { fontSize: 28, color: '#52c41a' } }),
        title: '看短期走势',
        description: '分析近期内贸玉米走势，给出未来一段时间判断',
        prompt: '请分析最近一周内贸玉米价格走势，并结合供应、需求和库存判断未来一个月的方向。',
    },
    {
        key: 'risk-scan',
        icon: React.createElement(SafetyOutlined, { style: { fontSize: 28, color: '#fa8c16' } }),
        title: '查采购风险',
        description: '围绕采购、库存和价格波动整理预警与建议',
        prompt: '请从采购节奏、库存水平和价格波动三个角度，帮我扫描当前内贸玉米业务风险并给出建议。',
    },
    {
        key: 'compare-week',
        icon: React.createElement(RobotOutlined, { style: { fontSize: 28, color: '#722ed1' } }),
        title: '对比上周变化',
        description: '快速看懂本周和上周内贸玉米市场哪里变了',
        prompt: '请对比本周和上周的内贸玉米市场变化，重点说明价格、上量、库存和成交的差异。',
    },
    {
        key: 'generate-report',
        icon: React.createElement(NodeIndexOutlined, { style: { fontSize: 28, color: '#13c2c2' } }),
        title: '生成玉米汇报',
        description: '把当前内贸玉米分析整理成可直接转发的汇报内容',
        prompt: '请基于当前内贸玉米市场情况整理一份适合发给同事的简明汇报。',
    },
];

// ─── 术语映射 ─────────────────────────────────────────────────────────────

export const userFriendlyStatusText: Record<string, string> = {
    INTENT_CAPTURE: '等你开问',
    SLOT_FILLING: '还差一点信息',
    PLAN_PREVIEW: '马上可以看结果',
    USER_CONFIRM: '马上可以看结果',
    EXECUTING: '正在帮你分析...',
    RESULT_DELIVERY: '正在整理结论...',
    DONE: '结果已经好了',
    FAILED: '这次分析没跑通',
};

export const slotLabelMap: Record<string, string> = {
    timeRange: '时间段',
    region: '地区',
    outputFormat: '输出格式',
    topic: '关注主题',
};

// ─── 智能追问建议 ────────────────────────────────────────────────────────

export const getSmartSuggestions = (
    status: string,
    hasResult: boolean,
): Array<{ id: string; label: string; value: string }> => {
    if (status === 'DONE' && hasResult) {
        return [
            { id: 'send_email', label: '发到邮箱', value: '请把这份内贸玉米分析结果发到我的邮箱' },
            { id: 'compare', label: '对比上周', value: '请对比上周同期内贸玉米数据，看看有什么变化' },
            { id: 'backtest', label: '回测验证', value: '请用历史内贸玉米数据回测验证这个分析结论' },
            { id: 'rerun', label: '重看采购节奏', value: '请重点从采购节奏和库存角度重新分析一次' },
            { id: 'schedule', label: '设为周一更新', value: '每周一早上8点自动更新这份内贸玉米分析' },
        ];
    }
    if (status === 'FAILED') {
        return [
            { id: 'retry', label: '重新分析', value: '请重新分析当前内贸玉米行情' },
            { id: 'retry_narrow', label: '只看东北产区', value: '请只分析东北产区的内贸玉米行情' },
            { id: 'retry_diff', label: '换个角度试试', value: '请从港口库存和下游需求角度重新分析' },
        ];
    }
    return [];
};

// ─── 置信度渲染 ──────────────────────────────────────────────────────────

export const confidenceConfig = (pct: number) => {
    if (pct >= 80) return { color: '#52c41a', label: '结论可靠性：高' } as const;
    if (pct >= 50) return { color: '#fa8c16', label: '结论可靠性：中' } as const;
    return { color: '#cf1322', label: '仅供参考' } as const;
};

export const qualityConfig = (pct: number) => {
    if (pct >= 80) return { color: '#1677ff', label: '数据质量：高' } as const;
    if (pct >= 60) return { color: '#fa8c16', label: '数据质量：中' } as const;
    return { color: '#cf1322', label: '数据质量：低' } as const;
};

export const resultFreshnessLabel: Record<ConversationFreshnessStatus, string> = {
    WITHIN_TTL: '时效正常',
    NEAR_EXPIRE: '临近过期',
    EXPIRED: '时效过期',
    UNKNOWN: '时效未知',
};

export const resultFreshnessColor: Record<ConversationFreshnessStatus, string> = {
    WITHIN_TTL: 'green',
    NEAR_EXPIRE: 'orange',
    EXPIRED: 'red',
    UNKNOWN: 'default',
};

export const evidenceFreshnessLabel: Record<'FRESH' | 'STALE' | 'UNKNOWN', string> = {
    FRESH: '新鲜',
    STALE: '滞后',
    UNKNOWN: '未知',
};

export const evidenceFreshnessColor: Record<'FRESH' | 'STALE' | 'UNKNOWN', string> = {
    FRESH: 'green',
    STALE: 'orange',
    UNKNOWN: 'default',
};

export const evidenceQualityLabel: Record<
    'RECONCILED' | 'INTERNAL' | 'EXTERNAL' | 'UNVERIFIED',
    string
> = {
    RECONCILED: '已对账',
    INTERNAL: '内部',
    EXTERNAL: '外部',
    UNVERIFIED: '待核验',
};

export const evidenceQualityColor: Record<
    'RECONCILED' | 'INTERNAL' | 'EXTERNAL' | 'UNVERIFIED',
    string
> = {
    RECONCILED: 'blue',
    INTERNAL: 'geekblue',
    EXTERNAL: 'purple',
    UNVERIFIED: 'default',
};

// ─── 快捷短语 ─────────────────────────────────────────────────────────────

export const getQuickPhrases = (
    status: string,
    hasResult: boolean,
    hasNoSession: boolean,
): string[] => {
    if (hasNoSession || status === 'INTENT_CAPTURE') {
        return ['东北玉米价格走势', '港口库存变化', '深加工采购情况', '生成玉米日报'];
    }
    if (status === 'DONE' && hasResult) {
        return ['导出玉米报告', '发到邮箱', '回测验证', '对比上周变化', '设为周一更新'];
    }
    if (status === 'FAILED') {
        return ['重新分析玉米行情', '只看东北产区', '看港口和库存'];
    }
    if (status === 'SLOT_FILLING') {
        return ['最近一周', '东北产区', '北方港口'];
    }
    return [];
};

// ─── 会话分组 ────────────────────────────────────────────────────────────────

export const groupSessionsByDate = <T extends { updatedAt: string }>(
    sessions: T[],
): Array<{ label: string; items: T[] }> => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekStart = today - now.getDay() * 86400000;

    const groups: Record<string, T[]> = { 今天: [], 昨天: [], 本周: [], 更早: [] };
    for (const s of sessions) {
        const t = new Date(s.updatedAt).getTime();
        if (t >= today) groups['今天'].push(s);
        else if (t >= yesterday) groups['昨天'].push(s);
        else if (t >= weekStart) groups['本周'].push(s);
        else groups['更早'].push(s);
    }
    return Object.entries(groups)
        .filter(([, items]) => items.length > 0)
        .map(([label, items]) => ({ label, items }));
};

// ─── 时间分隔 ────────────────────────────────────────────────────────────────

export const shouldShowTimeSeparator = (prev: string | undefined, curr: string): boolean => {
    if (!prev) return true;
    return new Date(curr).getTime() - new Date(prev).getTime() > 5 * 60 * 1000;
};

export const formatTurnTime = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// ─── CSS 动画 ─────────────────────────────────────────────────────────────────

export const animationStyles = `
@keyframes copilot-slide-in-left {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes copilot-slide-in-right {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes copilot-scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes copilot-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.copilot-msg-left  { animation: copilot-slide-in-left 0.2s ease-out; }
.copilot-msg-right { animation: copilot-slide-in-right 0.2s ease-out; }
.copilot-card-in   { animation: copilot-scale-in 0.25s ease-out; }
.copilot-typing-cursor::after {
  content: '▍';
  animation: copilot-cursor-blink 0.8s steps(2) infinite;
  color: #1677ff;
}
.copilot-markdown p { margin: 0 0 0.4em; }
.copilot-markdown table { font-size: 13px; border-collapse: collapse; }
.copilot-markdown th, .copilot-markdown td { border: 1px solid #e8e8e8; padding: 4px 8px; }
.copilot-markdown pre { background: #f6f8fa; padding: 8px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
.copilot-markdown code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
.copilot-markdown pre code { background: none; padding: 0; }
`;

// ─── 常量 ─────────────────────────────────────────────────────────────────

export const DEFAULT_VISIBLE_TURN_COUNT = 30;
export const LOAD_MORE_TURN_STEP = 20;
export const ASSISTANT_COLLAPSE_THRESHOLD = 500;

// ─── 工具函数 ─────────────────────────────────────────────────────────────

export const toSafeText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
        return String(value);
    if (value === null || value === undefined) return '';
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

export const extractFirstParagraph = (text: string): string => {
    const cleaned = text.trim();
    const lines = cleaned.split('\n').map((l) => l.trim());
    const firstContentLine = lines.find(
        (l) => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('```'),
    );
    return firstContentLine || lines[0] || '助手已生成回复。';
};

// ─── 结果数据解析映射 ─────────────────────────────────────────────────────

export const actionCodeMap: Record<string, string> = {
    REDUCE: '减仓',
    INCREASE: '加仓',
    HOLD: '持有观望',
    BUY: '买入',
    SELL: '卖出',
    HEDGE: '对冲',
    STOP_LOSS: '止损',
    TAKE_PROFIT: '止盈',
    WATCH: '关注',
    WAIT: '等待信号',
    ACCUMULATE: '逐步建仓',
    LIQUIDATE: '清仓',
};

export const keyNameMap: Record<string, string> = {
    riskLevel: '风险等级',
    targetPrice: '目标价格',
    targetWindow: '目标窗口',
    stopLoss: '止损位',
    takeProfit: '止盈位',
    positionSize: '仓位建议',
    timeframe: '时间框架',
    confidence: '置信度',
    direction: '方向',
    strategy: '策略',
    hedgeRatio: '对冲比例',
    entryPoint: '入场点',
    exitPoint: '出场点',
};

export const riskLevelMap: Record<string, string> = {
    HIGH: '高',
    MEDIUM: '中',
    LOW: '低',
    CRITICAL: '极高',
};

export const translateAction = (code: string): string => actionCodeMap[code] ?? code;
export const translateKey = (key: string): string => keyNameMap[key] ?? key;
export const translateValue = (key: string, value: string): string => {
    if (key === 'riskLevel') return riskLevelMap[value] ?? value;
    return actionCodeMap[value] ?? value;
};

// ─── 结果数据解析 ─────────────────────────────────────────────────────────

export interface ParsedResultData {
    confidence: number | null;
    qualityScore: number | null;
    freshnessStatus: ConversationFreshnessStatus;
    qualityBreakdown: ConversationResultQualityBreakdown | null;
    confidenceGate: ConversationResultConfidenceGate | null;
    conclusion: string | null;
    actions: string[];
    evidenceItems: ConversationEvidenceItem[];
    traceability: ConversationResultTraceability | null;
}

export const parseResultData = (
    raw: Record<string, unknown> | null | undefined,
): ParsedResultData | null => {
    if (!raw) return null;

    const confidenceRaw = typeof raw.confidence === 'number' ? raw.confidence : null;
    const confidence = confidenceRaw !== null ? Math.round(confidenceRaw * 100) : null;
    const qualityRaw = typeof raw.qualityScore === 'number' ? raw.qualityScore : null;
    const normalizedQuality =
        qualityRaw === null ? null : qualityRaw > 1 ? qualityRaw / 100 : qualityRaw;
    const qualityScore =
        normalizedQuality === null
            ? null
            : Math.round(Math.max(0, Math.min(1, normalizedQuality)) * 100);

    const conclusion =
        typeof raw.conclusion === 'string'
            ? raw.conclusion
            : typeof raw.analysis === 'string'
                ? raw.analysis
                : null;

    const actionTexts: string[] = [];

    if (Array.isArray(raw.actions)) {
        for (const action of raw.actions as Array<Record<string, unknown>>) {
            if (typeof action === 'string') {
                actionTexts.push(translateAction(action));
                continue;
            }
            if (typeof action?.text === 'string') {
                actionTexts.push(translateAction(action.text));
                continue;
            }
            if (typeof action?.label === 'string') {
                actionTexts.push(translateAction(action.label));
                continue;
            }
            actionTexts.push(toSafeText(action));
        }
    } else if (raw.actions && typeof raw.actions === 'object') {
        const actionRecord = raw.actions as Record<string, unknown>;
        const preferredAction =
            typeof actionRecord.recommendedAction === 'string' ? actionRecord.recommendedAction : null;
        if (preferredAction) {
            actionTexts.push(`建议动作：${translateAction(preferredAction)}`);
        }

        for (const [key, value] of Object.entries(actionRecord)) {
            if (key === 'riskDisclosure' || key === 'recommendedAction') {
                continue;
            }
            if (typeof value === 'string' && value.trim()) {
                actionTexts.push(`${translateKey(key)}: ${translateValue(key, value)}`);
                continue;
            }
            if (Array.isArray(value)) {
                for (const entry of value) {
                    if (typeof entry === 'string' && entry.trim()) {
                        actionTexts.push(translateAction(entry));
                    }
                }
            }
        }
    }

    const traceabilityRaw =
        raw.traceability && typeof raw.traceability === 'object' && !Array.isArray(raw.traceability)
            ? (raw.traceability as Record<string, unknown>)
            : null;

    const traceability: ConversationResultTraceability | null = traceabilityRaw
        ? {
            executionId: toSafeText(traceabilityRaw.executionId),
            replayPath: toSafeText(traceabilityRaw.replayPath),
            executionPath: toSafeText(traceabilityRaw.executionPath),
            evidenceCount: Number(traceabilityRaw.evidenceCount ?? 0) || 0,
            strongEvidenceCount: Number(traceabilityRaw.strongEvidenceCount ?? 0) || 0,
            externalEvidenceCount: Number(traceabilityRaw.externalEvidenceCount ?? 0) || 0,
            generatedAt: toSafeText(traceabilityRaw.generatedAt),
        }
        : null;

    const freshnessCandidate = toSafeText(raw.freshnessStatus).toUpperCase();
    const freshnessStatus: ConversationFreshnessStatus =
        freshnessCandidate === 'WITHIN_TTL' ||
            freshnessCandidate === 'NEAR_EXPIRE' ||
            freshnessCandidate === 'EXPIRED'
            ? (freshnessCandidate as ConversationFreshnessStatus)
            : 'UNKNOWN';

    const qualityBreakdownRaw =
        raw.qualityBreakdown &&
            typeof raw.qualityBreakdown === 'object' &&
            !Array.isArray(raw.qualityBreakdown)
            ? (raw.qualityBreakdown as Record<string, unknown>)
            : null;
    const qualityBreakdown: ConversationResultQualityBreakdown | null = qualityBreakdownRaw
        ? {
            completeness: Number(qualityBreakdownRaw.completeness ?? 0) || 0,
            timeliness: Number(qualityBreakdownRaw.timeliness ?? 0) || 0,
            evidenceStrength: Number(qualityBreakdownRaw.evidenceStrength ?? 0) || 0,
            verification: Number(qualityBreakdownRaw.verification ?? 0) || 0,
        }
        : null;

    const confidenceGateRaw =
        raw.confidenceGate &&
            typeof raw.confidenceGate === 'object' &&
            !Array.isArray(raw.confidenceGate)
            ? (raw.confidenceGate as Record<string, unknown>)
            : null;
    const confidenceGate: ConversationResultConfidenceGate | null = confidenceGateRaw
        ? {
            allowStrongConclusion: Boolean(confidenceGateRaw.allowStrongConclusion),
            reasonCodes: Array.isArray(confidenceGateRaw.reasonCodes)
                ? confidenceGateRaw.reasonCodes
                    .map((item: unknown) => toSafeText(item))
                    .filter((item: string) => Boolean(item))
                : [],
            message: toSafeText(confidenceGateRaw.message) || '结论已降级，请人工复核。',
        }
        : null;

    const evidenceItemsRaw = Array.isArray(raw.evidenceItems)
        ? raw.evidenceItems
        : ([] as Array<Record<string, unknown>>);

    const evidenceItems = evidenceItemsRaw.reduce<ConversationEvidenceItem[]>(
        (acc, item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return acc;
            }
            const row = item as Record<string, unknown>;
            const fCandidate = toSafeText(row.freshness).toUpperCase();
            const freshness: ConversationEvidenceItem['freshness'] =
                fCandidate === 'FRESH' || fCandidate === 'STALE'
                    ? (fCandidate as 'FRESH' | 'STALE')
                    : 'UNKNOWN';
            const qCandidate = toSafeText(row.quality).toUpperCase();
            const quality: ConversationEvidenceItem['quality'] =
                qCandidate === 'RECONCILED' || qCandidate === 'INTERNAL' || qCandidate === 'EXTERNAL'
                    ? (qCandidate as 'RECONCILED' | 'INTERNAL' | 'EXTERNAL')
                    : 'UNVERIFIED';
            acc.push({
                id: typeof row.id === 'string' && row.id ? row.id : `evidence_${index}`,
                title: toSafeText(row.title) || `证据 ${index + 1}`,
                summary: toSafeText(row.summary) || '无摘要',
                source: toSafeText(row.source) || 'unknown',
                sourceNodeId: typeof row.sourceNodeId === 'string' ? row.sourceNodeId : null,
                sourceNodeType: typeof row.sourceNodeType === 'string' ? row.sourceNodeType : null,
                sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : null,
                tracePath: typeof row.tracePath === 'string' ? row.tracePath : null,
                collectedAt:
                    typeof row.collectedAt === 'string' && row.collectedAt
                        ? row.collectedAt
                        : new Date().toISOString(),
                timestamp: typeof row.timestamp === 'string' && row.timestamp ? row.timestamp : null,
                freshness,
                quality,
            });
            return acc;
        },
        [],
    );

    const dedupedActions = [...new Set(actionTexts.filter((item) => item.trim()))];

    return {
        confidence,
        qualityScore,
        freshnessStatus,
        qualityBreakdown,
        confidenceGate,
        conclusion,
        actions: dedupedActions.slice(0, 6),
        evidenceItems,
        traceability,
    };
};

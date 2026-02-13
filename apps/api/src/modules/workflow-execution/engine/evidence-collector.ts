import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';

/**
 * 证据条目 — 对应设计方案 9.2 统一输出对象中的 evidence[]
 *
 * 必须同时包含原文片段、指标快照、规则命中
 */
export interface EvidenceItem {
    /** 证据唯一标识 */
    id: string;
    /** 来源节点 ID */
    sourceNodeId: string;
    /** 来源节点类型 */
    sourceNodeType: string;
    /** 来源节点名称 */
    sourceNodeName: string;
    /** 证据类型 */
    type: 'DATA_SNAPSHOT' | 'RULE_HIT' | 'AGENT_OPINION' | 'COMPUTED_METRIC' | 'EXTERNAL';
    /** 证据标题（简短描述） */
    title: string;
    /** 证据内容摘要 */
    summary: string;
    /** 原始数据快照 */
    rawData?: Record<string, unknown>;
    /** 置信度 (0-100) */
    confidence?: number;
    /** 是否为外部证据 */
    isExternal: boolean;
    /** 数据源标识 */
    dataSource?: string;
    /** 时间戳 */
    collectedAt: string;
}

/**
 * 证据聚合结果
 */
export interface EvidenceBundleResult {
    /** 全部证据条目 */
    evidence: EvidenceItem[];
    /** 强证据数量（白名单数据源） */
    strongEvidenceCount: number;
    /** 外部证据数量 */
    externalEvidenceCount: number;
    /** 是否满足最低强证据要求 (≥2条白名单源) */
    meetsMinStrongEvidence: boolean;
    /** 按类型分组统计 */
    countByType: Record<string, number>;
    /** 证据摘要文本 */
    evidenceSummary: string;
}

/**
 * 证据收集器
 *
 * 从各执行器节点输出中收集和汇聚证据, 构建统一的证据链。
 *
 * 设计原则 (ref: 设计方案 9.3):
 * - P0 白名单数据源: MarketIntel, ResearchReport, MarketEvent, MarketInsight, KnowledgeItem
 * - 外部数据默认标注 externalEvidence=true，不计入强证据
 * - 发布正式建议时至少 2 条来自白名单数据源
 */
@Injectable()
export class EvidenceCollector {
    private readonly logger = new Logger(EvidenceCollector.name);

    /** 白名单数据源 */
    private readonly STRONG_EVIDENCE_SOURCES = new Set([
        'MarketIntel',
        'ResearchReport',
        'MarketEvent',
        'MarketInsight',
        'KnowledgeItem',
    ]);

    /** 最小强证据数量 */
    private readonly MIN_STRONG_EVIDENCE = 2;

    /**
     * 从所有已执行节点收集证据
     *
     * @param nodes 工作流节点列表
     * @param outputsByNode 各节点输出 Map
     */
    collect(
        nodes: WorkflowNode[],
        outputsByNode: Map<string, Record<string, unknown>>,
    ): EvidenceBundleResult {
        const evidence: EvidenceItem[] = [];

        for (const node of nodes) {
            const output = outputsByNode.get(node.id);
            if (!output) continue;

            const items = this.extractFromNode(node, output);
            evidence.push(...items);
        }

        return this.buildBundle(evidence);
    }

    /**
     * 追加单个节点的证据到现有 bundle
     */
    appendFromNode(
        existing: EvidenceItem[],
        node: WorkflowNode,
        output: Record<string, unknown>,
    ): EvidenceBundleResult {
        const items = this.extractFromNode(node, output);
        const combined = [...existing, ...items];
        return this.buildBundle(combined);
    }

    // ────────────────── 节点类型证据提取 ──────────────────

    /**
     * 从单个节点输出提取证据
     */
    private extractFromNode(node: WorkflowNode, output: Record<string, unknown>): EvidenceItem[] {
        const nodeType = node.type;

        switch (nodeType) {
            case 'data-fetch':
            case 'market-data-fetch':
            case 'knowledge-fetch':
            case 'report-fetch':
            case 'external-api-fetch':
                return this.extractDataEvidence(node, output);

            case 'rule-eval':
            case 'rule-pack-eval':
            case 'alert-check':
            case 'risk-gate':
                return this.extractRuleEvidence(node, output);

            case 'agent-call':
            case 'single-agent':
                return this.extractAgentEvidence(node, output);

            case 'formula-calc':
            case 'feature-calc':
            case 'quantile-calc':
                return this.extractComputeEvidence(node, output);

            default:
                return [];
        }
    }

    /**
     * 数据节点证据: 从 data-fetch 类型节点提取数据快照作为证据
     */
    private extractDataEvidence(
        node: WorkflowNode,
        output: Record<string, unknown>,
    ): EvidenceItem[] {
        const items: EvidenceItem[] = [];
        const connectorType = output.connectorType as string | undefined;
        const dataSource = output.connectorCode as string ?? output.dataSource as string ?? 'unknown';

        // 主数据证据
        const records = output.records as unknown[] | undefined;
        const recordCount = (output.totalRecords as number) ?? records?.length ?? 0;

        if (recordCount > 0) {
            items.push({
                id: `${node.id}_data_snapshot`,
                sourceNodeId: node.id,
                sourceNodeType: node.type,
                sourceNodeName: node.name,
                type: 'DATA_SNAPSHOT',
                title: `${node.name} 数据快照`,
                summary: `获取 ${recordCount} 条记录 (${connectorType ?? 'unknown'}, 源: ${dataSource})`,
                rawData: {
                    recordCount,
                    connectorType,
                    dataSource,
                    sampleRecords: records?.slice(0, 3),
                    fetchedAt: output.fetchedAt,
                },
                isExternal: !this.isStrongSource(dataSource),
                dataSource,
                collectedAt: new Date().toISOString(),
            });
        }

        return items;
    }

    /**
     * 规则节点证据: 从 rule-eval/risk-gate 节点提取规则命中记录
     */
    private extractRuleEvidence(
        node: WorkflowNode,
        output: Record<string, unknown>,
    ): EvidenceItem[] {
        const items: EvidenceItem[] = [];

        // 规则命中列表
        const ruleHits = output.hits as unknown[] | undefined;
        if (ruleHits && Array.isArray(ruleHits)) {
            for (const hit of ruleHits) {
                const hitObj = hit as Record<string, unknown>;
                items.push({
                    id: `${node.id}_rule_${hitObj.ruleId ?? hitObj.ruleName ?? items.length}`,
                    sourceNodeId: node.id,
                    sourceNodeType: node.type,
                    sourceNodeName: node.name,
                    type: 'RULE_HIT',
                    title: `规则命中: ${hitObj.ruleName ?? hitObj.ruleId ?? 'unknown'}`,
                    summary: (hitObj.description as string) ??
                        `分数: ${hitObj.score ?? 'N/A'}, 结论: ${hitObj.conclusion ?? 'N/A'}`,
                    rawData: hitObj,
                    confidence: hitObj.score as number | undefined,
                    isExternal: false,
                    dataSource: 'RuleEngine',
                    collectedAt: new Date().toISOString(),
                });
            }
        }

        // 风控门禁综合结论
        const riskLevel = output.riskLevel as string | undefined;
        const degradeAction = output.degradeAction as string | undefined;
        if (riskLevel || degradeAction) {
            items.push({
                id: `${node.id}_risk_gate`,
                sourceNodeId: node.id,
                sourceNodeType: node.type,
                sourceNodeName: node.name,
                type: 'RULE_HIT',
                title: `风控结论: ${riskLevel ?? 'N/A'}`,
                summary: `风险等级=${riskLevel}, 降级动作=${degradeAction ?? 'NONE'}, 总分=${output.totalScore ?? 'N/A'}`,
                rawData: {
                    riskLevel,
                    degradeAction,
                    totalScore: output.totalScore,
                    blockers: output.blockers,
                },
                isExternal: false,
                dataSource: 'RiskGate',
                collectedAt: new Date().toISOString(),
            });
        }

        return items;
    }

    /**
     * Agent 节点证据: 从 agent-call 节点提取 AI 观点和分析
     */
    private extractAgentEvidence(
        node: WorkflowNode,
        output: Record<string, unknown>,
    ): EvidenceItem[] {
        const items: EvidenceItem[] = [];
        const agentCode = output.agentCode as string;
        const parsed = output.parsed as Record<string, unknown> | undefined;
        const rawResponse = output.rawResponse as string | undefined;
        const confidence = parsed?.confidence as number | undefined;

        items.push({
            id: `${node.id}_agent_opinion`,
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            sourceNodeName: node.name,
            type: 'AGENT_OPINION',
            title: `Agent[${agentCode ?? node.name}] 分析观点`,
            summary: this.buildAgentSummary(parsed, rawResponse),
            rawData: {
                agentCode,
                roleType: output.roleType,
                modelName: output.modelName,
                promptVersion: output.promptVersion,
                durationMs: output.durationMs,
                parsed,
                guardrailsPassed: output.guardrailsPassed,
            },
            confidence,
            isExternal: false,
            dataSource: `Agent:${agentCode ?? 'unknown'}`,
            collectedAt: new Date().toISOString(),
        });

        // 如果 Agent 输出中包含 evidence 数组，也收集
        const agentEvidence = parsed?.evidence as unknown[] | undefined;
        if (agentEvidence && Array.isArray(agentEvidence)) {
            for (const ev of agentEvidence) {
                const evObj = typeof ev === 'object' && ev !== null ? (ev as Record<string, unknown>) : {};
                items.push({
                    id: `${node.id}_agent_ev_${items.length}`,
                    sourceNodeId: node.id,
                    sourceNodeType: node.type,
                    sourceNodeName: node.name,
                    type: 'AGENT_OPINION',
                    title: (evObj.title as string) ?? `Agent 引用证据 #${items.length}`,
                    summary: (evObj.summary as string) ?? (evObj.content as string) ?? JSON.stringify(evObj).slice(0, 200),
                    rawData: evObj,
                    isExternal: (evObj.externalEvidence as boolean) ?? true,
                    dataSource: (evObj.source as string) ?? `Agent:${agentCode}`,
                    collectedAt: new Date().toISOString(),
                });
            }
        }

        return items;
    }

    /**
     * 计算节点证据: 从计算结果提取指标快照
     */
    private extractComputeEvidence(
        node: WorkflowNode,
        output: Record<string, unknown>,
    ): EvidenceItem[] {
        const result = output.result;
        const nodeType = output.nodeType as string ?? node.type;

        return [{
            id: `${node.id}_computed_metric`,
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            sourceNodeName: node.name,
            type: 'COMPUTED_METRIC',
            title: `${node.name} 计算结果`,
            summary: `类型=${nodeType}, 结果=${typeof result === 'object' ? JSON.stringify(result) : String(result ?? 'N/A')}`,
            rawData: {
                result,
                precision: output.precision,
                roundingMode: output.roundingMode,
                variables: output.variables,
                computedAt: output.computedAt,
            },
            isExternal: false,
            dataSource: 'ComputeEngine',
            collectedAt: new Date().toISOString(),
        }];
    }

    // ────────────────── 工具方法 ──────────────────

    /**
     * 构建证据聚合结果
     */
    private buildBundle(evidence: EvidenceItem[]): EvidenceBundleResult {
        const strongEvidenceCount = evidence.filter((e) => !e.isExternal).length;
        const externalEvidenceCount = evidence.filter((e) => e.isExternal).length;

        const countByType: Record<string, number> = {};
        for (const item of evidence) {
            countByType[item.type] = (countByType[item.type] ?? 0) + 1;
        }

        return {
            evidence,
            strongEvidenceCount,
            externalEvidenceCount,
            meetsMinStrongEvidence: strongEvidenceCount >= this.MIN_STRONG_EVIDENCE,
            countByType,
            evidenceSummary: this.buildEvidenceSummary(evidence),
        };
    }

    /**
     * 判断是否为强证据来源
     */
    private isStrongSource(dataSource: string): boolean {
        return this.STRONG_EVIDENCE_SOURCES.has(dataSource);
    }

    /**
     * 构建 Agent 观点摘要
     */
    private buildAgentSummary(
        parsed: Record<string, unknown> | undefined,
        rawResponse: string | undefined,
    ): string {
        if (!parsed) return rawResponse?.slice(0, 200) ?? '无输出';

        const parts: string[] = [];
        if (parsed.action) parts.push(`建议=${parsed.action}`);
        if (parsed.thesis) parts.push(`论点=${parsed.thesis}`);
        if (parsed.confidence !== undefined) parts.push(`置信度=${parsed.confidence}`);
        if (parsed.riskLevel) parts.push(`风险=${parsed.riskLevel}`);
        if (parsed.targetWindow) parts.push(`窗口=${parsed.targetWindow}`);

        return parts.length > 0 ? parts.join(', ') : rawResponse?.slice(0, 200) ?? '无摘要';
    }

    /**
     * 构建证据摘要文本
     */
    private buildEvidenceSummary(evidence: EvidenceItem[]): string {
        if (evidence.length === 0) return '无证据';

        const groups = new Map<string, EvidenceItem[]>();
        for (const item of evidence) {
            const existing = groups.get(item.type) ?? [];
            existing.push(item);
            groups.set(item.type, existing);
        }

        const parts: string[] = [];
        for (const [type, items] of groups) {
            const typeLabel = this.getTypeLabel(type);
            parts.push(`${typeLabel}(${items.length}条)`);
        }

        return `共${evidence.length}条证据: ${parts.join(', ')}`;
    }

    private getTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            DATA_SNAPSHOT: '数据快照',
            RULE_HIT: '规则命中',
            AGENT_OPINION: 'Agent观点',
            COMPUTED_METRIC: '计算指标',
            EXTERNAL: '外部证据',
        };
        return labels[type] ?? type;
    }
}

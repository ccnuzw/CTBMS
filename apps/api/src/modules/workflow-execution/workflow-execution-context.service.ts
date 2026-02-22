import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma } from '@prisma/client';
import { WorkflowDsl, WorkflowNode, ParameterScopeLevel } from '@packages/types';
import * as ExecutionUtils from './workflow-execution.utils';

const WORKFLOW_PARAM_SCOPE_PRIORITY: ParameterScopeLevel[] = [
    'PUBLIC_TEMPLATE',
    'USER_TEMPLATE',
    'GLOBAL',
    'COMMODITY',
    'REGION',
    'ROUTE',
    'STRATEGY',
    'SESSION',
];

@Injectable()
export class WorkflowExecutionContextService {
    constructor(private readonly prisma: PrismaService) { }

    async buildBindingSnapshot(
        ownerUserId: string,
        dsl: WorkflowDsl,
        runtimeParamSnapshot?: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const userConfigBindings = await this.prisma.userConfigBinding.findMany({
            where: {
                userId: ownerUserId,
                isActive: true,
                bindingType: {
                    in: ['AGENT_PROFILE', 'PARAMETER_SET', 'DECISION_RULE_PACK'],
                },
            },
            select: {
                id: true,
                bindingType: true,
                targetId: true,
                targetCode: true,
                priority: true,
            },
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        });

        const bindingTargetsByType = this.groupBindingTargetsByType(userConfigBindings);
        const agentBindings = ExecutionUtils.uniqueStringList([
            ...ExecutionUtils.uniqueStringList(dsl.agentBindings),
            ...bindingTargetsByType.AGENT_PROFILE,
        ]);
        const paramSetBindings = ExecutionUtils.uniqueStringList([
            ...ExecutionUtils.uniqueStringList(dsl.paramSetBindings),
            ...bindingTargetsByType.PARAMETER_SET,
        ]);
        const rulePackBindings = ExecutionUtils.uniqueStringList(bindingTargetsByType.DECISION_RULE_PACK);
        const dataConnectorBindings = ExecutionUtils.uniqueStringList(dsl.dataConnectorBindings);

        const [agents, parameterSets, rulePacks, connectors] = await Promise.all([
            agentBindings.length > 0
                ? this.prisma.agentProfile.findMany({
                    where: {
                        isActive: true,
                        AND: [
                            { OR: [{ agentCode: { in: agentBindings } }, { id: { in: agentBindings } }] },
                            { OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }] },
                        ],
                    },
                    select: {
                        id: true,
                        agentCode: true,
                        version: true,
                        roleType: true,
                        templateSource: true,
                    },
                })
                : Promise.resolve([]),
            paramSetBindings.length > 0
                ? this.prisma.parameterSet.findMany({
                    where: {
                        isActive: true,
                        AND: [
                            { OR: [{ setCode: { in: paramSetBindings } }, { id: { in: paramSetBindings } }] },
                            { OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }] },
                        ],
                    },
                    select: {
                        id: true,
                        setCode: true,
                        version: true,
                        templateSource: true,
                        updatedAt: true,
                    },
                })
                : Promise.resolve([]),
            rulePackBindings.length > 0
                ? this.prisma.decisionRulePack.findMany({
                    where: {
                        isActive: true,
                        AND: [
                            {
                                OR: [{ rulePackCode: { in: rulePackBindings } }, { id: { in: rulePackBindings } }],
                            },
                            { OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }] },
                        ],
                    },
                    select: {
                        id: true,
                        rulePackCode: true,
                        version: true,
                        templateSource: true,
                    },
                })
                : Promise.resolve([]),
            dataConnectorBindings.length > 0
                ? this.prisma.dataConnector.findMany({
                    where: {
                        OR: [
                            { connectorCode: { in: dataConnectorBindings } },
                            { id: { in: dataConnectorBindings } },
                        ],
                        isActive: true,
                    },
                    select: {
                        id: true,
                        connectorCode: true,
                        version: true,
                        connectorType: true,
                    },
                })
                : Promise.resolve([]),
        ]);

        const resolvedAgentTargets = new Set(
            agents.flatMap((item) => [item.id, item.agentCode].filter(Boolean)),
        );
        const resolvedSetTargets = new Set(
            parameterSets.flatMap((item) => [item.id, item.setCode].filter(Boolean)),
        );
        const resolvedRulePackTargets = new Set(
            rulePacks.flatMap((item) => [item.id, item.rulePackCode].filter(Boolean)),
        );
        const resolvedConnectorTargets = new Set(
            connectors.flatMap((item) => [item.id, item.connectorCode].filter(Boolean)),
        );
        const parameterItems = parameterSets.length > 0
            ? await this.prisma.parameterItem.findMany({
                where: {
                    parameterSetId: { in: parameterSets.map((item) => item.id) },
                    isActive: true,
                },
                select: {
                    parameterSetId: true,
                    paramCode: true,
                    scopeLevel: true,
                    scopeValue: true,
                    value: true,
                    defaultValue: true,
                    effectiveFrom: true,
                    effectiveTo: true,
                    updatedAt: true,
                },
            })
            : [];
        const scopeContext = this.extractParameterScopeContext(runtimeParamSnapshot);
        const resolvedParameters = this.resolveBoundParameterValues(
            parameterSets,
            parameterItems,
            scopeContext,
            paramSetBindings,
        );

        return {
            workflowBindings: {
                agentBindings,
                paramSetBindings,
                rulePackBindings,
                dataConnectorBindings,
            },
            userConfigBindings,
            resolvedBindings: {
                agents,
                parameterSets,
                rulePacks,
                dataConnectors: connectors,
            },
            resolvedParameters,
            parameterResolutionContext: scopeContext,
            unresolvedBindings: {
                agents: agentBindings.filter((item) => !resolvedAgentTargets.has(item)),
                parameterSets: paramSetBindings.filter((item) => !resolvedSetTargets.has(item)),
                rulePacks: rulePackBindings.filter((item) => !resolvedRulePackTargets.has(item)),
                dataConnectors: dataConnectorBindings.filter((item) => !resolvedConnectorTargets.has(item)),
            },
        };
    }

    mergeParamSnapshot(
        paramSnapshot: Record<string, unknown> | undefined,
        bindingSnapshot: Record<string, unknown>,
    ): Record<string, unknown> {
        const base = paramSnapshot ? { ...paramSnapshot } : {};
        const resolvedParameters = ExecutionUtils.readObject(bindingSnapshot.resolvedParameters) ?? {};
        const baseParams = ExecutionUtils.readObject(base.params) ?? {};
        base.params = {
            ...baseParams,
            ...resolvedParameters,
        };
        base.resolvedParams = {
            ...resolvedParameters,
        };
        for (const [key, value] of Object.entries(resolvedParameters)) {
            if (!(key in base)) {
                base[key] = value;
            }
        }
        base._workflowBindings = bindingSnapshot;
        return base;
    }

    resolveNodeParamSnapshot(
        node: WorkflowNode,
        baseParamSnapshot: Record<string, unknown> | undefined,
    ): Record<string, unknown> | undefined {
        const config = (node.config ?? {}) as Record<string, unknown>;
        const overrideMode = config.paramOverrideMode === 'PRIVATE_OVERRIDE' ? 'PRIVATE_OVERRIDE' : 'INHERIT';
        if (overrideMode !== 'PRIVATE_OVERRIDE') {
            return baseParamSnapshot;
        }

        const rawOverrides = config.paramOverrides;
        if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) {
            return baseParamSnapshot;
        }

        return {
            ...(baseParamSnapshot ?? {}),
            ...(rawOverrides as Record<string, unknown>),
        };
    }

    private groupBindingTargetsByType(
        bindings: Array<{
            bindingType: string;
            targetId: string;
            targetCode: string | null;
        }>,
    ): Record<'AGENT_PROFILE' | 'PARAMETER_SET' | 'DECISION_RULE_PACK', string[]> {
        const grouped: Record<'AGENT_PROFILE' | 'PARAMETER_SET' | 'DECISION_RULE_PACK', string[]> = {
            AGENT_PROFILE: [],
            PARAMETER_SET: [],
            DECISION_RULE_PACK: [],
        };

        for (const binding of bindings) {
            if (
                binding.bindingType !== 'AGENT_PROFILE' &&
                binding.bindingType !== 'PARAMETER_SET' &&
                binding.bindingType !== 'DECISION_RULE_PACK'
            ) {
                continue;
            }
            grouped[binding.bindingType].push(binding.targetCode || binding.targetId);
        }

        return {
            AGENT_PROFILE: ExecutionUtils.uniqueStringList(grouped.AGENT_PROFILE),
            PARAMETER_SET: ExecutionUtils.uniqueStringList(grouped.PARAMETER_SET),
            DECISION_RULE_PACK: ExecutionUtils.uniqueStringList(grouped.DECISION_RULE_PACK),
        };
    }

    extractParameterScopeContext(
        runtimeParamSnapshot?: Record<string, unknown>,
    ): {
        commodity?: string;
        region?: string;
        route?: string;
        strategy?: string;
        sessionOverrides: Record<string, unknown>;
    } {
        const snapshot = runtimeParamSnapshot ?? {};
        const context = ExecutionUtils.readObject(snapshot.context) ?? {};
        const sessionOverrides = ExecutionUtils.readObject(snapshot.sessionOverrides) ?? {};
        return {
            commodity: ExecutionUtils.readString(snapshot.commodity) ?? ExecutionUtils.readString(context.commodity) ?? undefined,
            region: ExecutionUtils.readString(snapshot.region) ?? ExecutionUtils.readString(context.region) ?? undefined,
            route: ExecutionUtils.readString(snapshot.route) ?? ExecutionUtils.readString(context.route) ?? undefined,
            strategy: ExecutionUtils.readString(snapshot.strategy) ?? ExecutionUtils.readString(context.strategy) ?? undefined,
            sessionOverrides,
        };
    }

    private resolveBoundParameterValues(
        parameterSets: Array<{
            id: string;
            setCode: string;
            version: number;
            templateSource: string;
            updatedAt: Date;
        }>,
        parameterItems: Array<{
            parameterSetId: string;
            paramCode: string;
            scopeLevel: string;
            scopeValue: string | null;
            value: Prisma.JsonValue | null;
            defaultValue: Prisma.JsonValue | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            updatedAt: Date;
        }>,
        scopeContext: {
            commodity?: string;
            region?: string;
            route?: string;
            strategy?: string;
            sessionOverrides: Record<string, unknown>;
        },
        setBindingOrder: string[],
    ): Record<string, unknown> {
        const bindingIndex = new Map<string, number>();
        setBindingOrder.forEach((codeOrId, index) => {
            if (!bindingIndex.has(codeOrId)) {
                bindingIndex.set(codeOrId, index);
            }
        });
        const orderedSets = [...parameterSets].sort((left, right) => {
            const leftIndex =
                bindingIndex.get(left.setCode) ?? bindingIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
            const rightIndex =
                bindingIndex.get(right.setCode) ?? bindingIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
            if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
            }
            return left.updatedAt.getTime() - right.updatedAt.getTime();
        });
        const setOrderIndex = new Map<string, number>(orderedSets.map((item, index) => [item.id, index]));
        const now = new Date();
        const matchedItems = parameterItems.filter((item) => {
            if (!this.matchParameterScope(item.scopeLevel, item.scopeValue, scopeContext)) {
                return false;
            }
            if (item.effectiveFrom && item.effectiveFrom.getTime() > now.getTime()) {
                return false;
            }
            if (item.effectiveTo && item.effectiveTo.getTime() < now.getTime()) {
                return false;
            }
            return true;
        });
        matchedItems.sort((left, right) => {
            const leftSetOrder = setOrderIndex.get(left.parameterSetId) ?? Number.MAX_SAFE_INTEGER;
            const rightSetOrder = setOrderIndex.get(right.parameterSetId) ?? Number.MAX_SAFE_INTEGER;
            if (leftSetOrder !== rightSetOrder) {
                return leftSetOrder - rightSetOrder;
            }
            const leftScopeOrder = WORKFLOW_PARAM_SCOPE_PRIORITY.indexOf(left.scopeLevel as ParameterScopeLevel);
            const rightScopeOrder = WORKFLOW_PARAM_SCOPE_PRIORITY.indexOf(
                right.scopeLevel as ParameterScopeLevel,
            );
            if (leftScopeOrder !== rightScopeOrder) {
                return leftScopeOrder - rightScopeOrder;
            }
            return left.updatedAt.getTime() - right.updatedAt.getTime();
        });

        const resolved = new Map<string, unknown>();
        for (const item of matchedItems) {
            const nextValue = item.value ?? item.defaultValue ?? null;
            resolved.set(item.paramCode, nextValue);
        }
        for (const [paramCode, value] of Object.entries(scopeContext.sessionOverrides)) {
            resolved.set(paramCode, value);
        }
        return Object.fromEntries(resolved);
    }

    private matchParameterScope(
        scopeLevel: string,
        scopeValue: string | null,
        context: {
            commodity?: string;
            region?: string;
            route?: string;
            strategy?: string;
            sessionOverrides: Record<string, unknown>;
        },
    ): boolean {
        switch (scopeLevel) {
            case 'PUBLIC_TEMPLATE':
            case 'USER_TEMPLATE':
            case 'GLOBAL':
                return true;
            case 'COMMODITY':
                return Boolean(context.commodity && context.commodity === scopeValue);
            case 'REGION':
                return Boolean(context.region && context.region === scopeValue);
            case 'ROUTE':
                return Boolean(context.route && context.route === scopeValue);
            case 'STRATEGY':
                return Boolean(context.strategy && context.strategy === scopeValue);
            case 'SESSION':
                return false;
            default:
                return false;
        }
    }
}

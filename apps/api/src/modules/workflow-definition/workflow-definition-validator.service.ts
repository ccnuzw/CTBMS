import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { WorkflowDslValidator } from './workflow-dsl-validator';
import {
  canonicalizeWorkflowDsl,
  getWorkflowNodeContract,
  normalizeWorkflowNodeType,
  WorkflowDsl,
  WorkflowValidationIssue,
  WorkflowValidationResult,
  WorkflowValidationStage,
  WorkflowNodePreviewField,
  WorkflowNodePreviewInputField,
  WorkflowNodePreviewResult,
  ValidateWorkflowNodePreviewDto,
} from '@packages/types';
import {
  VariableResolutionContext,
  VariableResolver,
} from '../workflow-execution/engine/variable-resolver';

@Injectable()
export class WorkflowDefinitionValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dslValidator: WorkflowDslValidator,
    private readonly variableResolver: VariableResolver,
  ) {}



  validateDsl(
    dslSnapshot: WorkflowDsl,
    stage: WorkflowValidationStage = 'SAVE',
  ): WorkflowValidationResult {
    return this.dslValidator.validate(canonicalizeWorkflowDsl(dslSnapshot), stage);
  }



  ensureDslValid(dslSnapshot: WorkflowDsl): void {
    const validation = this.dslValidator.validate(dslSnapshot, 'SAVE');
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'DSL 校验失败',
        issues: validation.issues,
      });
    }
  }



  ensureRiskGateBindingsValid(dslSnapshot: WorkflowDsl): void {
    const invalidNodeIds = dslSnapshot.nodes
      .filter((node) => node.type === 'risk-gate')
      .filter((node) => {
        const config = node.config as Record<string, unknown>;
        return typeof config.riskProfileCode !== 'string' || !config.riskProfileCode.trim();
      })
      .map((node) => node.id);

    if (invalidNodeIds.length > 0) {
      throw new BadRequestException(
        `risk-gate 节点缺少 riskProfileCode 配置: ${invalidNodeIds.join(', ')}`,
      );
    }
  }



  async ensureRulePackBindingsValid(
    ownerUserId: string,
    dslSnapshot: WorkflowDsl,
  ): Promise<void> {
    const rulePackCodes = this.extractRulePackCodesFromDsl(dslSnapshot);
    if (rulePackCodes.length === 0) {
      return;
    }

    const packs = await this.prisma.decisionRulePack.findMany({
      where: {
        rulePackCode: { in: rulePackCodes },
        isActive: true,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
      select: { rulePackCode: true },
    });
    const existingCodes = new Set(packs.map((pack) => pack.rulePackCode));
    const missingCodes = rulePackCodes.filter((code) => !existingCodes.has(code));

    if (missingCodes.length > 0) {
      throw new BadRequestException(`规则包不存在、已停用或无权限访问: ${missingCodes.join(', ')}`);
    }
  }



  async ensureAgentBindingsValid(
    ownerUserId: string,
    dslSnapshot: WorkflowDsl,
  ): Promise<void> {
    const dedupedCodes = new Set(this.readBindingCodes(dslSnapshot.agentBindings));
    const agentNodeTypes = new Set(['single-agent', 'agent-call', 'agent-group', 'judge-agent']);
    for (const node of dslSnapshot.nodes) {
      if (!agentNodeTypes.has(node.type)) {
        continue;
      }
      const config = this.asRecord(node.config);
      const agentProfileCode = config?.agentProfileCode;
      if (typeof agentProfileCode !== 'string') {
        continue;
      }
      const normalized = agentProfileCode.trim();
      if (normalized) {
        dedupedCodes.add(normalized);
      }
    }
    const agentCodes = [...dedupedCodes];
    if (agentCodes.length === 0) {
      return;
    }

    const agents = await this.prisma.agentProfile.findMany({
      where: {
        agentCode: { in: agentCodes },
        isActive: true,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
      select: { agentCode: true },
    });

    const existingCodes = new Set(agents.map((item) => item.agentCode));
    const missingCodes = agentCodes.filter((code) => !existingCodes.has(code));
    if (missingCodes.length > 0) {
      throw new BadRequestException(
        `Agent 绑定不存在、已停用或无权限访问: ${missingCodes.join(', ')}`,
      );
    }
  }



  async ensureParameterSetBindingsValid(
    ownerUserId: string,
    dslSnapshot: WorkflowDsl,
  ): Promise<void> {
    const setCodes = this.readBindingCodes(dslSnapshot.paramSetBindings);
    if (setCodes.length === 0) {
      return;
    }

    const sets = await this.prisma.parameterSet.findMany({
      where: {
        setCode: { in: setCodes },
        isActive: true,
        OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
      },
      select: { setCode: true },
    });

    const existingCodes = new Set(sets.map((item) => item.setCode));
    const missingCodes = setCodes.filter((code) => !existingCodes.has(code));
    if (missingCodes.length > 0) {
      throw new BadRequestException(
        `参数包绑定不存在、已停用或无权限访问: ${missingCodes.join(', ')}`,
      );
    }
  }



  async ensureDataConnectorBindingsValid(dslSnapshot: WorkflowDsl): Promise<void> {
    const connectorCodes = this.readBindingCodes(dslSnapshot.dataConnectorBindings);
    if (connectorCodes.length === 0) {
      return;
    }

    const connectors = await this.prisma.dataConnector.findMany({
      where: {
        connectorCode: { in: connectorCodes },
        isActive: true,
      },
      select: { connectorCode: true },
    });

    const existingCodes = new Set(connectors.map((item) => item.connectorCode));
    const missingCodes = connectorCodes.filter((code) => !existingCodes.has(code));
    if (missingCodes.length > 0) {
      throw new BadRequestException(`数据连接器绑定不存在或已停用: ${missingCodes.join(', ')}`);
    }
  }



  async validateGovernanceForPublish(
    ownerUserId: string,
    dslSnapshot: WorkflowDsl,
    currentWorkflowDefinitionId: string,
  ): Promise<WorkflowValidationIssue[]> {
    const issues: WorkflowValidationIssue[] = [];

    const dslOwnerUserId =
      typeof dslSnapshot.ownerUserId === 'string' ? dslSnapshot.ownerUserId.trim() : '';
    if (!dslOwnerUserId) {
      issues.push({
        code: 'WF304',
        severity: 'ERROR',
        message: '发布前 DSL 必须声明 ownerUserId',
      });
    } else if (dslOwnerUserId !== ownerUserId) {
      issues.push({
        code: 'WF304',
        severity: 'ERROR',
        message: 'DSL ownerUserId 与发布操作者不一致，隔离校验未通过',
      });
    }

    const rulePackCodes = this.extractRulePackCodesFromDsl(dslSnapshot);
    if (rulePackCodes.length > 0) {
      const packs = await this.prisma.decisionRulePack.findMany({
        where: {
          rulePackCode: { in: rulePackCodes },
          isActive: true,
          OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
        },
        select: { rulePackCode: true, version: true },
      });
      const existingCodes = new Set(packs.map((item) => item.rulePackCode));
      const missingCodes = rulePackCodes.filter((code) => !existingCodes.has(code));
      if (missingCodes.length > 0) {
        issues.push({
          code: 'WF301',
          severity: 'ERROR',
          message: `RulePack 未发布/不可用/无权限访问: ${missingCodes.join(', ')}`,
        });
      }
      const invalidVersionCodes = packs
        .filter((item) => !Number.isInteger(item.version) || item.version < 2)
        .map((item) => item.rulePackCode);
      if (invalidVersionCodes.length > 0) {
        issues.push({
          code: 'WF301',
          severity: 'ERROR',
          message: `RulePack 尚未发布（需要 version>=2）: ${invalidVersionCodes.join(', ')}`,
        });
      }
    }

    const setCodes = this.readBindingCodes(dslSnapshot.paramSetBindings);
    if (setCodes.length > 0) {
      const sets = await this.prisma.parameterSet.findMany({
        where: {
          setCode: { in: setCodes },
          isActive: true,
          OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
        },
        select: { setCode: true, version: true },
      });
      const existingCodes = new Set(sets.map((item) => item.setCode));
      const missingCodes = setCodes.filter((code) => !existingCodes.has(code));
      if (missingCodes.length > 0) {
        issues.push({
          code: 'WF302',
          severity: 'ERROR',
          message: `ParameterSet 不存在/不可用/无权限访问: ${missingCodes.join(', ')}`,
        });
      }
      const invalidVersionCodes = sets
        .filter((item) => !Number.isInteger(item.version) || item.version < 2)
        .map((item) => item.setCode);
      if (invalidVersionCodes.length > 0) {
        issues.push({
          code: 'WF302',
          severity: 'ERROR',
          message: `ParameterSet 尚未发布（需要 version>=2）: ${invalidVersionCodes.join(', ')}`,
        });
      }
    }

    const paramRefs = this.extractParameterRefsFromDsl(dslSnapshot);
    if (paramRefs.size > 0) {
      if (setCodes.length === 0) {
        issues.push({
          code: 'WF203',
          severity: 'ERROR',
          message: `流程引用了参数表达式 (${[...paramRefs].join(', ')})，但未声明 paramSetBindings`,
        });
      } else {
        const refList = [...paramRefs];
        const parameterItems = await this.prisma.parameterItem.findMany({
          where: {
            paramCode: { in: refList },
            isActive: true,
            parameterSet: {
              setCode: { in: setCodes },
              isActive: true,
              OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
            },
          },
          select: { paramCode: true },
        });
        const resolvedCodes = new Set(parameterItems.map((item) => item.paramCode));
        const unresolvedCodes = refList.filter((code) => !resolvedCodes.has(code));
        if (unresolvedCodes.length > 0) {
          issues.push({
            code: 'WF203',
            severity: 'ERROR',
            message: `参数表达式无法在绑定 ParameterSet 中解析: ${unresolvedCodes.join(', ')}`,
          });
        }
      }
    }

    const agentCodes = this.extractAgentCodesFromDsl(dslSnapshot);
    if (agentCodes.length > 0) {
      const profiles = await this.prisma.agentProfile.findMany({
        where: {
          agentCode: { in: agentCodes },
          isActive: true,
          OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
        },
        select: { agentCode: true, version: true },
      });
      const existingCodes = new Set(profiles.map((item) => item.agentCode));
      const missingCodes = agentCodes.filter((code) => !existingCodes.has(code));
      if (missingCodes.length > 0) {
        issues.push({
          code: 'WF303',
          severity: 'ERROR',
          message: `AgentProfile 不存在/不可用/无权限访问: ${missingCodes.join(', ')}`,
        });
      }
      const invalidVersionCodes = profiles
        .filter((item) => !Number.isInteger(item.version) || item.version < 2)
        .map((item) => item.agentCode);
      if (invalidVersionCodes.length > 0) {
        issues.push({
          code: 'WF303',
          severity: 'ERROR',
          message: `AgentProfile 尚未发布（需要 version>=2）: ${invalidVersionCodes.join(', ')}`,
        });
      }
    }

    const subflowIssues = await this.validateSubflowReferencesForPublish(
      ownerUserId,
      dslSnapshot,
      currentWorkflowDefinitionId,
    );
    issues.push(...subflowIssues);

    return issues;
  }



  async validateSubflowReferencesForPublish(
    ownerUserId: string,
    dslSnapshot: WorkflowDsl,
    currentWorkflowDefinitionId: string,
  ): Promise<WorkflowValidationIssue[]> {
    const issues: WorkflowValidationIssue[] = [];
    const subflowNodes = dslSnapshot.nodes.filter((node) => node.type === 'subflow-call');
    if (subflowNodes.length === 0) {
      return issues;
    }

    for (const node of subflowNodes) {
      const config = this.asRecord(node.config);
      const workflowDefinitionId =
        typeof config?.workflowDefinitionId === 'string' ? config.workflowDefinitionId.trim() : '';
      const workflowVersionId =
        typeof config?.workflowVersionId === 'string' ? config.workflowVersionId.trim() : '';

      if (!workflowDefinitionId) {
        issues.push({
          code: 'WF107',
          severity: 'ERROR',
          message: `subflow-call 节点 ${node.name} 缺少 workflowDefinitionId`,
          nodeId: node.id,
        });
        continue;
      }
      if (workflowDefinitionId === currentWorkflowDefinitionId) {
        issues.push({
          code: 'WF107',
          severity: 'ERROR',
          message: `subflow-call 节点 ${node.name} 不允许引用当前流程自身`,
          nodeId: node.id,
        });
        continue;
      }

      const definition = await this.prisma.workflowDefinition.findFirst({
        where: {
          id: workflowDefinitionId,
          OR: [{ ownerUserId }, { templateSource: 'PUBLIC' }],
        },
        select: { id: true },
      });
      if (!definition) {
        issues.push({
          code: 'WF107',
          severity: 'ERROR',
          message: `subflow-call 节点 ${node.name} 引用的流程不存在或无权限访问`,
          nodeId: node.id,
        });
        continue;
      }

      if (workflowVersionId) {
        const version = await this.prisma.workflowVersion.findFirst({
          where: {
            id: workflowVersionId,
            workflowDefinitionId: definition.id,
            status: 'PUBLISHED',
          },
          select: { id: true },
        });
        if (!version) {
          issues.push({
            code: 'WF107',
            severity: 'ERROR',
            message: `subflow-call 节点 ${node.name} 指定的版本不存在或未发布`,
            nodeId: node.id,
          });
        }
        continue;
      }

      const published = await this.prisma.workflowVersion.findFirst({
        where: {
          workflowDefinitionId: definition.id,
          status: 'PUBLISHED',
        },
        select: { id: true },
      });
      if (!published) {
        issues.push({
          code: 'WF107',
          severity: 'ERROR',
          message: `subflow-call 节点 ${node.name} 引用流程缺少已发布版本`,
          nodeId: node.id,
        });
      }
    }

    return issues;
  }



  extractRulePackCodesFromDsl(dslSnapshot: WorkflowDsl): string[] {
    const ruleNodeTypes = new Set(['rule-pack-eval', 'rule-eval', 'alert-check']);
    const deduped = new Set<string>();
    for (const node of dslSnapshot.nodes) {
      if (!ruleNodeTypes.has(node.type)) {
        continue;
      }
      const config = this.asRecord(node.config);
      if (!this.shouldUseDecisionRulePack(node.type, config)) {
        continue;
      }
      const codes = this.readRulePackCodes(config);
      if (codes.length === 0) {
        throw new BadRequestException(`规则节点 ${node.name} 缺少 rulePackCode 配置`);
      }
      for (const code of codes) {
        if (code) {
          deduped.add(code);
        }
      }
    }
    return [...deduped];
  }



  shouldUseDecisionRulePack(
    nodeType: string,
    config: Record<string, unknown> | null,
  ): boolean {
    if (nodeType === 'rule-pack-eval') {
      return true;
    }
    const source = this.resolveRuleSource(nodeType, config);
    return source === 'DECISION_RULE_PACK';
  }



  resolveRuleSource(nodeType: string, config: Record<string, unknown> | null): string {
    const raw = config?.ruleSource;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim().toUpperCase();
    }
    if (nodeType === 'alert-check') {
      const hasAlertRefs = Boolean(
        (typeof config?.alertRuleId === 'string' && config.alertRuleId.trim()) ||
        (typeof config?.alertType === 'string' && config.alertType.trim()),
      );
      return hasAlertRefs ? 'MARKET_ALERT_RULE' : 'INLINE';
    }
    if (nodeType === 'rule-eval') {
      return 'INLINE';
    }
    return 'DECISION_RULE_PACK';
  }



  readRulePackCodes(config: Record<string, unknown> | null): string[] {
    if (!config) {
      return [];
    }
    const direct = typeof config.rulePackCode === 'string' ? config.rulePackCode.trim() : '';
    const list = Array.isArray(config.rulePackCodes)
      ? config.rulePackCodes
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    return [...new Set([direct, ...list].filter(Boolean))];
  }



  extractAgentCodesFromDsl(dslSnapshot: WorkflowDsl): string[] {
    const deduped = new Set(this.readBindingCodes(dslSnapshot.agentBindings));
    const agentNodeTypes = new Set(['single-agent', 'agent-call', 'agent-group', 'judge-agent']);
    for (const node of dslSnapshot.nodes) {
      if (!agentNodeTypes.has(node.type)) {
        continue;
      }
      const config = this.asRecord(node.config);
      const agentProfileCode = config?.agentProfileCode;
      if (typeof agentProfileCode !== 'string') {
        continue;
      }
      const normalized = agentProfileCode.trim();
      if (normalized) {
        deduped.add(normalized);
      }
    }
    return [...deduped];
  }



  extractParameterRefsFromDsl(dslSnapshot: WorkflowDsl): Set<string> {
    const refs = new Set<string>();
    for (const node of dslSnapshot.nodes) {
      this.collectStringLeaves(node.config).forEach((value) => {
        for (const ref of this.extractExpressionRefs(value)) {
          if (ref.scope !== 'params') {
            continue;
          }
          const code = ref.path.split('.')[0]?.trim();
          if (code) {
            refs.add(code);
          }
        }
      });
      this.collectStringLeaves(node.inputBindings).forEach((value) => {
        for (const ref of this.extractExpressionRefs(value)) {
          if (ref.scope !== 'params') {
            continue;
          }
          const code = ref.path.split('.')[0]?.trim();
          if (code) {
            refs.add(code);
          }
        }
      });
    }
    for (const edge of dslSnapshot.edges) {
      this.collectStringLeaves(edge.condition).forEach((value) => {
        for (const ref of this.extractExpressionRefs(value)) {
          if (ref.scope !== 'params') {
            continue;
          }
          const code = ref.path.split('.')[0]?.trim();
          if (code) {
            refs.add(code);
          }
        }
      });
    }
    return refs;
  }



  collectStringLeaves(value: unknown): string[] {
    if (typeof value === 'string') {
      return [value];
    }
    if (!value || typeof value !== 'object') {
      return [];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.collectStringLeaves(item));
    }
    return Object.values(value).flatMap((item) => this.collectStringLeaves(item));
  }



  extractExpressionRefs(value: string): Array<{ scope: string; path: string }> {
    const refs: Array<{ scope: string; path: string }> = [];
    const expressionPattern = /\{\{\s*([^}]+?)\s*\}\}/g;
    let match = expressionPattern.exec(value);
    while (match) {
      const rawExpr = match[1];
      const withNoDefault = rawExpr.split('|')[0]?.trim() ?? '';
      const dotIndex = withNoDefault.indexOf('.');
      if (dotIndex > 0 && dotIndex < withNoDefault.length - 1) {
        const scope = withNoDefault.slice(0, dotIndex).trim();
        const path = withNoDefault.slice(dotIndex + 1).trim();
        if (scope && path) {
          refs.push({ scope, path });
        }
      }
      match = expressionPattern.exec(value);
    }
    return refs;
  }



  previewNodeBindings(dto: ValidateWorkflowNodePreviewDto): WorkflowNodePreviewResult {
    const normalizedDsl = canonicalizeWorkflowDsl(dto.dslSnapshot);
    const validation = this.dslValidator.validate(normalizedDsl, dto.stage ?? 'SAVE');
    const node = normalizedDsl.nodes.find((item) => item.id === dto.nodeId);
    if (!node) {
      throw new BadRequestException(`节点不存在: ${dto.nodeId}`);
    }

    const nodeIssues = validation.issues.filter((issue) => issue.nodeId === dto.nodeId);
    const contract = getWorkflowNodeContract(normalizeWorkflowNodeType(node.type));
    const fallbackInputs = (contract?.inputsSchema ?? []).map((field) => ({
      name: field.name,
      type: field.type,
      required: field.required,
    }));
    const inputsSchema = dto.inputsSchema.length > 0 ? dto.inputsSchema : fallbackInputs;

    const inputBindings =
      Object.keys(dto.inputBindings).length > 0
        ? dto.inputBindings
        : this.readStringMap(node.inputBindings);
    const defaultValues = dto.defaultValues ?? {};
    const nullPolicies = dto.nullPolicies ?? {};
    const sampleInput = dto.sampleInput ?? {};

    const { rows, resolvedPayload } = this.buildNodePreviewRows(
      inputsSchema,
      inputBindings,
      defaultValues,
      nullPolicies,
      sampleInput,
    );

    return {
      nodeId: dto.nodeId,
      validation,
      nodeIssues,
      rows,
      resolvedPayload,
    };
  }



  buildNodePreviewRows(
    inputsSchema: WorkflowNodePreviewInputField[],
    inputBindings: Record<string, string>,
    defaultValues: Record<string, unknown>,
    nullPolicies: Record<string, string>,
    sampleInput: Record<string, unknown>,
  ): { rows: WorkflowNodePreviewField[]; resolvedPayload: Record<string, unknown> } {
    const rows: WorkflowNodePreviewField[] = [];
    const resolvedPayload: Record<string, unknown> = {};
    const resolverContext = this.buildPreviewResolverContext(sampleInput);

    const fields =
      inputsSchema.length > 0
        ? inputsSchema
        : [...new Set([...Object.keys(inputBindings), ...Object.keys(defaultValues)])].map(
            (name) => ({
              name,
              type: 'any',
              required: false,
            }),
          );

    for (const field of fields) {
      const binding = inputBindings[field.name];
      const defaultValue = defaultValues[field.name];
      const nullPolicy = nullPolicies[field.name] ?? 'FAIL';

      if (!binding || !binding.trim()) {
        if (defaultValue !== undefined && defaultValue !== '') {
          rows.push(
            this.withPreviewTypeCheck({
              field: field.name,
              expectedType: field.type,
              status: 'default',
              source: 'defaultValues',
              value: defaultValue,
            }),
          );
          resolvedPayload[field.name] = defaultValue;
          continue;
        }

        if (field.required) {
          rows.push({
            field: field.name,
            expectedType: field.type,
            status: 'missing',
            source: '-',
            note: '必填字段未配置映射且无默认值',
          });
          continue;
        }

        rows.push({
          field: field.name,
          expectedType: field.type,
          status: 'empty',
          source: '-',
        });
        continue;
      }

      const parsedBinding = this.parseSimpleBindingExpression(binding);
      if (!parsedBinding) {
        const expressionEval = this.resolveAdvancedBindingExpression(binding, resolverContext);
        if (expressionEval.status === 'resolved') {
          rows.push(
            this.withPreviewTypeCheck({
              field: field.name,
              expectedType: field.type,
              status: 'resolved',
              source: 'expression',
              value: expressionEval.value,
              note: expressionEval.note,
            }),
          );
          resolvedPayload[field.name] = expressionEval.value;
          continue;
        }

        if (expressionEval.status === 'unsupported') {
          rows.push({
            field: field.name,
            expectedType: field.type,
            status: 'expression',
            source: 'expression',
            value: binding,
            note: expressionEval.note,
          });
          resolvedPayload[field.name] = binding;
          continue;
        }

        if (nullPolicy === 'USE_DEFAULT') {
          rows.push(
            this.withPreviewTypeCheck({
              field: field.name,
              expectedType: field.type,
              status: 'default',
              source: 'nullPolicy.USE_DEFAULT',
              value: defaultValue,
              note:
                defaultValue === undefined
                  ? `${expressionEval.note}；默认值为空，建议补齐`
                  : expressionEval.note,
            }),
          );
          if (defaultValue !== undefined) {
            resolvedPayload[field.name] = defaultValue;
          }
          continue;
        }

        if (nullPolicy === 'SKIP') {
          rows.push({
            field: field.name,
            expectedType: field.type,
            status: 'skipped',
            source: 'nullPolicy.SKIP',
            note: expressionEval.note,
          });
          continue;
        }

        rows.push({
          field: field.name,
          expectedType: field.type,
          status: 'missing',
          source: 'expression',
          note: expressionEval.note,
        });
        continue;
      }

      const sourceScope = this.resolveSourceScope(sampleInput, parsedBinding.scope);
      const resolvedValue = this.resolveDeepPath(sourceScope, parsedBinding.path.join('.'));
      const sourcePath = `${parsedBinding.scope}.${parsedBinding.path.join('.')}`;

      if (resolvedValue !== undefined) {
        rows.push(
          this.withPreviewTypeCheck({
            field: field.name,
            expectedType: field.type,
            status: 'resolved',
            source: sourcePath,
            value: resolvedValue,
          }),
        );
        resolvedPayload[field.name] = resolvedValue;
        continue;
      }

      if (nullPolicy === 'USE_DEFAULT') {
        rows.push(
          this.withPreviewTypeCheck({
            field: field.name,
            expectedType: field.type,
            status: 'default',
            source: 'nullPolicy.USE_DEFAULT',
            value: defaultValue,
            note: defaultValue === undefined ? '默认值为空，建议补齐' : undefined,
          }),
        );
        if (defaultValue !== undefined) {
          resolvedPayload[field.name] = defaultValue;
        }
        continue;
      }

      if (nullPolicy === 'SKIP') {
        rows.push({
          field: field.name,
          expectedType: field.type,
          status: 'skipped',
          source: 'nullPolicy.SKIP',
        });
        continue;
      }

      rows.push({
        field: field.name,
        expectedType: field.type,
        status: 'missing',
        source: sourcePath,
        note: '未在样例输入中解析到该字段',
      });
    }

    return { rows, resolvedPayload };
  }



  buildPreviewResolverContext(
    sampleInput: Record<string, unknown>,
  ): VariableResolutionContext {
    const outputsByNode = new Map<string, Record<string, unknown>>();

    const upstream = this.asRecord(sampleInput.upstream);
    if (upstream) {
      for (const [nodeId, output] of Object.entries(upstream)) {
        const record = this.asRecord(output);
        if (!record) {
          continue;
        }
        outputsByNode.set(nodeId, record);
      }
    }

    for (const [scope, output] of Object.entries(sampleInput)) {
      if (scope === 'upstream' || scope === 'params' || scope === 'meta') {
        continue;
      }
      const record = this.asRecord(output);
      if (!record) {
        continue;
      }
      outputsByNode.set(scope, record);
    }

    const paramSnapshot = this.asRecord(sampleInput.params) ?? {};
    const meta = this.asRecord(sampleInput.meta);

    return {
      currentNodeId: 'preview-node',
      outputsByNode,
      paramSnapshot,
      meta: {
        executionId:
          typeof meta?.executionId === 'string' && meta.executionId.trim()
            ? meta.executionId
            : 'preview-execution',
        triggerUserId:
          typeof meta?.triggerUserId === 'string' && meta.triggerUserId.trim()
            ? meta.triggerUserId
            : 'preview-user',
        timestamp:
          typeof meta?.timestamp === 'string' && meta.timestamp.trim()
            ? meta.timestamp
            : new Date().toISOString(),
      },
    };
  }



  resolveAdvancedBindingExpression(
    binding: string,
    context: VariableResolutionContext,
  ):
    | { status: 'resolved'; value: unknown; note: string }
    | { status: 'unresolved'; note: string }
    | { status: 'unsupported'; note: string } {
    const trimmed = binding.trim();
    const hasTemplateToken = trimmed.includes('{{') && trimmed.includes('}}');
    if (!hasTemplateToken) {
      return {
        status: 'unsupported',
        note: '当前仅支持 {{scope.path}} / {{scope.path | default: value}} 模板表达式预览',
      };
    }

    const templateTokens = trimmed.match(/\{\{\s*[^}]+?\s*\}\}/g) ?? [];
    const isSingleTemplate = templateTokens.length === 1 && templateTokens[0] === trimmed;
    if (isSingleTemplate) {
      const result = this.variableResolver.resolveMapping({ __preview__: trimmed }, context);
      const unresolvedCount = result.unresolvedVars.length;
      if (
        unresolvedCount > 0 ||
        !Object.prototype.hasOwnProperty.call(result.resolved, '__preview__')
      ) {
        return {
          status: 'unresolved',
          note: `表达式变量无法解析: ${this.describeUnresolvedExpressions(result.unresolvedVars, trimmed)}`,
        };
      }
      return {
        status: 'resolved',
        value: result.resolved.__preview__,
        note: '已按表达式规则完成求值',
      };
    }

    const templateResult = this.variableResolver.resolveTemplate(trimmed, context);
    const unresolvedMatches = templateResult.text.match(/\{\{\s*[^}]+?\s*\}\}/g) ?? [];
    if (unresolvedMatches.length > 0) {
      return {
        status: 'unresolved',
        note: `模板变量无法解析: ${this.describeUnresolvedExpressions(unresolvedMatches, trimmed)}`,
      };
    }

    return {
      status: 'resolved',
      value: this.tryEvaluateNumericExpression(templateResult.text),
      note: '已按模板表达式完成求值',
    };
  }



  describeUnresolvedExpressions(candidates: string[], fallback: string): string {
    const deduped = [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
    if (deduped.length === 0) {
      return fallback;
    }
    if (deduped.length <= 3) {
      return deduped.join(', ');
    }
    return `${deduped.slice(0, 3).join(', ')} 等 ${deduped.length} 项`;
  }



  tryEvaluateNumericExpression(templateText: string): unknown {
    const raw = templateText.trim();
    if (!raw) {
      return templateText;
    }

    const numericExpressionPattern = /^[0-9+\-*/%().\s]+$/;
    if (!numericExpressionPattern.test(raw)) {
      return templateText;
    }

    try {
      const result = Function(`"use strict"; return (${raw});`)();
      if (typeof result === 'number' && Number.isFinite(result)) {
        return result;
      }
      return templateText;
    } catch {
      return templateText;
    }
  }



  withPreviewTypeCheck(row: WorkflowNodePreviewField): WorkflowNodePreviewField {
    if (row.value === undefined) {
      return row;
    }

    const actualType = this.inferPreviewValueType(row.value);
    const typeCompatible = this.isPreviewTypeCompatible(row.expectedType, actualType);
    if (typeCompatible) {
      return {
        ...row,
        actualType,
        typeCompatible: true,
      };
    }

    const mismatchNote = `类型不兼容：期望 ${this.normalizePreviewType(row.expectedType)}，实际 ${actualType}`;
    return {
      ...row,
      actualType,
      typeCompatible: false,
      note: row.note ? `${row.note}；${mismatchNote}` : mismatchNote,
    };
  }



  inferPreviewValueType(value: unknown): string {
    if (value === null) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    const rawType = typeof value;
    if (rawType === 'string' || rawType === 'number' || rawType === 'boolean') {
      return rawType;
    }
    if (rawType === 'object') {
      return 'object';
    }
    return 'unknown';
  }



  normalizePreviewType(rawType: string): string {
    const normalized = rawType.trim().toLowerCase();
    if (!normalized) {
      return 'unknown';
    }
    if (normalized === 'int' || normalized === 'integer' || normalized === 'float') {
      return 'number';
    }
    if (normalized === 'double') {
      return 'number';
    }
    if (normalized === 'json' || normalized === 'map') {
      return 'object';
    }
    if (normalized === 'list' || normalized === 'tuple') {
      return 'array';
    }
    if (normalized === 'bool') {
      return 'boolean';
    }
    if (normalized === 'str') {
      return 'string';
    }
    if (
      normalized === 'string' ||
      normalized === 'number' ||
      normalized === 'boolean' ||
      normalized === 'object' ||
      normalized === 'array' ||
      normalized === 'null' ||
      normalized === 'unknown' ||
      normalized === 'any'
    ) {
      return normalized;
    }
    return 'unknown';
  }



  isPreviewTypeCompatible(expectedType: string, actualType: string): boolean {
    const normalizedExpected = this.normalizePreviewType(expectedType);
    const normalizedActual = this.normalizePreviewType(actualType);
    if (normalizedExpected === 'any' || normalizedActual === 'any') {
      return true;
    }
    if (normalizedExpected === 'unknown' || normalizedActual === 'unknown') {
      return true;
    }
    return normalizedExpected === normalizedActual;
  }



  parseSimpleBindingExpression(binding: string): { scope: string; path: string[] } | null {
    const match = binding.trim().match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    if (!match) {
      return null;
    }
    const expression = match[1].trim();
    if (!expression || expression.includes(' ') || expression.includes('|')) {
      return null;
    }
    const parts = expression.split('.');
    if (parts.length < 2) {
      return null;
    }
    const [scope, ...path] = parts;
    if (!scope || path.length === 0) {
      return null;
    }
    return { scope, path };
  }



  resolveSourceScope(sampleInput: Record<string, unknown>, scope: string): unknown {
    const directScope = sampleInput[scope];
    if (directScope !== undefined) {
      return directScope;
    }
    const upstream = this.asRecord(sampleInput.upstream);
    if (!upstream) {
      return undefined;
    }
    return upstream[scope];
  }



  readStringMap(value: unknown): Record<string, string> {
    const record = this.asRecord(value);
    if (!record) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(record)) {
      if (typeof item !== 'string') {
        continue;
      }
      result[key] = item;
    }
    return result;
  }



  resolveDeepPath(source: unknown, path: string): unknown {
    if (!source || typeof source !== 'object') {
      return undefined;
    }

    let current: unknown = source;
    for (const segment of path.split('.')) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      if (Array.isArray(current)) {
        const index = Number(segment);
        if (!Number.isInteger(index)) {
          return undefined;
        }
        current = current[index];
        continue;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }



  asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }



  readBindingCodes(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const set = new Set<string>();
    for (const item of value) {
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

}

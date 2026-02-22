import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { WorkflowDslValidator } from './workflow-dsl-validator';
import {
  canonicalizeWorkflowDsl,
  WorkflowDsl,
  WorkflowValidationIssue,
  WorkflowValidationResult,
  WorkflowValidationStage,
} from '@packages/types';

@Injectable()
export class WorkflowDefinitionValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dslValidator: WorkflowDslValidator,
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

  async ensureRulePackBindingsValid(ownerUserId: string, dslSnapshot: WorkflowDsl): Promise<void> {
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

  async ensureAgentBindingsValid(ownerUserId: string, dslSnapshot: WorkflowDsl): Promise<void> {
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
      for (const code of codes as string[]) {
        if (code) {
          deduped.add(code);
        }
      }
    }
    return [...deduped];
  }

  shouldUseDecisionRulePack(nodeType: string, config: Record<string, unknown> | null): boolean {
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

  public asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  public readBindingCodes(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string');
    }
    if (typeof value === 'string') {
      return [value];
    }
    return [];
  }
}

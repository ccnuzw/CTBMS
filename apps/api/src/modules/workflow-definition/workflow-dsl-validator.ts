import { Injectable } from '@nestjs/common';
import {
  WorkflowDsl,
  WorkflowNode,
  WorkflowValidationIssue,
  WorkflowValidationResult,
  WorkflowValidationStage,
} from '@packages/types';

type WorkflowFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'unknown';
type WorkflowFieldTypeMap = Map<string, WorkflowFieldType>;

@Injectable()
export class WorkflowDslValidator {
  validate(dsl: WorkflowDsl, stage: WorkflowValidationStage = 'SAVE'): WorkflowValidationResult {
    const issues: WorkflowValidationIssue[] = [];

    this.validateTopLevelFields(dsl, issues);
    this.validateUniqueness(dsl, issues);
    this.validateEdgeReferences(dsl, issues);
    this.validateOrphanNodes(dsl, issues);
    this.validateLinearMode(dsl, issues);
    this.validateDebateMode(dsl, issues);
    this.validateDagMode(dsl, issues);
    this.validateApprovalOutputs(dsl, issues);
    this.validateJoinQuorum(dsl, issues);
    this.validateDataEdgeTypeCompatibility(dsl, issues);
    this.validateInputBindingReferences(dsl, issues);
    this.validateParameterRefs(dsl, issues);
    this.validateDecisionMergeFanIn(dsl, issues);
    this.validateConditionEdgeSyntax(dsl, issues);
    if (stage === 'PUBLISH') {
      this.validateRiskGateExists(dsl, issues);
      this.validateRuntimePolicyCoverageForPublish(dsl, issues);
      this.validateOwnerIsolationForPublish(dsl, issues);
      this.validateEvidenceConfigForPublish(dsl, issues);
      this.validateExperimentConfigForPublish(dsl, issues);
    }

    return {
      valid: issues.every((issue) => issue.severity !== 'ERROR'),
      issues,
    };
  }

  private validateTopLevelFields(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    if (!dsl.workflowId || !dsl.name || !dsl.mode || !dsl.nodes || !dsl.edges) {
      issues.push({
        code: 'WF001',
        severity: 'ERROR',
        message: 'workflowId、name、mode、nodes、edges 为必填字段',
      });
    }
  }

  private validateUniqueness(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    const nodeIds = new Set<string>();
    for (const node of dsl.nodes) {
      if (nodeIds.has(node.id)) {
        issues.push({
          code: 'WF002',
          severity: 'ERROR',
          message: `节点 ID 重复: ${node.id}`,
          nodeId: node.id,
        });
      }
      nodeIds.add(node.id);
    }

    const edgeIds = new Set<string>();
    for (const edge of dsl.edges) {
      if (edgeIds.has(edge.id)) {
        issues.push({
          code: 'WF002',
          severity: 'ERROR',
          message: `连线 ID 重复: ${edge.id}`,
          edgeId: edge.id,
        });
      }
      edgeIds.add(edge.id);
    }
  }

  private validateEdgeReferences(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    const nodeIds = new Set(dsl.nodes.map((node) => node.id));

    for (const edge of dsl.edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        issues.push({
          code: 'WF003',
          severity: 'ERROR',
          message: `连线 ${edge.id} 的 from/to 节点不存在`,
          edgeId: edge.id,
        });
      }
    }
  }

  private validateOrphanNodes(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    const inCount = new Map<string, number>();
    const outCount = new Map<string, number>();

    for (const node of dsl.nodes) {
      inCount.set(node.id, 0);
      outCount.set(node.id, 0);
    }

    for (const edge of dsl.edges) {
      outCount.set(edge.from, (outCount.get(edge.from) || 0) + 1);
      inCount.set(edge.to, (inCount.get(edge.to) || 0) + 1);
    }

    for (const node of dsl.nodes) {
      const incoming = inCount.get(node.id) || 0;
      const outgoing = outCount.get(node.id) || 0;
      const isTriggerNode = node.type === 'trigger' || node.type.endsWith('-trigger');
      if (incoming === 0 && outgoing === 0 && !isTriggerNode) {
        issues.push({
          code: 'WF004',
          severity: 'ERROR',
          message: `存在悬空节点: ${node.name}`,
          nodeId: node.id,
        });
      }
    }
  }

  private validateLinearMode(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    if (dsl.mode !== 'LINEAR') {
      return;
    }

    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();

    for (const node of dsl.nodes) {
      incoming.set(node.id, 0);
      outgoing.set(node.id, 0);
    }

    for (const edge of dsl.edges) {
      outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
      incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    }

    for (const node of dsl.nodes) {
      const inDegree = incoming.get(node.id) || 0;
      const outDegree = outgoing.get(node.id) || 0;
      if (inDegree > 1 || outDegree > 1) {
        issues.push({
          code: 'WF005',
          severity: 'ERROR',
          message: `LINEAR 模式不允许分叉或汇聚: ${node.name}`,
          nodeId: node.id,
        });
      }
    }
  }

  private validateDebateMode(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    if (dsl.mode !== 'DEBATE') {
      return;
    }

    const nodeTypes = new Set(dsl.nodes.map((node) => node.type));
    const requiredNodeTypes = ['context-builder', 'debate-round', 'judge-agent'];
    const missing = requiredNodeTypes.filter((type) => !nodeTypes.has(type));

    if (missing.length > 0) {
      issues.push({
        code: 'WF101',
        severity: 'ERROR',
        message: `DEBATE 模式缺少必需节点: ${missing.join(', ')}`,
      });
    }
  }

  private validateDagMode(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    if (dsl.mode !== 'DAG') {
      return;
    }

    const hasJoinNode = dsl.nodes.some((node) => node.type === 'join');
    if (!hasJoinNode) {
      issues.push({
        code: 'WF102',
        severity: 'ERROR',
        message: 'DAG 模式必须包含 join 节点',
      });
    }
  }

  private validateApprovalOutputs(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    const nodeMap = new Map(dsl.nodes.map((node) => [node.id, node]));
    const outputNodeTypes = new Set(['notify', 'report-generate', 'dashboard-publish']);
    const outgoingMap = new Map<string, string[]>();

    for (const edge of dsl.edges) {
      const targets = outgoingMap.get(edge.from) || [];
      targets.push(edge.to);
      outgoingMap.set(edge.from, targets);
    }

    for (const node of dsl.nodes) {
      if (node.type !== 'approval') {
        continue;
      }

      const targets = outgoingMap.get(node.id) || [];
      for (const targetId of targets) {
        const targetNode = nodeMap.get(targetId);
        if (!targetNode) {
          continue;
        }
        if (!outputNodeTypes.has(targetNode.type)) {
          issues.push({
            code: 'WF103',
            severity: 'ERROR',
            message: `approval 节点后仅允许连接输出节点，当前连接到 ${targetNode.type}`,
            nodeId: node.id,
          });
        }
      }
    }
  }

  private validateRiskGateExists(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    const hasRiskGate = dsl.nodes.some((node) => node.type === 'risk-gate');
    if (!hasRiskGate) {
      issues.push({
        code: 'WF104',
        severity: 'ERROR',
        message: '发布前必须包含 risk-gate 节点',
      });
    }
  }

  private validateJoinQuorum(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    for (const node of dsl.nodes) {
      if (node.type !== 'join') {
        continue;
      }

      const config = node.config as Record<string, unknown>;
      const joinPolicy = config?.joinPolicy;
      const quorumBranches = config?.quorumBranches;

      if (joinPolicy === 'QUORUM') {
        const isValidQuorum =
          typeof quorumBranches === 'number' &&
          Number.isInteger(quorumBranches) &&
          quorumBranches >= 2;
        if (!isValidQuorum) {
          issues.push({
            code: 'WF105',
            severity: 'ERROR',
            message: 'joinPolicy=QUORUM 时 quorumBranches 必须为 >= 2 的整数',
            nodeId: node.id,
          });
        }
      }
    }
  }

  private validateRuntimePolicyCoverageForPublish(
    dsl: WorkflowDsl,
    issues: WorkflowValidationIssue[],
  ): void {
    const nodeDefaults = dsl.runPolicy?.nodeDefaults ?? {};

    for (const node of dsl.nodes) {
      if (node.enabled === false) {
        continue;
      }
      const isTriggerNode = node.type === 'trigger' || node.type.endsWith('-trigger');
      if (isTriggerNode) {
        continue;
      }

      const nodeRuntimePolicy = node.runtimePolicy ?? {};
      const nodeConfig = (node.config ?? {}) as Record<string, unknown>;
      const missingFields: string[] = [];

      if (
        nodeRuntimePolicy.timeoutMs === undefined &&
        nodeConfig.timeoutMs === undefined &&
        nodeDefaults.timeoutMs === undefined
      ) {
        missingFields.push('timeoutMs');
      }
      if (
        nodeRuntimePolicy.retryCount === undefined &&
        nodeConfig.retryCount === undefined &&
        nodeDefaults.retryCount === undefined
      ) {
        missingFields.push('retryCount');
      }
      if (
        nodeRuntimePolicy.retryBackoffMs === undefined &&
        nodeConfig.retryBackoffMs === undefined &&
        nodeDefaults.retryBackoffMs === undefined
      ) {
        missingFields.push('retryBackoffMs');
      }
      if (
        nodeRuntimePolicy.onError === undefined &&
        nodeConfig.onError === undefined &&
        nodeDefaults.onError === undefined
      ) {
        missingFields.push('onError');
      }

      if (missingFields.length > 0) {
        issues.push({
          code: 'WF106',
          severity: 'ERROR',
          message: `发布前节点运行策略不完整: ${node.name} 缺少 ${missingFields.join(', ')}`,
          nodeId: node.id,
        });
      }
    }
  }

  /** WF201: data-edge 上下游字段类型兼容 */
  private validateDataEdgeTypeCompatibility(
    dsl: WorkflowDsl,
    issues: WorkflowValidationIssue[],
  ): void {
    const nodeMap = new Map(dsl.nodes.map((node) => [node.id, node]));

    for (const edge of dsl.edges) {
      if (edge.edgeType !== 'data-edge') {
        continue;
      }

      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) {
        continue;
      }

      const fromOutputTypes = this.extractNodeOutputFieldTypes(fromNode);
      const toInputTypes = this.extractNodeInputFieldTypes(toNode);
      if (!fromOutputTypes || !toInputTypes) {
        continue;
      }

      const bindingPairs = this.collectBindingPairsFromInputBindings(
        toNode.inputBindings,
        fromNode.id,
      );
      if (bindingPairs.length > 0) {
        for (const pair of bindingPairs) {
          const sourceType = this.resolveFieldType(fromOutputTypes, pair.sourcePath);
          const targetType = this.resolveFieldType(toInputTypes, pair.targetPath);
          if (!sourceType || !targetType) {
            continue;
          }
          if (!this.isTypeCompatible(sourceType, targetType)) {
            issues.push({
              code: 'WF201',
              severity: 'ERROR',
              message: `data-edge ${edge.id} 字段类型不兼容: ${fromNode.name}.${pair.sourcePath}(${sourceType}) -> ${toNode.name}.${pair.targetPath}(${targetType})`,
              edgeId: edge.id,
            });
          }
        }
        continue;
      }

      for (const [targetFieldPath, targetType] of toInputTypes.entries()) {
        const sourceType = this.resolveFieldType(fromOutputTypes, targetFieldPath);
        if (!sourceType) {
          continue;
        }
        if (!this.isTypeCompatible(sourceType, targetType)) {
          issues.push({
            code: 'WF201',
            severity: 'ERROR',
            message: `data-edge ${edge.id} 字段类型不兼容: ${fromNode.name}.${targetFieldPath}(${sourceType}) -> ${toNode.name}.${targetFieldPath}(${targetType})`,
            edgeId: edge.id,
          });
        }
      }
    }
  }

  /** WF202: inputBindings 引用字段必须存在 */
  private validateInputBindingReferences(
    dsl: WorkflowDsl,
    issues: WorkflowValidationIssue[],
  ): void {
    const nodeMap = new Map(dsl.nodes.map((node) => [node.id, node]));

    for (const node of dsl.nodes) {
      if (!node.inputBindings || typeof node.inputBindings !== 'object') {
        continue;
      }
      const bindingEntries = this.flattenObjectLeafEntries(node.inputBindings);
      for (const entry of bindingEntries) {
        if (typeof entry.value !== 'string') {
          continue;
        }
        const refs = this.extractExpressionRefs(entry.value);
        for (const ref of refs) {
          if (ref.scope === 'params' || ref.scope === 'meta') {
            continue;
          }
          const sourceNode = nodeMap.get(ref.scope);
          if (!sourceNode) {
            issues.push({
              code: 'WF202',
              severity: 'ERROR',
              message: `节点 ${node.name} 的 inputBindings 引用了不存在的节点: ${ref.scope}`,
              nodeId: node.id,
            });
            continue;
          }
          const sourceOutputTypes = this.extractNodeOutputFieldTypes(sourceNode);
          if (!sourceOutputTypes) {
            continue;
          }
          if (!this.resolveFieldType(sourceOutputTypes, ref.path)) {
            issues.push({
              code: 'WF202',
              severity: 'ERROR',
              message: `节点 ${node.name} 的 inputBindings 字段引用不存在: ${ref.scope}.${ref.path}`,
              nodeId: node.id,
            });
          }
        }
      }
    }
  }

  /** WF203: 表达式参数编码必须在 ParameterSet 中可解析（静态门禁） */
  private validateParameterRefs(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    const parameterRefs = this.extractParameterRefsFromDsl(dsl);
    if (parameterRefs.size === 0) {
      return;
    }

    const bindings = this.readBindingCodes(dsl.paramSetBindings);
    if (bindings.length === 0) {
      issues.push({
        code: 'WF203',
        severity: 'ERROR',
        message: `流程引用了参数表达式 (${[...parameterRefs].join(', ')})，但未声明 paramSetBindings`,
      });
    }
  }

  /** WF204: decision-merge 上游至少 2 条入边 */
  private validateDecisionMergeFanIn(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    const inDegreeMap = new Map<string, number>();
    for (const node of dsl.nodes) {
      inDegreeMap.set(node.id, 0);
    }
    for (const edge of dsl.edges) {
      inDegreeMap.set(edge.to, (inDegreeMap.get(edge.to) ?? 0) + 1);
    }

    for (const node of dsl.nodes) {
      if (node.type !== 'decision-merge') continue;
      const inDegree = inDegreeMap.get(node.id) ?? 0;
      if (inDegree < 2) {
        issues.push({
          code: 'WF204',
          severity: 'ERROR',
          message: `decision-merge 节点 ${node.name} 上游至少需要 2 条入边，当前 ${inDegree}`,
          nodeId: node.id,
        });
      }
    }
  }

  /** WF205: 条件边表达式语法校验 */
  private validateConditionEdgeSyntax(dsl: WorkflowDsl, issues: WorkflowValidationIssue[]): void {
    for (const edge of dsl.edges) {
      if (edge.edgeType !== 'condition-edge') continue;
      if (edge.condition === null || edge.condition === undefined) {
        issues.push({
          code: 'WF205',
          severity: 'ERROR',
          message: `条件边 ${edge.id} 必须配置 condition 表达式`,
          edgeId: edge.id,
        });
        continue;
      }
      if (typeof edge.condition === 'boolean') continue;
      if (typeof edge.condition === 'string') {
        if (!edge.condition.trim()) {
          issues.push({
            code: 'WF205',
            severity: 'ERROR',
            message: `条件边 ${edge.id} 的 condition 字符串不能为空`,
            edgeId: edge.id,
          });
        }
        continue;
      }
      if (typeof edge.condition === 'object') {
        const cond = edge.condition as Record<string, unknown>;
        if (!cond.field || !cond.operator) {
          issues.push({
            code: 'WF205',
            severity: 'ERROR',
            message: `条件边 ${edge.id} 的 condition 必须包含 field 和 operator`,
            edgeId: edge.id,
          });
        }
        continue;
      }
      issues.push({
        code: 'WF205',
        severity: 'ERROR',
        message: `条件边 ${edge.id} 的 condition 类型非法，必须是 boolean/string/object`,
        edgeId: edge.id,
      });
    }
  }

  /** WF304: ownerUserId 必填（隔离校验在发布治理阶段完成） */
  private validateOwnerIsolationForPublish(
    dsl: WorkflowDsl,
    issues: WorkflowValidationIssue[],
  ): void {
    if (!dsl.ownerUserId || !dsl.ownerUserId.trim()) {
      issues.push({
        code: 'WF304',
        severity: 'ERROR',
        message: '发布前 DSL 必须声明 ownerUserId',
      });
    }
  }

  /** WF305: 生产发布必须校验三类证据链配置齐全 */
  private validateEvidenceConfigForPublish(
    dsl: WorkflowDsl,
    issues: WorkflowValidationIssue[],
  ): void {
    const hasRiskGate = dsl.nodes.some((n) => n.type === 'risk-gate');
    if (!hasRiskGate) {
      return;
    }

    const hasDataEvidenceNode = dsl.nodes.some(
      (node) => node.type === 'data-fetch' || node.type.endsWith('-fetch'),
    );
    const hasRuleEvidenceNode = dsl.nodes.some((node) => {
      const type = node.type;
      return type === 'rule-pack-eval' || type === 'rule-eval' || type === 'alert-check';
    });
    const hasModelEvidenceNode = dsl.nodes.some((node) => {
      const type = node.type;
      return (
        type === 'single-agent' ||
        type === 'agent-call' ||
        type === 'agent-group' ||
        type === 'judge-agent' ||
        type === 'debate-round'
      );
    });

    const missing: string[] = [];
    if (!hasDataEvidenceNode) missing.push('数据证据');
    if (!hasRuleEvidenceNode) missing.push('规则证据');
    if (!hasModelEvidenceNode) missing.push('模型证据');

    if (missing.length > 0) {
      issues.push({
        code: 'WF305',
        severity: 'ERROR',
        message: `证据链配置不完整，缺少: ${missing.join('、')}`,
      });
    }
  }

  /** WF306: 若配置 A/B 灰度，实验分流规则必须有效 */
  private validateExperimentConfigForPublish(
    dsl: WorkflowDsl,
    issues: WorkflowValidationIssue[],
  ): void {
    const experimentConfig = this.asRecord(dsl.experimentConfig);
    if (!experimentConfig) {
      return;
    }

    if (experimentConfig.enabled !== true) {
      return;
    }

    if (
      typeof experimentConfig.experimentCode !== 'string' ||
      !experimentConfig.experimentCode.trim()
    ) {
      issues.push({
        code: 'WF306',
        severity: 'ERROR',
        message: 'experimentConfig.enabled=true 时必须提供 experimentCode',
      });
    }

    const variants = Array.isArray(experimentConfig.variants) ? experimentConfig.variants : [];
    if (variants.length < 2) {
      issues.push({
        code: 'WF306',
        severity: 'ERROR',
        message: 'experimentConfig.enabled=true 时 variants 至少需要 2 个分流版本',
      });
      return;
    }

    let totalTraffic = 0;
    for (const variant of variants) {
      const item = this.asRecord(variant);
      if (!item) {
        issues.push({
          code: 'WF306',
          severity: 'ERROR',
          message: 'experimentConfig.variants 的每个元素必须为对象',
        });
        continue;
      }

      const version = item.version;
      if (typeof version !== 'string' || !version.trim()) {
        issues.push({
          code: 'WF306',
          severity: 'ERROR',
          message: 'experimentConfig.variants[].version 必须为非空字符串',
        });
      }

      const traffic = item.traffic;
      if (typeof traffic !== 'number' || !Number.isFinite(traffic) || traffic <= 0) {
        issues.push({
          code: 'WF306',
          severity: 'ERROR',
          message: 'experimentConfig.variants[].traffic 必须为正数',
        });
        continue;
      }
      totalTraffic += traffic;
    }

    const totalIsOne = Math.abs(totalTraffic - 1) < 1e-6;
    const totalIsHundred = Math.abs(totalTraffic - 100) < 1e-6;
    if (!totalIsOne && !totalIsHundred) {
      issues.push({
        code: 'WF306',
        severity: 'ERROR',
        message: `experimentConfig.variants traffic 总和必须为 1 或 100，当前 ${totalTraffic}`,
      });
    }

    const splitPolicy = experimentConfig.splitPolicy;
    if (splitPolicy !== undefined) {
      const allowedSplitPolicies = new Set(['RANDOM', 'HASH', 'USER_HASH']);
      if (typeof splitPolicy !== 'string' || !allowedSplitPolicies.has(splitPolicy)) {
        issues.push({
          code: 'WF306',
          severity: 'ERROR',
          message: 'experimentConfig.splitPolicy 必须为 RANDOM/HASH/USER_HASH 之一',
        });
      }
    }

    const autoStop = this.asRecord(experimentConfig.autoStop);
    if (autoStop && autoStop.enabled === true) {
      const threshold = autoStop.badCaseThreshold;
      if (
        typeof threshold !== 'number' ||
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1
      ) {
        issues.push({
          code: 'WF306',
          severity: 'ERROR',
          message:
            'experimentConfig.autoStop.enabled=true 时 badCaseThreshold 必须为 [0,1] 区间数值',
        });
      }
    }
  }

  private collectBindingPairsFromInputBindings(
    inputBindings: unknown,
    sourceNodeId: string,
  ): Array<{ targetPath: string; sourcePath: string }> {
    if (!inputBindings || typeof inputBindings !== 'object') {
      return [];
    }

    const pairs: Array<{ targetPath: string; sourcePath: string }> = [];
    const entries = this.flattenObjectLeafEntries(inputBindings);
    for (const entry of entries) {
      if (typeof entry.value !== 'string') {
        continue;
      }
      const refs = this.extractExpressionRefs(entry.value);
      for (const ref of refs) {
        if (ref.scope !== sourceNodeId) {
          continue;
        }
        pairs.push({
          targetPath: entry.path,
          sourcePath: ref.path,
        });
      }
    }
    return pairs;
  }

  private extractParameterRefsFromDsl(dsl: WorkflowDsl): Set<string> {
    const refs = new Set<string>();

    for (const node of dsl.nodes) {
      this.collectStringLeaves(node.config).forEach((value) => {
        for (const exprRef of this.extractExpressionRefs(value)) {
          if (exprRef.scope !== 'params') {
            continue;
          }
          const code = exprRef.path.split('.')[0]?.trim();
          if (code) {
            refs.add(code);
          }
        }
      });
      this.collectStringLeaves(node.inputBindings).forEach((value) => {
        for (const exprRef of this.extractExpressionRefs(value)) {
          if (exprRef.scope !== 'params') {
            continue;
          }
          const code = exprRef.path.split('.')[0]?.trim();
          if (code) {
            refs.add(code);
          }
        }
      });
    }

    for (const edge of dsl.edges) {
      this.collectStringLeaves(edge.condition).forEach((value) => {
        for (const exprRef of this.extractExpressionRefs(value)) {
          if (exprRef.scope !== 'params') {
            continue;
          }
          const code = exprRef.path.split('.')[0]?.trim();
          if (code) {
            refs.add(code);
          }
        }
      });
    }

    return refs;
  }

  private extractNodeOutputFieldTypes(node: WorkflowNode): WorkflowFieldTypeMap | null {
    const config = this.asRecord(node.config);
    const candidates: unknown[] = [node.outputSchema];
    if (config) {
      candidates.push(config.outputSchema, config.outputSchemaDef, config.outputFields);
    }

    for (const candidate of candidates) {
      const map = this.extractFieldTypeMap(candidate);
      if (map && map.size > 0) {
        return map;
      }
    }
    return null;
  }

  private extractNodeInputFieldTypes(node: WorkflowNode): WorkflowFieldTypeMap | null {
    const config = this.asRecord(node.config);
    if (!config) {
      return null;
    }

    const candidates: unknown[] = [
      config.inputSchema,
      config.expectedInputSchema,
      config.inputFields,
    ];
    for (const candidate of candidates) {
      const map = this.extractFieldTypeMap(candidate);
      if (map && map.size > 0) {
        return map;
      }
    }
    return null;
  }

  private extractFieldTypeMap(schema: unknown): WorkflowFieldTypeMap | null {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return null;
    }

    const map = new Map<string, WorkflowFieldType>();
    const record = schema as Record<string, unknown>;

    const properties = this.asRecord(record.properties);
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        const type = this.resolveTypeToken(value);
        if (type) {
          map.set(key, type);
        }
      }
      return map.size > 0 ? map : null;
    }

    const fields = this.asRecord(record.fields);
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        const type = this.resolveTypeToken(value);
        if (type) {
          map.set(key, type);
        }
      }
      return map.size > 0 ? map : null;
    }

    for (const [key, value] of Object.entries(record)) {
      const type = this.resolveTypeToken(value);
      if (type) {
        map.set(key, type);
      }
    }

    return map.size > 0 ? map : null;
  }

  private resolveTypeToken(value: unknown): WorkflowFieldType | null {
    if (typeof value === 'string') {
      return this.normalizeType(value);
    }
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }
    if (typeof record.type === 'string') {
      return this.normalizeType(record.type);
    }
    return null;
  }

  private normalizeType(rawType: string): WorkflowFieldType {
    const normalized = rawType.trim().toLowerCase();
    if (normalized === 'int' || normalized === 'float' || normalized === 'double') {
      return 'number';
    }
    if (
      normalized === 'string' ||
      normalized === 'number' ||
      normalized === 'boolean' ||
      normalized === 'object' ||
      normalized === 'array' ||
      normalized === 'null' ||
      normalized === 'unknown'
    ) {
      return normalized;
    }
    return 'unknown';
  }

  private resolveFieldType(
    fieldTypes: WorkflowFieldTypeMap,
    fieldPath: string,
  ): WorkflowFieldType | null {
    if (fieldTypes.has(fieldPath)) {
      return fieldTypes.get(fieldPath) ?? null;
    }

    const normalizedPath = fieldPath.replace(/\[(\d+)\]/g, '.$1');
    if (fieldTypes.has(normalizedPath)) {
      return fieldTypes.get(normalizedPath) ?? null;
    }

    const pathTokens = normalizedPath.split('.');
    while (pathTokens.length > 1) {
      pathTokens.pop();
      const candidate = pathTokens.join('.');
      if (fieldTypes.has(candidate)) {
        return fieldTypes.get(candidate) ?? null;
      }
    }
    return null;
  }

  private isTypeCompatible(source: WorkflowFieldType, target: WorkflowFieldType): boolean {
    if (source === 'unknown' || target === 'unknown') {
      return true;
    }
    return source === target;
  }

  private extractExpressionRefs(value: string): Array<{ scope: string; path: string }> {
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

  private flattenObjectLeafEntries(
    value: unknown,
    path = '',
  ): Array<{ path: string; value: unknown }> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }
    const entries: Array<{ path: string; value: unknown }> = [];
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        entries.push(...this.flattenObjectLeafEntries(child, nextPath));
        continue;
      }
      entries.push({ path: nextPath, value: child });
    }
    return entries;
  }

  private collectStringLeaves(value: unknown): string[] {
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

  private readBindingCodes(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const deduped = new Set<string>();
    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }
      const normalized = item.trim();
      if (!normalized) {
        continue;
      }
      deduped.add(normalized);
    }
    return [...deduped];
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}

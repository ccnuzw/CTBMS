import { WorkflowDslValidator } from './workflow-dsl-validator';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  canonicalizeWorkflowDsl,
  getWorkflowNodeContract,
  normalizeWorkflowNodeType,
  WorkflowValidationIssue,
  WorkflowNodePreviewInputField,
  WorkflowNodePreviewResult,
  ValidateWorkflowNodePreviewDto,
  WorkflowNodePreviewField,
} from '@packages/types';
import {
  VariableResolutionContext,
  VariableResolver,
} from '../workflow-execution/engine/variable-resolver';

@Injectable()
export class WorkflowNodePreviewService {
  private readonly logger = new Logger(WorkflowNodePreviewService.name);

  constructor(
    private readonly variableResolver: VariableResolver,
    private readonly dslValidator: WorkflowDslValidator,
  ) {}

  previewNodeBindings(dto: ValidateWorkflowNodePreviewDto): WorkflowNodePreviewResult {
    const normalizedDsl = canonicalizeWorkflowDsl(dto.dslSnapshot);
    const validation = this.dslValidator.validate(normalizedDsl, dto.stage ?? 'SAVE');
    const node = normalizedDsl.nodes.find((item: { id: string }) => item.id === dto.nodeId);
    if (!node) {
      throw new BadRequestException(`节点不存在: ${dto.nodeId}`);
    }

    const nodeIssues = validation.issues.filter(
      (issue: WorkflowValidationIssue) => issue.nodeId === dto.nodeId,
    );
    const contract = getWorkflowNodeContract(normalizeWorkflowNodeType(node.type));
    const fallbackInputs = (contract?.inputsSchema ?? []).map(
      (field: WorkflowNodePreviewInputField) => ({
        name: field.name,
        type: field.type,
        required: field.required,
      }),
    );
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

  buildPreviewResolverContext(sampleInput: Record<string, unknown>): VariableResolutionContext {
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

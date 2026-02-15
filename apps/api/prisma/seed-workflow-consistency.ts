import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEGACY_DATA_SOURCE_CODE_MAP: Record<string, string> = {
  INTERNAL_DB: 'MARKET_INTEL_INTERNAL_DB',
  VOLATILITY_DB: 'MARKET_EVENT_INTERNAL_DB',
  INTERNAL_MARKET_DB: 'MARKET_INTEL_INTERNAL_DB',
  market_intel_db: 'MARKET_INTEL_INTERNAL_DB',
  inventory_db: 'MARKET_EVENT_INTERNAL_DB',
};

type WorkflowSnapshot = {
  workflowId: string;
  mode: string;
  nodes: Array<Record<string, unknown>>;
  paramSetBindings: string[];
  agentBindings: string[];
};

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readStringArray(value: unknown): string[] {
  const result: string[] = [];
  for (const item of readArray(value)) {
    const parsed = readString(item);
    if (parsed) {
      result.push(parsed);
    }
  }
  return result;
}

function parseWorkflowSnapshot(
  workflowId: string,
  snapshotValue: unknown,
): WorkflowSnapshot | null {
  const snapshot = readObject(snapshotValue);
  if (!snapshot) {
    return null;
  }

  const mode = readString(snapshot.mode) ?? 'LINEAR';
  const nodes = readArray(snapshot.nodes)
    .map((item) => readObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const paramSetBindings = readStringArray(snapshot.paramSetBindings);
  const agentBindings = readStringArray(snapshot.agentBindings);

  return {
    workflowId,
    mode,
    nodes,
    paramSetBindings,
    agentBindings,
  };
}

function getNodeId(node: Record<string, unknown>): string {
  return readString(node.id) ?? '(unknown-node)';
}

function getNodeType(node: Record<string, unknown>): string {
  return readString(node.type) ?? '(unknown-type)';
}

function getNodeConfig(node: Record<string, unknown>): Record<string, unknown> {
  return readObject(node.config) ?? {};
}

async function verifyWorkflowSeedConsistency() {
  console.log('🌱 开始校验工作流种子一致性...');

  const [
    definitions,
    parameterSets,
    parameterItems,
    connectors,
    rulePacks,
    agentProfiles,
    promptTemplates,
    modelConfigs,
    defaultModelConfig,
  ] = await Promise.all([
    prisma.workflowDefinition.findMany({
      where: {
        isActive: true,
        templateSource: 'PUBLIC',
        latestVersionCode: { not: null },
      },
      select: {
        id: true,
        workflowId: true,
        latestVersionCode: true,
      },
    }),
    prisma.parameterSet.findMany({
      where: { isActive: true },
      select: { setCode: true },
    }),
    prisma.parameterItem.findMany({
      where: { isActive: true },
      select: {
        parameterSet: { select: { setCode: true } },
        paramCode: true,
      },
    }),
    prisma.dataConnector.findMany({
      where: { isActive: true },
      select: { connectorCode: true },
    }),
    prisma.decisionRulePack.findMany({
      where: { isActive: true },
      select: {
        rulePackCode: true,
        ruleLayer: true,
        applicableScopes: true,
      },
    }),
    prisma.agentProfile.findMany({
      where: { isActive: true },
      select: {
        agentCode: true,
        agentPromptCode: true,
        modelConfigKey: true,
      },
    }),
    prisma.agentPromptTemplate.findMany({
      where: { isActive: true },
      select: { promptCode: true },
    }),
    prisma.aIModelConfig.findMany({
      where: { isActive: true },
      select: { configKey: true },
    }),
    prisma.aIModelConfig.findFirst({
      where: { isActive: true, isDefault: true },
      select: { configKey: true },
    }),
  ]);

  const activeParameterSets = new Set(parameterSets.map((item) => item.setCode));
  const activeParameterKeys = new Set(
    parameterItems.map((item) => `${item.parameterSet.setCode}::${item.paramCode}`),
  );
  const activeConnectors = new Set(connectors.map((item) => item.connectorCode));
  const activeRulePacks = new Map(rulePacks.map((item) => [item.rulePackCode, item]));
  const activeAgentProfiles = new Map(agentProfiles.map((item) => [item.agentCode, item]));
  const activePromptTemplates = new Set(promptTemplates.map((item) => item.promptCode));
  const activeModelConfigs = new Set(modelConfigs.map((item) => item.configKey));

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const definition of definitions) {
    const latestVersionCode = definition.latestVersionCode;
    if (!latestVersionCode) {
      errors.push(`[${definition.workflowId}] latestVersionCode 为空`);
      continue;
    }

    const version = await prisma.workflowVersion.findUnique({
      where: {
        workflowDefinitionId_versionCode: {
          workflowDefinitionId: definition.id,
          versionCode: latestVersionCode,
        },
      },
      select: {
        dslSnapshot: true,
      },
    });

    if (!version) {
      errors.push(
        `[${definition.workflowId}] 未找到 latestVersionCode=${latestVersionCode} 对应版本`,
      );
      continue;
    }

    const parsed = parseWorkflowSnapshot(definition.workflowId, version.dslSnapshot);
    if (!parsed) {
      errors.push(`[${definition.workflowId}] dslSnapshot 非法`);
      continue;
    }

    for (const setCode of parsed.paramSetBindings) {
      if (!activeParameterSets.has(setCode)) {
        errors.push(`[${parsed.workflowId}] 参数集不存在或未激活: ${setCode}`);
      }
    }

    const referencedAgentCodes = new Set<string>(parsed.agentBindings);
    const boundSetCodes = parsed.paramSetBindings;

    for (const node of parsed.nodes) {
      const nodeId = getNodeId(node);
      const nodeType = getNodeType(node);
      const config = getNodeConfig(node);

      if (nodeType === 'data-fetch') {
        const rawCode = readString(config.dataSourceCode) ?? readString(config.connectorCode);
        if (!rawCode) {
          errors.push(`[${parsed.workflowId}:${nodeId}] data-fetch 缺少 dataSourceCode`);
        } else {
          const normalizedCode = LEGACY_DATA_SOURCE_CODE_MAP[rawCode] ?? rawCode;
          if (!activeConnectors.has(normalizedCode)) {
            errors.push(
              `[${parsed.workflowId}:${nodeId}] data-fetch 引用连接器不存在: ${normalizedCode}`,
            );
          }
        }
      }

      if (nodeType === 'rule-pack-eval') {
        const rulePackCode = readString(config.rulePackCode);
        const rulePackCodes = readStringArray(config.rulePackCodes);
        const includeLayeredPacks = config.includeLayeredPacks === true;
        const selectedCodes = [...new Set([rulePackCode, ...rulePackCodes].filter(Boolean))] as string[];

        if (selectedCodes.length === 0 && !includeLayeredPacks) {
          errors.push(
            `[${parsed.workflowId}:${nodeId}] rule-pack-eval 缺少 rulePackCode(s) 或 includeLayeredPacks`,
          );
        }

        for (const code of selectedCodes) {
          if (!activeRulePacks.has(code)) {
            errors.push(
              `[${parsed.workflowId}:${nodeId}] rule-pack-eval 引用规则包不存在: ${code}`,
            );
          }
        }

        if (includeLayeredPacks) {
          const requestedLayers = readStringArray(config.ruleLayers).map((value) =>
            value.toUpperCase(),
          );
          const singleLayer = readString(config.ruleLayer);
          if (singleLayer) {
            requestedLayers.push(singleLayer.toUpperCase());
          }
          const layers = new Set(requestedLayers);
          const requestedScopes = new Set([
            ...readStringArray(config.applicableScopes),
            ...(readString(config.applicableScope) ? [readString(config.applicableScope)] : []),
          ].filter((value): value is string => Boolean(value)));

          const candidatePackCount = rulePacks.filter((pack) => {
            if (layers.size > 0 && !layers.has(pack.ruleLayer.toUpperCase())) {
              return false;
            }
            if (requestedScopes.size === 0 || pack.applicableScopes.length === 0) {
              return true;
            }
            return pack.applicableScopes.some((scope) => requestedScopes.has(scope));
          }).length;

          if (candidatePackCount === 0) {
            errors.push(
              `[${parsed.workflowId}:${nodeId}] includeLayeredPacks=true 但未命中可用分层规则包`,
            );
          }
        }
      }

      if (nodeType === 'single-agent' || nodeType === 'agent-call') {
        const agentCode =
          readString(config.agentProfileCode) ?? readString(config.agentCode);
        if (!agentCode) {
          errors.push(`[${parsed.workflowId}:${nodeId}] agent 节点缺少 agentCode/agentProfileCode`);
        } else {
          referencedAgentCodes.add(agentCode);
        }
      }

      if (nodeType === 'debate-round') {
        const participants = readArray(config.participants)
          .map((item) => readObject(item))
          .filter((item): item is Record<string, unknown> => Boolean(item));
        if (participants.length === 0) {
          errors.push(`[${parsed.workflowId}:${nodeId}] debate-round 缺少 participants`);
        }
        for (const participant of participants) {
          const participantCode = readString(participant.agentCode);
          if (!participantCode) {
            errors.push(`[${parsed.workflowId}:${nodeId}] debate-round participant 缺少 agentCode`);
            continue;
          }
          referencedAgentCodes.add(participantCode);
        }
      }

      if (nodeType === 'judge-agent') {
        const judgeAgentCode =
          readString(config.judgeAgentCode) ?? readString(config.agentCode);
        if (!judgeAgentCode) {
          errors.push(`[${parsed.workflowId}:${nodeId}] judge-agent 缺少 judgeAgentCode`);
        } else {
          referencedAgentCodes.add(judgeAgentCode);
        }
      }

      if (nodeType === 'risk-gate') {
        const thresholdParamCode = readString(config.thresholdParamCode);
        if (thresholdParamCode && boundSetCodes.length > 0) {
          const hit = boundSetCodes.some((setCode) =>
            activeParameterKeys.has(`${setCode}::${thresholdParamCode}`),
          );
          if (!hit) {
            warnings.push(
              `[${parsed.workflowId}:${nodeId}] thresholdParamCode=${thresholdParamCode} 未在绑定参数集中找到`,
            );
          }
        }
      }

      if (nodeType === 'formula-calc') {
        const refs = readStringArray(config.parameterRefs);
        for (const ref of refs) {
          if (boundSetCodes.length === 0) {
            warnings.push(
              `[${parsed.workflowId}:${nodeId}] parameterRefs=${ref} 存在，但 workflow 未绑定参数集`,
            );
            continue;
          }
          const hit = boundSetCodes.some((setCode) =>
            activeParameterKeys.has(`${setCode}::${ref}`),
          );
          if (!hit) {
            errors.push(
              `[${parsed.workflowId}:${nodeId}] parameterRefs 引用参数不存在: ${ref}`,
            );
          }
        }
      }
    }

    for (const agentCode of referencedAgentCodes) {
      const profile = activeAgentProfiles.get(agentCode);
      if (!profile) {
        errors.push(`[${parsed.workflowId}] AgentProfile 不存在或未激活: ${agentCode}`);
        continue;
      }

      if (!activePromptTemplates.has(profile.agentPromptCode)) {
        errors.push(
          `[${parsed.workflowId}] AgentProfile(${agentCode}) 引用提示词不存在: ${profile.agentPromptCode}`,
        );
      }

      const modelConfigKey = (profile.modelConfigKey || '').trim();
      if (!modelConfigKey) {
        errors.push(`[${parsed.workflowId}] AgentProfile(${agentCode}) 缺少 modelConfigKey`);
        continue;
      }

      if (modelConfigKey.toUpperCase() === 'DEFAULT') {
        if (!defaultModelConfig) {
          errors.push(`[${parsed.workflowId}] AgentProfile(${agentCode}) 使用 DEFAULT，但系统没有默认模型`);
        }
      } else if (!activeModelConfigs.has(modelConfigKey)) {
        errors.push(
          `[${parsed.workflowId}] AgentProfile(${agentCode}) 引用模型不存在: ${modelConfigKey}`,
        );
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`⚠️ 一致性校验警告 ${warnings.length} 条:`);
    warnings.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item}`);
    });
  }

  if (errors.length > 0) {
    console.error(`❌ 工作流种子一致性校验失败，共 ${errors.length} 条:`);
    errors.forEach((item, index) => {
      console.error(`  ${index + 1}. ${item}`);
    });
    throw new Error('workflow seed consistency check failed');
  }

  console.log(`✅ 工作流种子一致性校验通过，已检查 ${definitions.length} 个工作流模板`);
}

verifyWorkflowSeedConsistency()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# 工作流节点契约 - risk-gate

## 1. 目标与范围

本文件定义 `risk-gate` 节点在执行引擎中的运行契约，覆盖：

1. 节点配置输入契约。
2. 执行时输入/输出字段契约。
3. 默认值与优先级。
4. 异常路径与失败语义。
5. 与执行列表筛选、摘要回填的联动约束。

## 2. 实现位置

1. 执行器：`apps/api/src/modules/workflow-execution/engine/node-executors/risk-gate.executor.ts`
2. 摘要提取：`apps/api/src/modules/workflow-execution/workflow-execution.service.ts`
3. 发布校验（必须含节点）：`apps/api/src/modules/workflow-definition/workflow-dsl-validator.ts`
4. 冒烟校验：`apps/api/src/scripts/risk-gate-smoke.ts`

## 3. 节点配置契约

| 配置键 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `riskProfileCode` | `string` | 是 | - | 风控配置标识。为空时抛错并导致节点执行失败。 |
| `blockWhenRiskGte` | `LOW/MEDIUM/HIGH/EXTREME`（支持中英文/数字映射） | 否 | `HIGH`（当快照也未提供） | 风险等级阻断阈值。 |
| `blockerRules` | `string[]` | 否 | `[]` | 基于输入路径的阻断规则，例如 `flags.forceBlock`。 |
| `degradeAction` | `HOLD/REDUCE/REVIEW_ONLY` | 否 | `HOLD` | 仅在阻断时输出；未阻断时输出 `null`。 |
| `hardBlock` | `boolean` | 否 | `false` | `true` 且阻断时，节点状态为 `FAILED`。 |
| `thresholdParamCode` | `string` | 否 | - | 动态阈值快照键（优先级高于 fallback keys）。 |
| `thresholdParamPath` | `string` | 否 | - | 动态阈值快照路径键。 |
| `blockThresholdParamCode` | `string` | 否 | - | 动态阈值快照键（别名）。 |
| `blockThresholdParamPath` | `string` | 否 | - | 动态阈值快照路径键（别名）。 |

## 4. 输入契约（NodeExecutionContext.input）

### 4.1 风险等级来源优先级

按以下顺序解析 `riskLevel`：

1. `input.riskLevel`
2. `input.risk.level`
3. `input.hitScore` / `input.confidence` / `input.score`
4. 全部缺失时默认 `MEDIUM`

### 4.2 支持的风险等级表达

1. 英文：`LOW`/`MEDIUM`/`HIGH`/`EXTREME`
2. 简写：`L`/`M`/`H`/`E`
3. 中文：`低`/`中`/`高`/`极高`
4. 数字映射（四档）：`<=1 LOW`、`<=2 MEDIUM`、`<=3 HIGH`、`>3 EXTREME`

### 4.3 阻断阈值解析优先级

1. `config.blockWhenRiskGte`
2. `paramSnapshot` 动态键（`thresholdParamCode` 等配置项）
3. `paramSnapshot` fallback keys：
   - `SIGNAL_BLOCK_RISK_GTE`
   - `RISK_GATE_BLOCK_WHEN_GTE`
   - `RISK_BLOCK_LEVEL`
   - `risk.blockWhenGte`
4. 以上均未命中时默认 `HIGH`

### 4.4 blockerRules 求值语义

`blockerRules` 的每个路径值按以下规则判定是否“命中阻断”：

1. `boolean`：`true` 命中。
2. `number`：`>0` 命中。
3. `string`：非空且不为 `false`/`0`/`none` 命中。
4. `array`：长度 `>0` 命中。
5. 其他对象：视为命中。

## 5. 输出契约（NodeExecutionResult.output）

节点输出会保留上游输入（`...context.input`），并追加以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `summarySchemaVersion` | `string` | 固定为 `1.0`。 |
| `riskLevel` | enum | 本次解析后的风险等级。 |
| `riskGatePassed` | `boolean` | 是否通过（`!blocked`）。 |
| `riskGateBlocked` | `boolean` | 是否阻断。 |
| `blockers` | `string[]` | 命中的 blocker 路径集合。 |
| `blockerCount` | `number` | 命中数量。 |
| `blockReason` | `string \| null` | 阻断原因文本，未阻断时 `null`。 |
| `degradeAction` | enum \| `null` | 阻断时输出动作，否则 `null`。 |
| `riskProfileCode` | `string` | 配置中的风控模板编码。 |
| `threshold` | enum | 本次生效阻断阈值。 |
| `blockedByRiskLevel` | `boolean` | 是否由风险等级触发阻断。 |
| `hardBlock` | `boolean` | 是否启用硬阻断。 |
| `riskGateNodeId` | `string` | 节点 ID。 |
| `riskEvaluatedAt` | `string` | ISO 时间戳。 |
| `_meta.riskGate.*` | object | 风险决策元信息（profile、threshold、blockerHits 等）。 |

## 6. 状态与异常路径

### 6.1 节点返回状态

1. `blocked && hardBlock=true`：
   - `status=FAILED`
   - `message=风险闸门阻断：...`
2. 其他情况：
   - `status=SUCCESS`
   - 可存在 `riskGateBlocked=true`（软阻断场景）

### 6.2 配置异常

1. `riskProfileCode` 缺失或空字符串时直接抛错。
2. 执行引擎根据节点 runtimePolicy 处理：
   - `onError=FAIL_FAST`：流程失败。
   - `onError=ROUTE_TO_ERROR`：进入错误分支并跳过普通分支。

## 7. 执行实例摘要落库契约

执行引擎会将最新 `risk-gate` 输出提炼到 `workflowExecution.outputSnapshot.riskGate`：

1. 摘要字段来自节点输出与 `_meta.riskGate` 的组合回填。
2. `summarySchemaVersion` 默认回填 `1.0`。
3. `blockerCount` 缺失时按 `blockers.length` 计算。

该摘要用于以下查询字段的主路径过滤：

1. `riskLevel`
2. `degradeAction`
3. `riskProfileCode`
4. `riskReasonKeyword`（匹配 `blockReason`）
5. `hasRiskBlocked`
6. `hasRiskSummary`（判断 `riskGate.summarySchemaVersion` 是否为 `null`）

若摘要缺失，查询会回退到 `nodeExecutions` 的 `risk-gate` 输出字段做兜底匹配。

## 8. 发布校验约束

`PUBLISH` 阶段必须包含至少一个 `risk-gate` 节点：

1. 校验码：`WF104`
2. 提示：`发布前必须包含 risk-gate 节点`

## 9. 示例

### 9.1 节点配置示例

```json
{
  "id": "n2",
  "type": "risk-gate",
  "name": "风险闸门",
  "config": {
    "riskProfileCode": "CORN_RISK_BASE",
    "blockWhenRiskGte": "HIGH",
    "blockerRules": ["flags.forceBlock", "signals.spike"],
    "degradeAction": "HOLD",
    "hardBlock": false
  }
}
```

### 9.2 节点输出示例（阻断）

```json
{
  "summarySchemaVersion": "1.0",
  "riskLevel": "HIGH",
  "riskGatePassed": false,
  "riskGateBlocked": true,
  "blockers": ["flags.forceBlock"],
  "blockerCount": 1,
  "blockReason": "riskLevel=HIGH 达到阻断阈值 HIGH；命中 blockerRules: flags.forceBlock",
  "degradeAction": "HOLD",
  "riskProfileCode": "CORN_RISK_BASE",
  "threshold": "HIGH",
  "blockedByRiskLevel": true,
  "hardBlock": false,
  "riskGateNodeId": "n2",
  "riskEvaluatedAt": "2026-02-11T00:00:00.000Z"
}
```

## 10. 回归清单

1. `pnpm --filter api run workflow:risk-gate:smoke`
2. `pnpm --filter api run workflow:execution-filters:smoke`
3. `pnpm --filter api run test:e2e:workflow-execution-filters`
4. `pnpm workflow:smoke:gate`

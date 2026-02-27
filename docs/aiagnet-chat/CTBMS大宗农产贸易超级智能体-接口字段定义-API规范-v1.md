# CTBMS 大宗农产贸易超级智能体 API 字段级规范 v1.0

- 协议：REST + JSON
- 鉴权：沿用现有登录态（`req.user.id`）
- 统一错误结构：`{ code, message, details?, traceId? }`
- 对应 PRD：`docs/aiagnet-chat/CTBMS大宗农产贸易超级智能体-产品需求文档-PRD-v1.md`

## 1. 通用约定

## 1.0 响应包络（推荐）

```json
{
  "success": true,
  "data": {},
  "traceId": "tr_xxx",
  "ts": "2026-02-27T09:00:00.000Z"
}
```

异常响应：

```json
{
  "success": false,
  "error": {
    "code": "SA_422_QUALITY_GATE_BLOCKED",
    "message": "质量门禁阻断",
    "details": {}
  },
  "traceId": "tr_xxx"
}
```

## 1.1 分页参数

请求参数：

- `page`：默认 `1`
- `pageSize`：默认 `20`，最大 `200`

响应结构：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 100
}
```

## 1.2 枚举值（首版）

1. `FreshnessStatus`: `WITHIN_TTL | NEAR_EXPIRE | EXPIRED`
2. `QualityLevel`: `HIGH | MEDIUM | LOW`
3. `AlertSeverity`: `LOW | MEDIUM | HIGH | CRITICAL`
4. `DeliveryChannel`: `EMAIL | WECOM | DINGTALK | FEISHU`

## 1.3 接口实施策略（防重复）

1. 后端标准接口统一使用现有 `agent-conversations/sessions/*`。
2. 如需对外品牌化路径，`/super-agent/*` 只做网关别名映射，不新增重复服务层实现。
3. 订阅、回测、导出、投递沿用现有会话域资源模型，避免平行资源域。

## 1.4 请求头约定

1. `Authorization: Bearer <token>`
2. `X-Trace-Id: <traceId>`（客户端可传，服务端兜底生成）
3. `Idempotency-Key: <uuid>`（所有可重试写接口建议必传）
4. `X-Client-Version: <semver>`（用于灰度和问题定位）

## 1.5 版本与兼容策略

1. 当前版本：`v1`（路径不带版本，采用文档版本控制）。
2. 破坏性变更必须提供 1 个发布周期兼容窗口。
3. 弃用接口需返回 `Deprecation` 响应头并在文档标注下线日期。

## 2. 数据接入中心 API

## 2.1 创建 Connector

- `POST /data-connectors`

请求：

```json
{
  "code": "weather_openapi_cn",
  "name": "天气开放平台",
  "sourceType": "WEATHER_API",
  "baseUrl": "https://api.example.com/weather",
  "authConfig": {
    "type": "API_KEY",
    "headerName": "X-API-KEY",
    "secretRef": "weather_key_prod"
  },
  "requestSchema": {
    "type": "object"
  },
  "responseSchema": {
    "type": "object"
  },
  "retryPolicy": {
    "maxRetries": 2,
    "backoffMs": 500
  },
  "timeoutMs": 5000,
  "rateLimitQps": 10,
  "ttlSeconds": 21600
}
```

响应：

```json
{
  "id": "dc_xxx",
  "code": "weather_openapi_cn",
  "status": "ACTIVE",
  "createdAt": "2026-02-26T10:00:00.000Z"
}
```

## 2.2 查询 Connector 列表

- `GET /data-connectors?sourceType=WEATHER_API&status=ACTIVE`

响应：

```json
{
  "items": [
    {
      "id": "dc_xxx",
      "code": "weather_openapi_cn",
      "sourceType": "WEATHER_API",
      "status": "ACTIVE",
      "lastHealthStatus": "HEALTHY",
      "updatedAt": "2026-02-26T10:30:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

## 2.3 Connector 健康检查

- `POST /data-connectors/:id/health-check`

响应：

```json
{
  "healthy": true,
  "latencyMs": 132,
  "errorRate24h": 0.002,
  "checkedAt": "2026-02-26T10:45:00.000Z"
}
```

## 3. 市场数据查询 API

## 3.1 统一数据查询

- `POST /market-data/query`

请求：

```json
{
  "dataset": "SPOT_PRICE",
  "dimensions": {
    "commodityCode": "CORN",
    "regionCode": "CN_NE"
  },
  "timeRange": {
    "from": "2026-02-01T00:00:00+08:00",
    "to": "2026-02-26T23:59:59+08:00"
  },
  "granularity": "1d",
  "limit": 200
}
```

响应：

```json
{
  "rows": [
    {
      "dataTime": "2026-02-25T00:00:00+08:00",
      "spotPrice": 2360.5,
      "currency": "CNY",
      "unit": "CNY/TON"
    }
  ],
  "meta": {
    "freshnessStatus": "WITHIN_TTL",
    "qualityScore": 0.94,
    "sourceSummary": ["INTERNAL", "PUBLIC"]
  }
}
```

## 3.2 聚合查询

- `POST /market-data/aggregate`

请求：

```json
{
  "dataset": "FUTURES_QUOTE",
  "groupBy": ["contractCode"],
  "metrics": [
    { "field": "closePrice", "op": "avg", "as": "avgClose" },
    { "field": "volume", "op": "sum", "as": "sumVolume" }
  ],
  "timeRange": {
    "from": "2026-02-20T00:00:00+08:00",
    "to": "2026-02-26T23:59:59+08:00"
  }
}
```

## 3.3 存量标准化预览

- `POST /market-data/standardization/preview`

用途：对指定 legacy 数据执行标准化映射预览，不落库。

请求：

```json
{
  "dataset": "PRICE_DATA",
  "sampleLimit": 50,
  "mappingVersion": "v1",
  "filters": {
    "commodity": "玉米",
    "dateFrom": "2026-02-01"
  }
}
```

响应：

```json
{
  "previewRows": [
    {
      "legacy": { "commodity": "玉米", "price": 2360 },
      "standard": { "commodityCode": "CORN", "spotPrice": 2360 }
    }
  ],
  "mappingVersion": "v1",
  "issues": []
}
```

## 3.4 数据血缘查询

- `GET /market-data/lineage?dataset=SPOT_PRICE&recordId=xxx`

响应：

```json
{
  "dataset": "SPOT_PRICE",
  "recordId": "sp_xxx",
  "source": {
    "sourceType": "INTERNAL",
    "sourceRecordId": "legacy_price_xxx"
  },
  "mapping": {
    "mappingVersion": "v1",
    "ruleSetId": "map_rule_xxx"
  },
  "derivedMetrics": ["BASIS_MAIN"]
}
```

## 3.5 双跑对账任务

### 3.5.1 创建对账任务

- `POST /market-data/reconciliation/jobs`

请求：

```json
{
  "dataset": "SPOT_PRICE",
  "timeRange": {
    "from": "2026-02-20T00:00:00+08:00",
    "to": "2026-02-26T23:59:59+08:00"
  },
  "dimensions": {
    "commodityCode": "CORN",
    "regionCode": "CN_NE"
  },
  "threshold": {
    "maxDiffRate": 0.01,
    "maxMissingRate": 0.005
  }
}
```

响应：

```json
{
  "jobId": "rc_job_xxx",
  "status": "RUNNING",
  "retriedFromJobId": null,
  "retryCount": 0
}
```

### 3.5.2 查询对账任务列表

- `GET /market-data/reconciliation/jobs?page=1&pageSize=20&dataset=SPOT_PRICE&status=DONE&pass=true&createdAtFrom=2026-02-01T00:00:00Z&createdAtTo=2026-02-29T23:59:59Z&sortBy=createdAt&sortOrder=desc`

说明：

- `sortBy` 白名单：`createdAt | startedAt | finishedAt | status | dataset`
- `sortOrder`：`asc | desc`
- `pass`：可选，`true | false`，用于筛选对账结论（`summary.pass`）
- `retryCount`：首次任务为 `0`，每次重试 +1；`retriedFromJobId` 标记来源任务
- `status` 可选值：`PENDING | RUNNING | DONE | FAILED | CANCELLED`

响应：

```json
{
  "items": [
    {
      "jobId": "rc_job_xxx",
      "status": "DONE",
      "dataset": "SPOT_PRICE",
      "retriedFromJobId": null,
      "retryCount": 0,
      "createdAt": "2026-02-27T08:00:00.000Z",
      "startedAt": "2026-02-27T08:00:01.000Z",
      "finishedAt": "2026-02-27T08:00:20.000Z",
      "summaryPass": true,
      "summary": {
        "diffRate": 0.004,
        "missingRate": 0.001,
        "conflictRate": 0.012,
        "pass": true
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 8,
  "totalPages": 1,
  "storage": "database"
}
```

### 3.5.3 查询单个对账任务结果

- `GET /market-data/reconciliation/jobs/:jobId`

响应：

```json
{
  "jobId": "rc_job_xxx",
  "status": "DONE",
  "dataset": "SPOT_PRICE",
  "retriedFromJobId": null,
  "retryCount": 0,
  "summaryPass": true,
  "summary": {
    "diffRate": 0.004,
    "missingRate": 0.001,
    "conflictRate": 0.012,
    "pass": true
  },
  "sampleDiffs": []
}
```

### 3.5.4 重试对账任务

- `POST /market-data/reconciliation/jobs/:jobId/retry`

响应：

```json
{
  "jobId": "rc_job_new_xxx",
  "status": "DONE",
  "dataset": "SPOT_PRICE",
  "retryCount": 1,
  "createdAt": "2026-02-27T08:10:00.000Z",
  "retriedFromJobId": "rc_job_xxx"
}
```

说明：

- 仅允许重试 `DONE | FAILED | CANCELLED` 状态任务。

### 3.5.5 取消对账任务

- `POST /market-data/reconciliation/jobs/:jobId/cancel`

请求：

```json
{
  "reason": "manual cancel from console"
}
```

响应：

```json
{
  "jobId": "rc_job_xxx",
  "status": "CANCELLED",
  "dataset": "SPOT_PRICE",
  "retriedFromJobId": null,
  "retryCount": 0,
  "cancelledAt": "2026-02-27T08:20:00.000Z",
  "cancelReason": "manual cancel from console"
}
```

说明：

- 仅允许取消 `PENDING | RUNNING` 状态任务。

### 3.5.6 对账门禁诊断

- `POST /market-data/reconciliation/gate/evaluate`

请求：

```json
{
  "dataset": "SPOT_PRICE",
  "filters": {
    "commodityCode": "CORN",
    "regionCode": "CN_NE"
  },
  "maxAgeMinutes": 1440
}
```

响应：

```json
{
  "enabled": true,
  "passed": false,
  "reason": "latest_outdated",
  "checkedAt": "2026-02-27T09:10:00.000Z",
  "maxAgeMinutes": 1440,
  "ageMinutes": 2880.5,
  "latest": {
    "jobId": "rc_job_xxx",
    "status": "DONE",
    "retriedFromJobId": null,
    "retryCount": 0,
    "summaryPass": true,
    "createdAt": "2026-02-25T09:00:00.000Z",
    "finishedAt": "2026-02-25T09:00:10.000Z",
    "source": "database"
  }
}
```

`reason` 枚举：

- `gate_disabled`
- `no_reconciliation_job`
- `latest_status_not_done`
- `latest_summary_not_passed`
- `latest_time_invalid`
- `latest_outdated`
- `gate_passed`

### 3.5.7 对账窗口达标统计

- `GET /market-data/reconciliation/metrics/window?dataset=SPOT_PRICE&days=7`

响应：

```json
{
  "dataset": "SPOT_PRICE",
  "windowDays": 7,
  "fromDate": "2026-02-21T00:00:00.000Z",
  "toDate": "2026-02-27T09:30:00.000Z",
  "source": "database",
  "totalJobs": 7,
  "doneJobs": 7,
  "passedJobs": 7,
  "daily": [
    {
      "date": "2026-02-21",
      "totalJobs": 1,
      "doneJobs": 1,
      "passedJobs": 1,
      "passed": true,
      "latestJobId": "rc_job_a"
    }
  ],
  "consecutivePassedDays": 7,
  "meetsWindowTarget": true
}
```

说明：

- `passed` 口径：当日有 `DONE` 任务且全部 `summaryPass=true`。
- `meetsWindowTarget=true` 表示窗口内每日均达标（可用于 M1 连续 7 天门禁）。

### 3.5.8 手动生成对账窗口快照

- `POST /market-data/reconciliation/metrics/snapshot`

请求：

```json
{
  "windowDays": 7,
  "datasets": ["SPOT_PRICE", "FUTURES_QUOTE", "MARKET_EVENT"]
}
```

响应：

```json
{
  "generatedAt": "2026-02-27T10:00:00.000Z",
  "windowDays": 7,
  "source": "database",
  "results": [
    {
      "dataset": "SPOT_PRICE",
      "totalJobs": 7,
      "passedJobs": 7,
      "consecutivePassedDays": 7,
      "meetsWindowTarget": true
    }
  ]
}
```

说明：

- 系统默认每日 `00:10` 自动生成一次 7 天窗口快照；该接口用于补跑或即时诊断。

### 3.5.9 查询历史日指标快照

- `GET /market-data/reconciliation/metrics/daily?dataset=SPOT_PRICE&windowDays=7&days=30`

响应：

```json
{
  "dataset": "SPOT_PRICE",
  "windowDays": 7,
  "days": 30,
  "source": "database",
  "items": [
    {
      "metricDate": "2026-02-27T00:00:00.000Z",
      "totalJobs": 1,
      "doneJobs": 1,
      "passedJobs": 1,
      "dayPassed": true,
      "consecutivePassedDays": 7,
      "meetsWindowTarget": true,
      "generatedAt": "2026-02-27T00:10:00.000Z"
    }
  ]
}
```

### 3.5.10 标准层读取覆盖率统计

- `POST /market-data/reconciliation/metrics/read-coverage`

请求：

```json
{
  "days": 7,
  "targetCoverageRate": 0.9,
  "workflowVersionIds": ["1ccf29d6-7d24-4a66-a2d1-8c3998c0a93d"]
}
```

响应：

```json
{
  "windowDays": 7,
  "fromDate": "2026-02-21T00:00:00.000Z",
  "toDate": "2026-02-27T10:05:00.000Z",
  "targetCoverageRate": 0.9,
  "totalDataFetchNodes": 128,
  "standardReadNodes": 118,
  "legacyReadNodes": 10,
  "otherSourceNodes": 0,
  "gateEvaluatedNodes": 120,
  "gatePassedNodes": 116,
  "coverageRate": 0.921875,
  "meetsCoverageTarget": true,
  "consecutiveCoverageDays": 5,
  "daily": [
    {
      "date": "2026-02-27",
      "totalDataFetchNodes": 18,
      "standardReadNodes": 17,
      "legacyReadNodes": 1,
      "otherSourceNodes": 0,
      "gateEvaluatedNodes": 18,
      "gatePassedNodes": 17,
      "coverageRate": 0.944444,
      "meetsTarget": true
    }
  ]
}
```

说明：

- `coverageRate = standardReadNodes / totalDataFetchNodes`。
- 可用于 M1 验收阈值（核心模板标准层读取覆盖率目标）。

### 3.5.11 新增切流回滚演练记录

- `POST /market-data/reconciliation/drills`

请求：

```json
{
  "dataset": "SPOT_PRICE",
  "workflowVersionId": "1ccf29d6-7d24-4a66-a2d1-8c3998c0a93d",
  "scenario": "standard_to_legacy_weekly_report",
  "status": "PASSED",
  "startedAt": "2026-02-27T10:30:00.000Z",
  "completedAt": "2026-02-27T10:33:00.000Z",
  "durationSeconds": 180,
  "rollbackPath": "STANDARD_READ->LEGACY_READ",
  "resultSummary": {
    "rollbackSuccess": true,
    "templateResultStable": true
  },
  "notes": "M1 gate rehearsal"
}
```

### 3.5.12 查询切流回滚演练记录

- `GET /market-data/reconciliation/drills?page=1&pageSize=20&dataset=SPOT_PRICE&status=PASSED`

响应：

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 3,
  "totalPages": 1,
  "storage": "database",
  "items": [
    {
      "drillId": "drill_20260227_01",
      "dataset": "SPOT_PRICE",
      "workflowVersionId": "1ccf29d6-7d24-4a66-a2d1-8c3998c0a93d",
      "scenario": "standard_to_legacy_weekly_report",
      "status": "PASSED",
      "startedAt": "2026-02-27T10:30:00.000Z",
      "completedAt": "2026-02-27T10:33:00.000Z",
      "durationSeconds": 180,
      "rollbackPath": "STANDARD_READ->LEGACY_READ",
      "triggeredByUserId": "admin-user",
      "createdAt": "2026-02-27T10:33:10.000Z"
    }
  ]
}
```

### 3.5.13 M1 验收就绪视图

- `GET /market-data/reconciliation/metrics/m1-readiness?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE&datasets=FUTURES_QUOTE`

响应：

```json
{
  "generatedAt": "2026-02-27T10:40:00.000Z",
  "windowDays": 7,
  "datasets": ["SPOT_PRICE", "FUTURES_QUOTE"],
  "summary": {
    "meetsReconciliationTarget": true,
    "meetsCoverageTarget": true,
    "hasRecentRollbackDrillEvidence": true,
    "ready": true
  },
  "coverage": {
    "windowDays": 7,
    "targetCoverageRate": 0.9,
    "coverageRate": 0.92
  },
  "reconciliation": [
    {
      "dataset": "SPOT_PRICE",
      "meetsWindowTarget": true,
      "consecutivePassedDays": 7,
      "totalJobs": 7,
      "passedJobs": 7,
      "source": "database"
    }
  ],
  "rollbackDrills": [
    {
      "dataset": "SPOT_PRICE",
      "exists": true,
      "recent": true,
      "passed": true,
      "drillId": "drill_20260227_01",
      "status": "PASSED",
      "createdAt": "2026-02-27T10:33:10.000Z"
    }
  ]
}
```

说明：

- `ready=true` 需同时满足：
  - 各数据域 `meetsWindowTarget=true`；
  - `coverage.meetsCoverageTarget=true`；
  - 各数据域都有最近窗口内且 `PASSED` 的回滚演练记录。

### 3.5.14 M1 验收就绪报告导出

- `GET /market-data/reconciliation/metrics/m1-readiness/report?windowDays=7&targetCoverageRate=0.9&datasets=SPOT_PRICE&format=markdown`

参数：

- `format`：`markdown`（默认）或 `json`

响应（`format=markdown`）：

```json
{
  "format": "markdown",
  "generatedAt": "2026-02-27T10:45:00.000Z",
  "fileName": "reconciliation-m1-readiness-2026-02-27.md",
  "readiness": {
    "generatedAt": "2026-02-27T10:44:58.000Z",
    "windowDays": 7,
    "datasets": ["SPOT_PRICE"],
    "summary": {
      "meetsReconciliationTarget": true,
      "meetsCoverageTarget": true,
      "hasRecentRollbackDrillEvidence": true,
      "ready": true
    }
  },
  "report": "# Reconciliation M1 Readiness Report\n..."
}
```

响应（`format=json`）：

```json
{
  "format": "json",
  "generatedAt": "2026-02-27T10:45:00.000Z",
  "fileName": "reconciliation-m1-readiness-2026-02-27.json",
  "readiness": {
    "windowDays": 7,
    "datasets": ["SPOT_PRICE"]
  },
  "report": {
    "windowDays": 7,
    "datasets": ["SPOT_PRICE"]
  }
}
```

### 3.5.15 M1 验收就绪报告快照

- 创建快照：`POST /market-data/reconciliation/metrics/m1-readiness/report/snapshots`

请求：

```json
{
  "format": "markdown",
  "windowDays": 7,
  "targetCoverageRate": 0.9,
  "datasets": ["SPOT_PRICE"]
}
```

响应：

```json
{
  "snapshotId": "2f564dd4-09e1-4d32-a6be-9f70094f75b2",
  "format": "markdown",
  "fileName": "reconciliation-m1-readiness-2026-02-27.md",
  "windowDays": 7,
  "targetCoverageRate": 0.9,
  "datasets": ["SPOT_PRICE"],
  "readiness": {
    "summary": {
      "ready": true
    }
  },
  "storage": "database",
  "createdAt": "2026-02-27T11:10:00.000Z"
}
```

- 列表：`GET /market-data/reconciliation/metrics/m1-readiness/report/snapshots?page=1&pageSize=20&format=markdown`

响应：

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 2,
  "totalPages": 1,
  "storage": "database",
  "items": [
    {
      "snapshotId": "2f564dd4-09e1-4d32-a6be-9f70094f75b2",
      "format": "markdown",
      "fileName": "reconciliation-m1-readiness-2026-02-27.md",
      "windowDays": 7,
      "targetCoverageRate": 0.9,
      "datasets": ["SPOT_PRICE"],
      "summary": {
        "ready": true
      },
      "createdAt": "2026-02-27T11:10:00.000Z"
    }
  ]
}
```

- 详情：`GET /market-data/reconciliation/metrics/m1-readiness/report/snapshots/{snapshotId}`

说明：

- 快照是验收证据固化对象，用于追溯某次 gate 判定时刻的完整上下文。

### 3.5.16 M1 切流决策记录

- 创建决策：`POST /market-data/reconciliation/cutover/decisions`

请求：

```json
{
  "windowDays": 7,
  "targetCoverageRate": 0.9,
  "datasets": ["SPOT_PRICE"],
  "reportFormat": "markdown",
  "note": "M1 gate decision"
}
```

响应：

```json
{
  "decisionId": "8f901ce2-7094-4f4d-940d-6e3fcb7cd95c",
  "status": "APPROVED",
  "reasonCodes": [],
  "windowDays": 7,
  "targetCoverageRate": 0.9,
  "datasets": ["SPOT_PRICE"],
  "reportFormat": "markdown",
  "reportSnapshotId": "2f564dd4-09e1-4d32-a6be-9f70094f75b2",
  "readinessSummary": {
    "meetsReconciliationTarget": true,
    "meetsCoverageTarget": true,
    "hasRecentRollbackDrillEvidence": true,
    "ready": true
  },
  "storage": "database",
  "createdAt": "2026-02-27T11:12:00.000Z"
}
```

- 列表：`GET /market-data/reconciliation/cutover/decisions?page=1&pageSize=20&status=APPROVED`
- 详情：`GET /market-data/reconciliation/cutover/decisions/{decisionId}`

说明：

- `status=APPROVED` 表示当前验收门已满足，可执行切流；
- `status=REJECTED` 时 `reasonCodes` 提供阻断原因：
  - `reconciliation_target_not_met`
  - `coverage_target_not_met`
  - `rollback_drill_evidence_missing`

### 3.5.17 执行切流门控

- `POST /market-data/reconciliation/cutover/execute`

请求：

```json
{
  "windowDays": 7,
  "targetCoverageRate": 0.9,
  "datasets": ["SPOT_PRICE"],
  "reportFormat": "markdown",
  "note": "execute cutover gate"
}
```

响应：

```json
{
  "executionId": "0be9c0dc-3557-4fcc-b03f-90bc8d281b31",
  "executedAt": "2026-02-27T11:18:00.000Z",
  "decision": {
    "decisionId": "a8d7eae9-7f5d-4f4e-b64e-8a1b3fb6f1bd",
    "status": "APPROVED"
  },
  "applied": true,
  "config": {
    "standardizedRead": {
      "before": false,
      "after": true
    },
    "reconciliationGate": {
      "before": false,
      "after": true
    }
  }
}
```

说明：

- `decision.status=APPROVED` 时自动执行切流：
  - `workflow standardized read mode = true`
  - `workflow reconciliation gate enabled = true`
- `decision.status=REJECTED` 时不改动运行开关（`applied=false`）。

### 3.5.18 执行回滚门控

- `POST /market-data/reconciliation/cutover/rollback`

请求：

```json
{
  "datasets": ["SPOT_PRICE"],
  "disableReconciliationGate": true,
  "note": "execute rollback gate",
  "reason": "stability drill"
}
```

响应：

```json
{
  "executionId": "24a7d516-c217-4058-b15c-ac90ea2ba8df",
  "executedAt": "2026-02-27T11:26:00.000Z",
  "applied": true,
  "datasets": ["SPOT_PRICE"],
  "config": {
    "standardizedRead": {
      "before": true,
      "after": false
    },
    "reconciliationGate": {
      "before": true,
      "after": false
    }
  },
  "rollbackDrills": [
    {
      "drillId": "24e5471a-c2ab-4f7d-b75a-8c3b4f9c26f8",
      "dataset": "SPOT_PRICE",
      "status": "PASSED",
      "storage": "database",
      "createdAt": "2026-02-27T11:26:00.000Z"
    }
  ]
}
```

说明：

- 执行回滚时会自动固化回滚演练证据（`DataReconciliationRollbackDrill`）；
- `disableReconciliationGate=true` 时同时关闭 reconciliation gate；
- 标准回滚路径默认是 `standard -> legacy`。

### 3.5.19 切流运行态总览

- `GET /market-data/reconciliation/cutover/runtime-status?datasets=SPOT_PRICE`

响应：

```json
{
  "generatedAt": "2026-02-27T11:27:00.000Z",
  "datasets": ["SPOT_PRICE"],
  "config": {
    "standardizedRead": {
      "enabled": false,
      "source": "DB",
      "updatedAt": "2026-02-27T11:26:00.000Z"
    },
    "reconciliationGate": {
      "enabled": false,
      "source": "DB",
      "updatedAt": "2026-02-27T11:26:00.000Z"
    }
  },
  "latestCutoverDecision": {
    "decisionId": "a8d7eae9-7f5d-4f4e-b64e-8a1b3fb6f1bd",
    "status": "APPROVED",
    "reasonCodes": [],
    "createdAt": "2026-02-27T11:18:00.000Z",
    "reportSnapshotId": "2f564dd4-09e1-4d32-a6be-9f70094f75b2"
  },
  "rollbackDrillEvidence": [
    {
      "dataset": "SPOT_PRICE",
      "exists": true,
      "recent": true,
      "passed": true,
      "drillId": "24e5471a-c2ab-4f7d-b75a-8c3b4f9c26f8",
      "createdAt": "2026-02-27T11:26:00.000Z"
    }
  ],
  "executionHealth": {
    "windowDays": 7,
    "compensationPendingExecutions": 0,
    "hasCompensationBacklog": false,
    "latestCompensationPendingExecution": null
  },
  "summary": {
    "standardizedReadEnabled": false,
    "reconciliationGateEnabled": false,
    "hasRecentRollbackEvidenceAllDatasets": true,
    "latestDecisionApproved": true,
    "hasUncompensatedExecutionFailure": false,
    "recommendsRollback": false
  }
}
```

### 3.5.20 自动驾驶切流（Autopilot）

- `POST /market-data/reconciliation/cutover/autopilot`

请求：

```json
{
  "windowDays": 7,
  "targetCoverageRate": 0.9,
  "datasets": ["SPOT_PRICE"],
  "reportFormat": "markdown",
  "onRejectedAction": "ROLLBACK",
  "disableReconciliationGate": true,
  "rollbackReason": "autopilot_rejected",
  "dryRun": false,
  "note": "autopilot gate execution"
}
```

响应（示例：通过并切流）：

```json
{
  "executionId": "3ddf6dd9-6e4d-4b7d-9e32-a2d5ed3c83f2",
  "executedAt": "2026-02-27T11:34:00.000Z",
  "action": "CUTOVER",
  "dryRun": false,
  "decision": {
    "decisionId": "42fc0189-b24f-4f7f-bbff-2ff9fd2fba17",
    "status": "APPROVED",
    "reasonCodes": [],
    "reportSnapshotId": "2f564dd4-09e1-4d32-a6be-9f70094f75b2",
    "createdAt": "2026-02-27T11:34:00.000Z"
  },
  "cutover": {
    "applied": true,
    "config": {
      "standardizedRead": {
        "before": false,
        "after": true
      },
      "reconciliationGate": {
        "before": false,
        "after": true
      }
    }
  }
}
```

响应（示例：不通过并回滚）：

```json
{
  "executionId": "4cc3eb73-0b8f-4270-907d-f08fbb866ecc",
  "executedAt": "2026-02-27T11:35:00.000Z",
  "action": "ROLLBACK",
  "dryRun": false,
  "decision": {
    "decisionId": "91c77e75-f8e6-47f9-bb42-8e56f446d0b8",
    "status": "REJECTED",
    "reasonCodes": ["coverage_target_not_met"],
    "reportSnapshotId": "f2f4403f-b253-4ab6-bfd5-eb4dd117a6d6",
    "createdAt": "2026-02-27T11:35:00.000Z"
  },
  "rollback": {
    "applied": true,
    "datasets": ["SPOT_PRICE"],
    "rollbackDrills": [
      {
        "drillId": "24e5471a-c2ab-4f7d-b75a-8c3b4f9c26f8",
        "dataset": "SPOT_PRICE",
        "status": "PASSED"
      }
    ]
  }
}
```

说明：

- `dryRun=true` 仅生成决策，不改动任何运行态开关；
- `onRejectedAction=ROLLBACK` 会在验收不通过时自动执行回滚并写入回滚演练证据。

### 3.5.21 切流执行日志与补偿

- 列表：`GET /market-data/reconciliation/cutover/executions?page=1&pageSize=20&action=AUTOPILOT&status=SUCCESS`

响应：

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 3,
  "totalPages": 1,
  "storage": "database",
  "items": [
    {
      "executionId": "3ddf6dd9-6e4d-4b7d-9e32-a2d5ed3c83f2",
      "action": "AUTOPILOT",
      "status": "SUCCESS",
      "requestedByUserId": "admin-user",
      "datasets": ["SPOT_PRICE"],
      "applied": true,
      "createdAt": "2026-02-27T11:35:00.000Z"
    }
  ]
}
```

- 详情：`GET /market-data/reconciliation/cutover/executions/{executionId}`

响应：

```json
{
  "executionId": "3ddf6dd9-6e4d-4b7d-9e32-a2d5ed3c83f2",
  "action": "ROLLBACK",
  "status": "SUCCESS",
  "datasets": ["SPOT_PRICE"],
  "applied": true,
  "configBefore": {
    "standardizedRead": true,
    "reconciliationGate": true
  },
  "configAfter": {
    "standardizedRead": false,
    "reconciliationGate": false
  },
  "stepTrace": [
    {
      "step": "set_standardized_read_false",
      "status": "SUCCESS"
    }
  ],
  "compensationApplied": false,
  "createdAt": "2026-02-27T11:26:00.000Z",
  "storage": "database"
}
```

- 补偿重试：`POST /market-data/reconciliation/cutover/executions/{executionId}/compensate`

请求：

```json
{
  "disableReconciliationGate": true,
  "reason": "manual_compensation"
}
```

响应（不可补偿状态）：

```json
{
  "executionId": "3ddf6dd9-6e4d-4b7d-9e32-a2d5ed3c83f2",
  "compensated": false,
  "reason": "execution_status_not_compensatable"
}
```

响应（补偿成功）：

```json
{
  "executionId": "3ddf6dd9-6e4d-4b7d-9e32-a2d5ed3c83f2",
  "compensated": true,
  "compensationExecutionId": "f6f0ad5a-cb22-4092-bf4a-17caacde4e17",
  "execution": {
    "executionId": "3ddf6dd9-6e4d-4b7d-9e32-a2d5ed3c83f2",
    "status": "COMPENSATED",
    "compensationApplied": true,
    "compensationAt": "2026-02-27T11:39:12.000Z"
  }
}
```

说明：

- 执行日志状态：`SUCCESS | FAILED | PARTIAL | COMPENSATED`；
- 补偿会触发标准回滚流程，并在成功后将原执行标记为 `COMPENSATED`；
- 若补偿失败，会保留原执行状态（`FAILED|PARTIAL`）、写入 `compensationError` 并追加失败 `stepTrace`。

### 3.5.22 切流执行健康总览

- `GET /market-data/reconciliation/cutover/executions/overview?windowDays=7&datasets=SPOT_PRICE&pendingLimit=10`

响应：

```json
{
  "generatedAt": "2026-02-27T11:41:00.000Z",
  "windowDays": 7,
  "datasets": ["SPOT_PRICE"],
  "storage": "database",
  "summary": {
    "totalExecutions": 6,
    "successExecutions": 4,
    "failedExecutions": 1,
    "partialExecutions": 0,
    "compensatedExecutions": 1,
    "compensationPendingExecutions": 1,
    "compensationCoverageRate": 0.5
  },
  "byAction": [
    {
      "action": "CUTOVER",
      "total": 1,
      "success": 1,
      "failed": 0,
      "partial": 0,
      "compensated": 0,
      "compensationPending": 0
    },
    {
      "action": "ROLLBACK",
      "total": 2,
      "success": 2,
      "failed": 0,
      "partial": 0,
      "compensated": 0,
      "compensationPending": 0
    },
    {
      "action": "AUTOPILOT",
      "total": 3,
      "success": 1,
      "failed": 1,
      "partial": 0,
      "compensated": 1,
      "compensationPending": 1
    }
  ],
  "latestCompensationPending": [
    {
      "executionId": "9f39b956-a601-42af-ac19-f10dbf79f07a",
      "action": "AUTOPILOT",
      "status": "FAILED",
      "createdAt": "2026-02-27T11:40:10.000Z",
      "datasets": ["SPOT_PRICE"],
      "errorMessage": "forced_autopilot_failure_for_compensation_error_path"
    }
  ]
}
```

说明：

- `compensationPendingExecutions` 表示当前仍处于 `FAILED|PARTIAL` 且未补偿的执行；
- `compensationCoverageRate = COMPENSATED / (FAILED + PARTIAL + COMPENSATED)`，用于衡量补偿闭环覆盖率。

### 3.5.23 批量补偿待处理执行

- `POST /market-data/reconciliation/cutover/executions/compensate-batch`

请求：

```json
{
  "windowDays": 7,
  "datasets": ["SPOT_PRICE"],
  "limit": 10,
  "dryRun": false,
  "idempotencyKey": "market-data-batch-execute",
  "maxConcurrency": 3,
  "perExecutionTimeoutMs": 15000,
  "stopOnFailureCount": 5,
  "stopOnFailureRate": 0.8,
  "minProcessedForFailureRate": 1,
  "disableReconciliationGate": true,
  "reason": "batch_compensation_retry"
}
```

响应：

```json
{
  "batchId": "8b169b86-17a9-4174-8f17-90d4e4ec50b0",
  "status": "PARTIAL",
  "replayed": false,
  "generatedAt": "2026-02-27T11:43:00.000Z",
  "dryRun": false,
  "windowDays": 7,
  "datasets": ["SPOT_PRICE"],
  "idempotencyKey": "market-data-batch-execute",
  "requestedLimit": 10,
  "storage": "database",
  "control": {
    "maxConcurrency": 3,
    "perExecutionTimeoutMs": 15000,
    "stopOnFailureCount": 5,
    "stopOnFailureRate": 0.8,
    "minProcessedForFailureRate": 1
  },
  "scanned": 6,
  "matched": 2,
  "attempted": 2,
  "results": [
    {
      "executionId": "9f39b956-a601-42af-ac19-f10dbf79f07a",
      "action": "AUTOPILOT",
      "statusBefore": "FAILED",
      "compensated": true,
      "compensationExecutionId": "45a17c00-cdf5-4c48-80da-2d0f02e36cb0"
    },
    {
      "executionId": "4cb4d62f-4d4f-4701-a9a4-5084be8341b3",
      "action": "AUTOPILOT",
      "statusBefore": "PARTIAL",
      "compensated": false,
      "error": "rollback execution failed"
    }
  ],
  "summary": {
    "compensated": 1,
    "failed": 1,
    "skipped": 0,
    "processed": 2,
    "breakerTriggered": false,
    "breakerReason": null
  }
}
```

说明：

- `dryRun=true` 时仅返回候选执行，不触发真实补偿；
- 批量补偿对每条执行独立处理，单条失败不会阻断后续执行；
- 传入相同 `idempotencyKey` 可复用历史批量结果，响应中 `replayed=true`；
- `maxConcurrency`、`perExecutionTimeoutMs`、`stopOnFailureCount|Rate` 用于并发执行和熔断控制。

### 3.5.24 查询批量补偿记录

- 列表：`GET /market-data/reconciliation/cutover/executions/compensation-batches?page=1&pageSize=20&status=PARTIAL&replayed=false`

响应：

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "totalPages": 1,
  "storage": "database",
  "items": [
    {
      "batchId": "8b169b86-17a9-4174-8f17-90d4e4ec50b0",
      "status": "PARTIAL",
      "dryRun": false,
      "replayed": false,
      "idempotencyKey": "market-data-batch-execute",
      "windowDays": 7,
      "datasets": ["SPOT_PRICE"],
      "requestedLimit": 10,
      "scanned": 6,
      "matched": 2,
      "attempted": 2,
      "summary": {
        "compensated": 1,
        "failed": 1,
        "skipped": 0
      },
      "createdAt": "2026-02-27T11:43:00.000Z"
    }
  ]
}
```

- 详情：`GET /market-data/reconciliation/cutover/executions/compensation-batches/{batchId}`

响应：

```json
{
  "batchId": "8b169b86-17a9-4174-8f17-90d4e4ec50b0",
  "status": "PARTIAL",
  "dryRun": false,
  "replayed": false,
  "idempotencyKey": "market-data-batch-execute",
  "windowDays": 7,
  "datasets": ["SPOT_PRICE"],
  "requestedLimit": 10,
  "results": [
    {
      "executionId": "9f39b956-a601-42af-ac19-f10dbf79f07a",
      "action": "AUTOPILOT",
      "statusBefore": "FAILED",
      "compensated": true,
      "compensationExecutionId": "45a17c00-cdf5-4c48-80da-2d0f02e36cb0"
    }
  ],
  "summary": {
    "compensated": 1,
    "failed": 1,
    "skipped": 0
  },
  "storage": "database"
}
```

### 3.5.25 导出批量补偿审计报告

- `GET /market-data/reconciliation/cutover/executions/compensation-batches/{batchId}/report?format=markdown`

响应（markdown）：

```json
{
  "batchId": "8b169b86-17a9-4174-8f17-90d4e4ec50b0",
  "format": "markdown",
  "fileName": "reconciliation-cutover-compensation-batch-8b169b86-17a9-4174-8f17-90d4e4ec50b0.md",
  "generatedAt": "2026-02-27T12:08:00.000Z",
  "storage": "database",
  "payload": "# Reconciliation Cutover Compensation Batch Report\n..."
}
```

响应（json）：

```json
{
  "batchId": "8b169b86-17a9-4174-8f17-90d4e4ec50b0",
  "format": "json",
  "fileName": "reconciliation-cutover-compensation-batch-8b169b86-17a9-4174-8f17-90d4e4ec50b0.json",
  "generatedAt": "2026-02-27T12:08:00.000Z",
  "storage": "database",
  "payload": {
    "batchId": "8b169b86-17a9-4174-8f17-90d4e4ec50b0",
    "status": "PARTIAL",
    "summary": {
      "compensated": 1,
      "failed": 1,
      "skipped": 0,
      "processed": 2,
      "breakerTriggered": false
    }
  }
}
```

### 3.5.26 自动补偿巡检（服务端定时任务）

说明：

- 服务端每 10 分钟执行一次待补偿巡检，调用批量补偿主流程；
- 支持环境变量控制：
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_ENABLED`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_SCOPE`（`USER | GLOBAL`）
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_WINDOW_DAYS`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_LIMIT`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_DATASETS`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MAX_CONCURRENCY`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_TIMEOUT_MS`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_STOP_ON_FAILURE_COUNT`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_STOP_ON_FAILURE_RATE`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_MIN_PROCESSED`
  - `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_IDEMPOTENCY_SLOT_MINUTES`
- 自动巡检同样复用 `idempotencyKey` 防重复执行。
- `USER` 模式只处理 `MARKET_DATA_CUTOVER_COMPENSATION_AUTORUN_USER_ID` 的待补偿执行；
- `GLOBAL` 模式会扫描窗口内所有存在待补偿执行的用户并逐用户补偿。

## 4. 指标中心 API

## 4.1 查询指标字典

- `GET /semantic/metrics/catalog?status=ACTIVE`

响应：

```json
[
  {
    "metricCode": "BASIS_MAIN",
    "name": "主力基差",
    "version": "1.0",
    "unit": "CNY/TON",
    "refreshFreq": "1m"
  }
]
```

## 4.2 计算指标

- `POST /semantic/metrics/calculate`

请求：

```json
{
  "metricCode": "ROUTE_FRICTION_IDX",
  "metricVersion": "1.0",
  "dimensions": {
    "routeCode": "NE_TO_NC_RAIL_01"
  },
  "timeRange": {
    "from": "2026-02-20T00:00:00+08:00",
    "to": "2026-02-26T23:59:59+08:00"
  }
}
```

响应：

```json
{
  "metricCode": "ROUTE_FRICTION_IDX",
  "metricVersion": "1.0",
  "value": 67.4,
  "qualityScore": 0.89,
  "freshnessStatus": "WITHIN_TTL",
  "dataTimestamp": "2026-02-26T09:00:00+08:00"
}
```

## 5. 证据与冲突 API

## 5.1 生成证据包

- `POST /evidence/bundles`

请求：

```json
{
  "executionId": "we_xxx",
  "claims": ["未来两周价格波动风险上升"]
}
```

响应：

```json
{
  "bundleId": "ev_xxx",
  "claims": [
    {
      "text": "未来两周价格波动风险上升",
      "confidence": 0.82,
      "evidence": [
        {
          "source": "futures_api",
          "metric": "BASIS_MAIN",
          "time": "2026-02-26T09:30:00+08:00",
          "value": -45
        }
      ],
      "conflicts": []
    }
  ]
}
```

## 5.2 查询冲突记录

- `GET /evidence/conflicts?executionId=we_xxx`

响应：

```json
{
  "consistencyScore": 0.68,
  "items": [
    {
      "topic": "近7日涨跌幅",
      "sourceA": "public_report",
      "sourceB": "spot_price_api",
      "resolution": "prefer_spot_price_api",
      "reason": "实时性更高"
    }
  ]
}
```

## 6. 工作流模板 API

## 6.1 列出模板

- `GET /workflow-templates?domain=AGRI_TRADE`

响应：

```json
[
  {
    "templateCode": "WEEKLY_MARKET_REVIEW",
    "name": "周度市场复盘",
    "requiredSlots": ["commodityCode", "regionCode", "timeRange"],
    "version": "1.0"
  }
]
```

## 6.2 执行模板

- `POST /workflow-templates/:templateCode/run`

请求：

```json
{
  "slots": {
    "commodityCode": "CORN",
    "regionCode": "CN_NE",
    "timeRange": "LAST_7_DAYS"
  },
  "delivery": {
    "channels": ["EMAIL"],
    "emailTo": ["ops@example.com"]
  }
}
```

响应：

```json
{
  "accepted": true,
  "executionId": "we_xxx",
  "status": "EXECUTING"
}
```

## 7. 对话执行 API（复用现有会话域）

## 7.1 创建会话

- `POST /agent-conversations/sessions`

请求：

```json
{
  "title": "东北玉米两周风险分析"
}
```

## 7.2 会话对话

- `POST /agent-conversations/sessions/:sessionId/turns`

请求：

```json
{
  "message": "请分析未来两周东北玉米价格风险，结合天气和物流给出建议",
  "contextPatch": {
    "regionCode": "CN_NE"
  }
}
```

响应：

```json
{
  "state": "PLAN_PREVIEW",
  "assistantMessage": "已生成执行计划，请确认时间范围和输出格式。",
  "proposedPlan": {
    "planId": "plan_xxx",
    "skills": ["spot_query", "futures_query", "weather_query", "logistics_query", "metric_calc"],
    "estimatedCost": {
      "token": 12000,
      "latencyMs": 9500
    }
  },
  "missingSlots": ["timeRange", "outputFormat"]
}
```

## 7.3 确认执行

- `POST /agent-conversations/sessions/:sessionId/plan/confirm`

请求：

```json
{
  "planId": "plan_xxx",
  "planVersion": 2,
  "confirmedPlan": {
    "timeRange": "NEXT_14_DAYS",
    "outputFormat": ["MARKDOWN", "PDF"]
  }
}
```

## 7.4 获取结果

- `GET /agent-conversations/sessions/:sessionId/result`

响应核心字段：

```json
{
  "status": "DONE",
  "result": {
    "conclusion": "...",
    "evidenceBundleId": "ev_xxx",
    "risks": ["..."],
    "actions": ["..."]
  },
  "artifacts": [
    {
      "type": "PDF",
      "downloadUrl": "/report-exports/et_xxx/download"
    }
  ]
}
```

## 7.5 可选别名映射（仅网关层）

| 网关别名（可选）                                     | 后端标准路径                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `POST /super-agent/sessions`                         | `POST /agent-conversations/sessions`                         |
| `POST /super-agent/sessions/:sessionId/turns`        | `POST /agent-conversations/sessions/:sessionId/turns`        |
| `POST /super-agent/sessions/:sessionId/plan/confirm` | `POST /agent-conversations/sessions/:sessionId/plan/confirm` |
| `GET /super-agent/sessions/:sessionId/result`        | `GET /agent-conversations/sessions/:sessionId/result`        |

## 8. 订阅与回测 API

## 8.1 创建订阅

- `POST /agent-conversations/sessions/:sessionId/subscriptions`

请求：

```json
{
  "name": "玉米风险周报",
  "cronExpr": "0 0 8 * * 1",
  "timezone": "Asia/Shanghai",
  "delivery": {
    "channels": ["EMAIL"],
    "emailTo": ["ops@example.com"]
  }
}
```

## 8.2 立即执行订阅

- `POST /agent-conversations/sessions/:sessionId/subscriptions/:subscriptionId/run`

## 8.3 创建回测

- `POST /agent-conversations/sessions/:sessionId/backtests`

请求：

```json
{
  "executionId": "we_xxx",
  "lookbackDays": 180,
  "feeModel": {
    "spotFeeBps": 8,
    "futuresFeeBps": 3
  }
}
```

响应：

```json
{
  "backtestJobId": "bt_xxx",
  "status": "RUNNING"
}
```

## 9. 运营与质量 API

## 9.1 数据质量日报

- `GET /ops/data-quality/daily?date=2026-02-26`

响应：

```json
{
  "date": "2026-02-26",
  "datasets": [
    {
      "dataset": "SPOT_PRICE",
      "qualityScore": 0.93,
      "freshnessPassRate": 0.98,
      "conflictRate": 0.04
    }
  ]
}
```

## 9.2 执行审计查询

- `GET /ops/audit/executions/:executionId`

响应字段：

1. `requestContext`：谁发起、何时发起。
2. `dataSources`：使用的数据源与版本。
3. `guardrail`：门禁判断结果。
4. `delivery`：导出和投递记录。

## 10. 错误码建议

| 错误码                        | 含义               | 处理建议               |
| ----------------------------- | ------------------ | ---------------------- |
| SA_400_INVALID_SLOT           | 槽位参数缺失或非法 | 返回缺失字段并引导补齐 |
| SA_403_DATA_SCOPE_DENIED      | 数据权限不足       | 提示申请权限           |
| SA_409_DATA_CONFLICT          | 多源数据冲突过高   | 输出冲突摘要并降级结论 |
| SA_422_QUALITY_GATE_BLOCKED   | 质量门禁阻断       | 告知质量分与缺失项     |
| SA_429_CONNECTOR_RATE_LIMITED | 数据源限流         | 提示稍后重试或使用缓存 |
| SA_503_CONNECTOR_UNAVAILABLE  | 外部源不可用       | 自动降级并提示影响范围 |

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

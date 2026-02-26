# CTBMS 对话式 AI Agent API 字段级定义 v1.1

- 协议：REST/JSON
- 鉴权：沿用现有登录态（`req.user.id`）
- 错误格式：`{ code, message, details? }`

## 1. 会话接口

## 1.1 创建会话

- `POST /agent-conversations/sessions`

请求：

```json
{
  "title": "东北玉米周度复盘"
}
```

响应：

```json
{
  "id": "cs_xxx",
  "title": "东北玉米周度复盘",
  "status": "INTENT_CAPTURE",
  "createdAt": "2026-02-25T10:00:00.000Z"
}
```

## 1.2 对话轮次

- `POST /agent-conversations/sessions/:sessionId/turns`

请求：

```json
{
  "message": "请分析最近一周东北玉米价格并给出未来三个月建议",
  "contextPatch": {
    "region": "东北"
  }
}
```

响应：

```json
{
  "assistantMessage": "我将先汇总价格、知识库与期货数据。请确认时间范围是否为最近7天？",
  "state": "SLOT_FILLING",
  "intent": "MARKET_SUMMARY_WITH_FORECAST",
  "missingSlots": ["timeRange", "outputFormat"],
  "proposedPlan": {
    "planId": "plan_xxx",
    "planType": "RUN_PLAN",
    "workflowDefinitionId": "wf_xxx",
    "skills": ["price_series_query", "knowledge_search", "futures_quote_fetch"],
    "paramSnapshot": {
      "region": "东北"
    },
    "estimatedCost": {
      "token": 18000,
      "latencyMs": 12000
    }
  },
  "confirmRequired": false
}
```

补充字段（2026-02-26 增量）：

```json
{
  "replyOptions": [
    {
      "id": "view_result",
      "label": "查看结果",
      "mode": "OPEN_TAB",
      "tab": "result"
    },
    {
      "id": "refine_region",
      "label": "改成华北范围",
      "mode": "SEND",
      "value": "改成华北范围再分析一次"
    }
  ]
}
```

字段约束：

1. `replyOptions` 每轮建议 1-4 个。
2. `mode` 仅允许 `SEND`/`OPEN_TAB`。
3. `OPEN_TAB.tab` 仅允许 `progress`/`result`/`delivery`/`schedule`。

## 1.3 确认计划并执行

- `POST /agent-conversations/sessions/:sessionId/plan/confirm`

请求：

```json
{
  "planId": "plan_xxx",
  "planVersion": 3,
  "confirmedPlan": {
    "outputFormat": ["MARKDOWN", "JSON", "PDF"],
    "delivery": {
      "email": "user@example.com"
    }
  }
}
```

响应：

```json
{
  "accepted": true,
  "executionId": "we_xxx",
  "status": "EXECUTING",
  "traceId": "tr_xxx"
}
```

## 1.4 获取会话结果

- `GET /agent-conversations/sessions/:sessionId/result`

响应：

```json
{
  "status": "DONE",
  "result": {
    "facts": [
      {
        "text": "东北玉米近7日均价上涨1.8%",
        "citations": [
          {
            "sourceType": "PRICE_SERIES",
            "sourceId": "price_node_1",
            "timestamp": "2026-02-24"
          }
        ]
      }
    ],
    "analysis": "...",
    "actions": {
      "spot": ["..."],
      "futures": ["..."],
      "riskDisclosure": "..."
    },
    "confidence": 0.72,
    "dataTimestamp": "2026-02-25T09:30:00.000Z"
  },
  "artifacts": [
    {
      "type": "PDF",
      "exportTaskId": "et_xxx",
      "downloadUrl": "/report-exports/et_xxx/download"
    }
  ],
  "delivery": {
    "email": {
      "status": "SENT",
      "to": "user@example.com",
      "sentAt": "2026-02-25T10:10:00.000Z"
    }
  }
}
```

## 1.5 能力路由日志

- `GET /agent-conversations/sessions/:sessionId/capability-routing-logs`

Query:

1. `routeType`（可选）：`WORKFLOW_REUSE`/`SKILL_DRAFT_REUSE`/`SKILL_DRAFT_CREATE`
2. `limit`（可选）：1-200，默认 50
3. `window`（可选）：`1h`/`24h`/`7d`，默认 `24h`

响应：

```json
[
  {
    "id": "ca_xxx",
    "title": "能力路由日志 WORKFLOW_REUSE 9f8c7a6b5c1d",
    "routeType": "WORKFLOW_REUSE",
    "selectedSource": "USER_PRIVATE",
    "selectedScore": 0.84,
    "selectedWorkflowDefinitionId": "wf_xxx",
    "selectedDraftId": null,
    "selectedSkillCode": null,
    "routePolicy": ["USER_PRIVATE", "TEAM_OR_PUBLIC"],
    "routePolicyDetails": {
      "capabilityRoutingPolicy": {
        "allowOwnerPool": true,
        "allowPublicPool": true,
        "preferOwnerFirst": true,
        "minOwnerScore": 0,
        "minPublicScore": 0.35
      },
      "ephemeralCapabilityPolicy": {
        "draftSemanticReuseThreshold": 0.72,
        "publishedSkillReuseThreshold": 0.76,
        "runtimeGrantTtlHours": 24,
        "runtimeGrantMaxUseCount": 30
      }
    },
    "reason": "命中用户私有工作流，优先复用",
    "createdAt": "2026-02-26T10:20:00.000Z"
  }
]
```

## 1.6 能力路由汇总

- `GET /agent-conversations/sessions/:sessionId/capability-routing-summary`

Query:

1. `limit`（可选）：20-500，默认 200
2. `window`（可选）：`1h`/`24h`/`7d`，默认 `24h`

响应：

```json
{
  "sampleWindow": {
    "window": "24h",
    "totalLogs": 12,
    "analyzedLimit": 200
  },
  "effectivePolicies": {
    "capabilityRoutingPolicy": {
      "allowOwnerPool": true,
      "allowPublicPool": true,
      "preferOwnerFirst": true,
      "minOwnerScore": 0,
      "minPublicScore": 0.35
    },
    "ephemeralCapabilityPolicy": {
      "draftSemanticReuseThreshold": 0.72,
      "publishedSkillReuseThreshold": 0.76,
      "runtimeGrantTtlHours": 24,
      "runtimeGrantMaxUseCount": 30
    }
  },
  "stats": {
    "routeType": [
      { "key": "WORKFLOW_REUSE", "count": 7 },
      { "key": "SKILL_DRAFT_REUSE", "count": 5 }
    ],
    "selectedSource": [
      { "key": "USER_PRIVATE", "count": 8 },
      { "key": "PUBLISHED_SKILL", "count": 4 }
    ]
  },
  "trend": [
    {
      "bucket": "2026-02-26T17",
      "total": 6,
      "byRouteType": {
        "WORKFLOW_REUSE": 4,
        "SKILL_DRAFT_REUSE": 2
      }
    }
  ]
}
```

## 1.7 临时能力汇总

- `GET /agent-conversations/sessions/:sessionId/ephemeral-capabilities/summary`

Query:

1. `window`（可选）：`1h`/`24h`/`7d`，默认 `24h`

响应：

```json
{
  "window": "24h",
  "totals": {
    "drafts": 8,
    "runtimeGrants": 5,
    "expiringRuntimeGrantsIn24h": 2,
    "staleDrafts": 1
  },
  "policy": {
    "draftSemanticReuseThreshold": 0.72,
    "publishedSkillReuseThreshold": 0.76,
    "runtimeGrantTtlHours": 24,
    "runtimeGrantMaxUseCount": 30,
    "replayRetryableErrorCodeAllowlist": ["NETWORK_ERROR", "TIMEOUT", "FETCH_FAILED", "HTTP_429", "HTTP_5XX"],
    "replayNonRetryableErrorCodeBlocklist": ["CONV_PROMOTION_TASK_NOT_FOUND", "CONV_PROMOTION_TASK_ACTION_INVALID", "CONV_PROMOTION_TASK_PUBLISH_BLOCKED", "SKILL_REVIEWER_CONFLICT", "SKILL_HIGH_RISK_REVIEW_REQUIRED"]
  },
  "stats": {
    "draftStatus": [{ "key": "DRAFT", "count": 4 }],
    "grantStatus": [{ "key": "ACTIVE", "count": 3 }],
    "topSkillCodes": [{ "key": "skill_xxx", "count": 2 }]
  }
}
```

## 1.8 临时能力治理清理

- `POST /agent-conversations/sessions/:sessionId/ephemeral-capabilities/housekeeping`

响应：

```json
{
  "checkedAt": "2026-02-26T17:30:00.000Z",
  "expiredGrantCount": 1,
  "disabledDraftCount": 2,
  "policy": {
    "draftSemanticReuseThreshold": 0.72,
    "publishedSkillReuseThreshold": 0.76,
    "runtimeGrantTtlHours": 24,
    "runtimeGrantMaxUseCount": 30,
    "replayRetryableErrorCodeAllowlist": ["NETWORK_ERROR", "TIMEOUT", "FETCH_FAILED", "HTTP_429", "HTTP_5XX"],
    "replayNonRetryableErrorCodeBlocklist": ["CONV_PROMOTION_TASK_NOT_FOUND", "CONV_PROMOTION_TASK_ACTION_INVALID", "CONV_PROMOTION_TASK_PUBLISH_BLOCKED", "SKILL_REVIEWER_CONFLICT", "SKILL_HIGH_RISK_REVIEW_REQUIRED"]
  }
}
```

## 1.9 临时能力进化方案（预览）

- `GET /agent-conversations/sessions/:sessionId/ephemeral-capabilities/evolution-plan`

Query:

1. `window`（可选）：`1h`/`24h`/`7d`，默认 `24h`

响应（节选）：

```json
{
  "window": "24h",
  "policy": {
    "draftSemanticReuseThreshold": 0.72,
    "publishedSkillReuseThreshold": 0.76,
    "runtimeGrantTtlHours": 24,
    "runtimeGrantMaxUseCount": 30,
    "replayRetryableErrorCodeAllowlist": ["NETWORK_ERROR", "TIMEOUT", "FETCH_FAILED", "HTTP_429", "HTTP_5XX"],
    "replayNonRetryableErrorCodeBlocklist": ["CONV_PROMOTION_TASK_NOT_FOUND", "CONV_PROMOTION_TASK_ACTION_INVALID", "CONV_PROMOTION_TASK_PUBLISH_BLOCKED", "SKILL_REVIEWER_CONFLICT", "SKILL_HIGH_RISK_REVIEW_REQUIRED"]
  },
  "recommendations": {
    "promoteDraftCandidates": [
      {
        "draftId": "ds_xxx",
        "suggestedSkillCode": "skill_xxx",
        "hitCount": 3,
        "reason": "复用命中较高，建议进入发布评审"
      }
    ],
    "staleDraftCandidates": [],
    "expiredGrantCandidates": []
  },
  "metrics": {
    "totalRoutingLogs": 12,
    "uniqueDraftHits": 4,
    "uniqueSkillCodeHits": 3
  }
}
```

## 1.10 临时能力进化方案（执行）

- `POST /agent-conversations/sessions/:sessionId/ephemeral-capabilities/evolution-apply`

Query:

1. `window`（可选）：`1h`/`24h`/`7d`，默认 `24h`

响应：

```json
{
  "checkedAt": "2026-02-26T18:20:00.000Z",
  "window": "24h",
  "expiredGrantCount": 1,
  "disabledDraftCount": 2,
  "promoteSuggestionCount": 3
}
```

## 1.11 晋升任务批处理（并发/重试）

- `POST /agent-conversations/sessions/:sessionId/ephemeral-capabilities/promotion-tasks/batch`

请求：

```json
{
  "action": "SYNC_DRAFT_STATUS",
  "taskAssetIds": ["ca_task_xxx"],
  "window": "24h",
  "status": "PENDING_REVIEW",
  "maxConcurrency": 6,
  "maxRetries": 1,
  "comment": "批量同步草稿状态"
}
```

响应：

```json
{
  "action": "SYNC_DRAFT_STATUS",
  "batchId": "b4d7...",
  "batchAssetId": "ca_batch_xxx",
  "requestedCount": 12,
  "succeededCount": 10,
  "failedCount": 2,
  "succeeded": [{ "taskAssetId": "ca_task_1", "status": "IN_REVIEW" }],
  "failed": [{ "taskAssetId": "ca_task_2", "code": "CONV_PROMOTION_TASK_PUBLISH_BLOCKED", "message": "该草稿尚未发布" }]
}
```

## 1.12 晋升批次记录列表

- `GET /agent-conversations/sessions/:sessionId/ephemeral-capabilities/promotion-task-batches`

Query:

1. `window`（可选）：`1h`/`24h`/`7d`，默认 `24h`
2. `action`（可选）：`START_REVIEW`/`MARK_APPROVED`/`MARK_REJECTED`/`MARK_PUBLISHED`/`SYNC_DRAFT_STATUS`
3. `limit`（可选）：默认 `20`，最大 `100`

响应（节选）：

```json
[
  {
    "batchAssetId": "ca_batch_xxx",
    "batchId": "b4d7...",
    "action": "SYNC_DRAFT_STATUS",
    "requestedCount": 12,
    "succeededCount": 10,
    "failedCount": 2,
    "maxConcurrency": 6,
    "maxRetries": 1,
    "sourceBatchAssetId": "ca_batch_prev",
    "failed": [
      { "taskAssetId": "ca_task_2", "code": "CONV_PROMOTION_TASK_PUBLISH_BLOCKED", "message": "该草稿尚未发布" }
    ],
    "createdAt": "2026-02-26T18:00:00.000Z"
  }
]
```

## 1.13 晋升批次失败重放

- `POST /agent-conversations/sessions/:sessionId/ephemeral-capabilities/promotion-task-batches/:batchAssetId/replay-failed`

请求：

```json
{
  "replayMode": "RETRYABLE_ONLY",
  "errorCodes": ["HTTP_429", "FETCH_FAILED"],
  "maxConcurrency": 6,
  "maxRetries": 1
}
```

`replayMode` 说明：

- `RETRYABLE_ONLY`：仅重放可重试错误（网络/超时/5xx/429 等）
- `ALL_FAILED`：重放全部失败项

响应：

```json
{
  "sourceBatchAssetId": "ca_batch_xxx",
  "sourceAction": "SYNC_DRAFT_STATUS",
  "sourceFailedCount": 2,
  "selectedReplayCount": 1,
  "replayMode": "RETRYABLE_ONLY",
  "selectedErrorCodes": ["HTTP_429"],
  "replayResult": {
    "action": "SYNC_DRAFT_STATUS",
    "batchId": "b5e8...",
    "batchAssetId": "ca_batch_yyy",
    "requestedCount": 1,
    "succeededCount": 1,
    "failedCount": 0
  }
}
```

## 2. 辩论接口

## 2.1 启动辩论计划

- `POST /agent-conversations/sessions/:sessionId/debate/start`

请求：

```json
{
  "topic": "东北玉米未来三个月是否存在缺口并涨价",
  "timeRange": "LAST_30_DAYS",
  "region": "东北",
  "participants": [
    { "agentCode": "bull_agent", "role": "看多分析师", "weight": 1.2 },
    { "agentCode": "bear_agent", "role": "看空分析师", "weight": 1.0 },
    { "agentCode": "risk_agent", "role": "风险官", "weight": 1.1 }
  ],
  "judgePolicy": "JUDGE_AGENT",
  "maxRounds": 3,
  "needPdf": true,
  "email": "user@example.com"
}
```

响应：

```json
{
  "accepted": true,
  "executionId": "we_debate_xxx",
  "status": "EXECUTING"
}
```

## 3. 交付接口

## 3.1 导出

- `POST /agent-conversations/sessions/:sessionId/export`

请求：

```json
{
  "workflowExecutionId": "we_xxx",
  "format": "PDF",
  "sections": ["CONCLUSION", "EVIDENCE", "DEBATE_PROCESS", "RISK_ASSESSMENT"],
  "title": "东北玉米辩论结论报告",
  "includeRawData": false
}
```

响应：

```json
{
  "exportTaskId": "et_xxx",
  "status": "PROCESSING"
}
```

## 3.2 邮件投递

- `POST /agent-conversations/sessions/:sessionId/deliver/email`

请求：

```json
{
  "exportTaskId": "et_xxx",
  "to": ["user@example.com"],
  "subject": "东北玉米辩论报告",
  "content": "您好，附件为本次辩论报告。"
}
```

响应：

```json
{
  "deliveryTaskId": "dt_xxx",
  "status": "QUEUED"
}
```

## 3.3 多渠道投递（统一 Adapter）

- `POST /agent-conversations/sessions/:sessionId/deliver`

请求（示例）：

```json
{
  "exportTaskId": "et_xxx",
  "channel": "DINGTALK",
  "target": "ops-group-01",
  "templateCode": "MORNING_BRIEF",
  "content": "请查收最新报告",
  "sendRawFile": true
}
```

说明：

- `channel` 支持 `EMAIL | DINGTALK | WECOM | FEISHU`
- `templateCode` 支持 `DEFAULT | MORNING_BRIEF | WEEKLY_REVIEW | RISK_ALERT`
- `EMAIL` 需要 `to`，其他渠道需要 `target`
- `sendRawFile=true` 表示优先发送原文件

响应（示例）：

```json
{
  "deliveryTaskId": "dt_xxx",
  "channel": "DINGTALK",
  "status": "SENT",
  "errorMessage": null
}
```

## 4. 订阅接口

## 4.1 创建订阅

- `POST /agent-conversations/sessions/:sessionId/subscriptions`

请求：

```json
{
  "planId": "plan_xxx",
  "name": "东北玉米周报订阅",
  "cronExpr": "0 0 8 * * 1",
  "timezone": "Asia/Shanghai",
  "delivery": {
    "channels": ["EMAIL"],
    "emailTo": ["user@example.com"]
  },
  "quietHours": {
    "start": "22:00",
    "end": "07:00"
  }
}
```

响应：

```json
{
  "subscriptionId": "sub_xxx",
  "status": "ACTIVE",
  "nextRunAt": "2026-03-02T00:00:00.000Z"
}
```

## 4.2 更新订阅

- `PATCH /agent-conversations/sessions/:sessionId/subscriptions/:subscriptionId`

请求：

```json
{
  "status": "PAUSED",
  "cronExpr": "0 0 7 * * 1"
}
```

响应：

```json
{
  "subscriptionId": "sub_xxx",
  "status": "PAUSED",
  "updatedAt": "2026-02-26T09:00:00.000Z"
}
```

## 4.3 自然语言调度指令

- `POST /agent-conversations/sessions/:sessionId/schedules/resolve`

请求：

```json
{
  "instruction": "每周五18点发到企业微信群ops-group-01 订阅名称：周报订阅"
}
```

响应（示例）：

```json
{
  "action": "CREATE",
  "subscriptionId": "sub_xxx",
  "status": "ACTIVE",
  "cronExpr": "0 0 18 * * 5",
  "timezone": "Asia/Shanghai",
  "channel": "WECOM",
  "target": "企业微信群ops-group-01"
}
```

支持动作：`CREATE | UPDATE | PAUSE | RESUME | RUN`

## 5. 回测接口

## 5.1 创建回测任务

- `POST /agent-conversations/sessions/:sessionId/backtests`

请求：

```json
{
  "executionId": "we_xxx",
  "strategySource": "LATEST_ACTIONS",
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

## 5.2 查询回测结果

- `GET /agent-conversations/sessions/:sessionId/backtests/:backtestJobId`

响应：

```json
{
  "status": "COMPLETED",
  "summary": {
    "returnPct": 12.3,
    "maxDrawdownPct": -4.8,
    "winRatePct": 61.2,
    "score": 0.74
  },
  "assumptions": {
    "lookbackDays": 180,
    "feeModel": {
      "spotFeeBps": 8,
      "futuresFeeBps": 3
    }
  }
}
```

## 6. 冲突消解接口

## 6.1 查询冲突记录

- `GET /agent-conversations/sessions/:sessionId/conflicts`

响应：

```json
{
  "consistencyScore": 0.63,
  "conflicts": [
    {
      "conflictId": "cf_xxx",
      "topic": "近7日涨跌幅",
      "sources": ["price_series", "weekly_report"],
      "resolution": "prefer_price_series",
      "reason": "实时性更高"
    }
  ]
}
```

## 6.2 查询会话资产

- `GET /agent-conversations/sessions/:sessionId/assets`

响应（示例）：

```json
[
  {
    "id": "asset_xxx",
    "assetType": "PLAN",
    "title": "执行计划 v3",
    "payload": {
      "planId": "plan_xxx"
    }
  }
]
```

## 6.3 复用会话资产

- `POST /agent-conversations/sessions/:sessionId/assets/:assetId/reuse`

请求：

```json
{
  "message": "请基于这个结果继续补充风险策略"
}
```

说明：服务端会把该资产注入上下文并继续执行新一轮对话。

自然语言引用写法（无需调用复用接口）：

- 在用户消息中写 `"请基于[asset:<assetId>]继续"`
- 或 `"请基于资产#<assetId>继续"`

## 7. Skill Draft 接口

## 7.1 创建草稿

- `POST /agent-conversations/sessions/:sessionId/capability-gap/skill-draft`

请求：

```json
{
  "gapType": "MISSING_FUTURES_OPEN_API",
  "requiredCapability": "获取交易所公开持仓排名数据",
  "suggestedSkillCode": "futures_open_interest_rank_fetch"
}
```

响应：

```json
{
  "draftId": "sd_xxx",
  "status": "DRAFT",
  "reviewRequired": true
}
```

## 7.2 沙箱测试

- `POST /agent-skills/drafts/:draftId/sandbox-test`

请求：

```json
{
  "testCases": [
    {
      "input": { "symbol": "C", "date": "2026-02-25" },
      "expectContains": ["openInterest"]
    }
  ]
}
```

## 7.3 提交审批

- `POST /agent-skills/drafts/:draftId/submit-review`

响应：

```json
{
  "draftId": "sd_xxx",
  "status": "READY_FOR_REVIEW"
}
```

## 7.4 审批决策

- `POST /agent-skills/drafts/:draftId/review`

请求：

```json
{
  "action": "APPROVE",
  "comment": "验证通过"
}
```

响应：

```json
{
  "draftId": "sd_xxx",
  "status": "APPROVED",
  "reviewComment": "验证通过"
}
```

## 7.5 发布 Skill

- `POST /agent-skills/drafts/:draftId/publish`

响应：

```json
{
  "draftId": "sd_xxx",
  "status": "PUBLISHED",
  "publishedSkillId": "skill_xxx"
}
```

## 7.6 查询草稿

- `GET /agent-skills/drafts/:draftId`
- `GET /agent-skills/drafts?status=READY_FOR_REVIEW`

## 7.7 Runtime Grant（低风险先用后审）

- `GET /agent-skills/drafts/:draftId/runtime-grants`
- `POST /agent-skills/runtime-grants/:grantId/revoke`
- `POST /agent-skills/runtime-grants/:grantId/use`
- `GET /agent-skills/governance/overview`
- `GET /agent-skills/governance/events?draftId=...&limit=20`
- `POST /agent-skills/governance/housekeeping`

说明：

- 仅低风险（`riskLevel=LOW` 且无副作用）Draft 会自动创建 `ACTIVE` 授权。
- 授权具备过期时间与使用次数上限，可人工撤销。

`/agent-skills/runtime-grants/:grantId/use` 响应：

```json
{
  "id": "grant_xxx",
  "status": "ACTIVE",
  "useCount": 3,
  "maxUseCount": 30
}
```

`/agent-skills/governance/overview` 响应：

```json
{
  "activeRuntimeGrants": 2,
  "runtimeGrantsExpiringIn1h": 1,
  "highRiskPendingReview": 1,
  "draftStats": [
    { "riskLevel": "LOW", "status": "PUBLISHED", "_count": { "_all": 3 } }
  ]
}
```

## 8. 枚举定义（建议）

1. `ConversationState`：`INTENT_CAPTURE | SLOT_FILLING | PLAN_PREVIEW | USER_CONFIRM | EXECUTING | RESULT_DELIVERY | DONE | FAILED`
2. `PlanType`：`RUN_PLAN | DEBATE_PLAN`
3. `DeliveryStatus`：`QUEUED | SENDING | SENT | FAILED`
4. `SkillDraftStatus`：`DRAFT | SANDBOX_TESTING | READY_FOR_REVIEW | APPROVED | REJECTED | PUBLISHED`
5. `SubscriptionStatus`：`ACTIVE | PAUSED | FAILED | ARCHIVED`
6. `BacktestStatus`：`QUEUED | RUNNING | COMPLETED | FAILED`
7. `ConversationAssetType`：`PLAN | EXECUTION | RESULT_SUMMARY | EXPORT_FILE | BACKTEST_SUMMARY | CONFLICT_SUMMARY | SKILL_DRAFT | NOTE`

## 9. 配置中心（投递配置）

投递配置中心通过 `user-config-bindings` 存储，`bindingType` 使用：

- `AGENT_COPILOT_DELIVERY_PROFILES`

建议 `metadata` 结构：

```json
{
  "profiles": [
    {
      "id": "ops-wecom",
      "channel": "WECOM",
      "target": "ops-group-01",
      "templateCode": "WEEKLY_REVIEW",
      "sendRawFile": true,
      "isDefault": true,
      "description": "运营群默认周报"
    }
  ]
}
```

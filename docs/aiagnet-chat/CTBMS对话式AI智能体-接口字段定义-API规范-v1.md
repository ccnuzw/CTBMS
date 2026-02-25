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

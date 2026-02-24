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

响应：

```json
{
  "testRunId": "sr_xxx",
  "status": "PASSED",
  "passedCount": 1,
  "failedCount": 0
}
```

## 8. 枚举定义（建议）

1. `ConversationState`：`INTENT_CAPTURE | SLOT_FILLING | PLAN_PREVIEW | USER_CONFIRM | EXECUTING | RESULT_DELIVERY | DONE | FAILED`
2. `PlanType`：`RUN_PLAN | DEBATE_PLAN`
3. `DeliveryStatus`：`QUEUED | SENDING | SENT | FAILED`
4. `SkillDraftStatus`：`DRAFT | SANDBOX_TESTING | READY_FOR_REVIEW | APPROVED | REJECTED | PUBLISHED`
5. `SubscriptionStatus`：`ACTIVE | PAUSED | FAILED | ARCHIVED`
6. `BacktestStatus`：`QUEUED | RUNNING | COMPLETED | FAILED`

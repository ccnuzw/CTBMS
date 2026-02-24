# CTBMS 对话式 AI Agent 数据表 DDL 草案（Prisma）v1.1

- 说明：本草案为新增模型建议，需与现有 `apps/api/prisma/schema.prisma` 对齐合并。
- 命名策略：沿用现有 camelCase 字段与 Prisma enum 风格。

## 1. 枚举草案

```prisma
enum ConversationState {
  INTENT_CAPTURE
  SLOT_FILLING
  PLAN_PREVIEW
  USER_CONFIRM
  EXECUTING
  RESULT_DELIVERY
  DONE
  FAILED
}

enum ConversationRole {
  USER
  ASSISTANT
  SYSTEM
}

enum ConversationPlanType {
  RUN_PLAN
  DEBATE_PLAN
}

enum DeliveryChannel {
  EMAIL
  DASHBOARD
  WEBHOOK
}

enum DeliveryStatus {
  QUEUED
  SENDING
  SENT
  FAILED
}

enum SkillDraftStatus {
  DRAFT
  SANDBOX_TESTING
  READY_FOR_REVIEW
  APPROVED
  REJECTED
  PUBLISHED
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
  FAILED
  ARCHIVED
}

enum BacktestStatus {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
}
```

## 2. 模型草案

```prisma
model ConversationSession {
  id                 String            @id @default(uuid())
  title              String?
  ownerUserId        String
  state              ConversationState @default(INTENT_CAPTURE)
  currentIntent      String?
  currentSlots       Json?
  latestPlanType     ConversationPlanType?
  latestPlanSnapshot Json?
  latestExecutionId  String?
  traceId            String?
  startedAt          DateTime          @default(now())
  endedAt            DateTime?
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  owner              User              @relation(fields: [ownerUserId], references: [id])
  turns              ConversationTurn[]
  plans              ConversationPlan[]
  deliveries         ConversationDeliveryTask[]
  subscriptions      ConversationSubscription[]
  backtests          ConversationBacktestJob[]
  conflicts          ConversationConflictRecord[]

  @@index([ownerUserId, createdAt])
  @@index([state, updatedAt])
}

model ConversationTurn {
  id                 String           @id @default(uuid())
  sessionId          String
  role               ConversationRole
  content            String           @db.Text
  structuredPayload  Json?
  tokenUsage         Int?
  latencyMs          Int?
  createdAt          DateTime         @default(now())

  session            ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
}

model ConversationPlan {
  id                 String                @id @default(uuid())
  sessionId          String
  version            Int
  planType           ConversationPlanType
  planSnapshot       Json
  validatorResult    Json?
  isConfirmed        Boolean               @default(false)
  confirmedAt        DateTime?
  confirmedByUserId  String?
  workflowExecutionId String?
  createdAt          DateTime              @default(now())

  session            ConversationSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@unique([sessionId, version])
  @@index([sessionId, createdAt])
}

model ConversationDeliveryTask {
  id                 String          @id @default(uuid())
  sessionId          String
  workflowExecutionId String?
  exportTaskId       String?
  channel            DeliveryChannel
  status             DeliveryStatus  @default(QUEUED)
  target             Json
  payload            Json?
  errorMessage       String?
  sentAt             DateTime?
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  session            ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@index([status, createdAt])
}

model SkillDraft {
  id                 String           @id @default(uuid())
  sessionId          String?
  createdByUserId    String
  suggestedSkillCode String
  name               String
  description        String?
  inputSchema        Json
  outputSchema       Json
  implementationSpec Json?
  status             SkillDraftStatus @default(DRAFT)
  reviewComment      String?
  publishedSkillId   String?
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  creator            User             @relation(fields: [createdByUserId], references: [id])
  testRuns           SkillDraftTestRun[]
  reviews            SkillReviewRecord[]

  @@index([createdByUserId, createdAt])
  @@index([status, updatedAt])
  @@unique([suggestedSkillCode, createdByUserId, createdAt])
}

model SkillDraftTestRun {
  id                 String      @id @default(uuid())
  draftId            String
  status             String
  testInput          Json?
  testOutput         Json?
  log                Json?
  startedAt          DateTime    @default(now())
  endedAt            DateTime?

  draft              SkillDraft  @relation(fields: [draftId], references: [id], onDelete: Cascade)

  @@index([draftId, startedAt])
}

model SkillReviewRecord {
  id                 String      @id @default(uuid())
  draftId            String
  reviewerUserId     String
  action             String
  comment            String?
  createdAt          DateTime    @default(now())

  draft              SkillDraft  @relation(fields: [draftId], references: [id], onDelete: Cascade)
  reviewer           User        @relation(fields: [reviewerUserId], references: [id])

  @@index([draftId, createdAt])
  @@index([reviewerUserId, createdAt])
}

model ConversationSubscription {
  id                 String             @id @default(uuid())
  sessionId          String
  ownerUserId        String
  name               String
  planSnapshot       Json
  cronExpr           String
  timezone           String             @default("Asia/Shanghai")
  status             SubscriptionStatus @default(ACTIVE)
  deliveryConfig     Json
  quietHours         Json?
  nextRunAt          DateTime?
  lastRunAt          DateTime?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  session            ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  owner              User                @relation(fields: [ownerUserId], references: [id])
  runs               ConversationSubscriptionRun[]

  @@index([ownerUserId, createdAt])
  @@index([status, nextRunAt])
}

model ConversationSubscriptionRun {
  id                 String      @id @default(uuid())
  subscriptionId     String
  workflowExecutionId String?
  exportTaskId       String?
  status             String
  errorMessage       String?
  startedAt          DateTime    @default(now())
  endedAt            DateTime?

  subscription       ConversationSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([subscriptionId, startedAt])
}

model ConversationBacktestJob {
  id                 String         @id @default(uuid())
  sessionId          String
  workflowExecutionId String
  status             BacktestStatus @default(QUEUED)
  inputConfig        Json
  resultSummary      Json?
  metrics            Json?
  errorMessage       String?
  createdAt          DateTime       @default(now())
  startedAt          DateTime?
  completedAt        DateTime?

  session            ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@index([status, createdAt])
}

model ConversationConflictRecord {
  id                 String      @id @default(uuid())
  sessionId          String
  workflowExecutionId String?
  topic              String
  consistencyScore   Float?
  sourceA            String
  sourceB            String
  valueA             Json?
  valueB             Json?
  resolution         String?
  resolutionReason   String?
  createdAt          DateTime    @default(now())

  session            ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@index([topic, createdAt])
}
```

## 3. 与现有表的关系

1. `ConversationPlan.workflowExecutionId` 对接 `WorkflowExecution.id`。
2. `ConversationDeliveryTask.exportTaskId` 对接现有 `ExportTask.id`。
3. `SkillDraft.publishedSkillId` 对接现有 `AgentSkill.id`。
4. `ConversationSubscriptionRun.exportTaskId` 对接现有 `ExportTask.id`。

## 4. 迁移建议

1. 第一阶段先落 `ConversationSession/Turn/Plan`。
2. 第二阶段再落 `ConversationDeliveryTask` 与邮件投递状态。
3. 第三阶段落 `SkillDraft` 相关表与审批链路。
4. 第四阶段落订阅、回测、冲突记录相关表。

## 5. 索引建议

1. 会话列表按 `ownerUserId + createdAt`。
2. 轮次按 `sessionId + createdAt`。
3. 交付任务按 `status + createdAt` 便于后台重试扫描。
4. Skill Draft 按 `status + updatedAt` 便于审批看板查询。
5. 订阅按 `status + nextRunAt` 便于调度器扫描。
6. 回测任务按 `status + createdAt` 便于异步工作线程抓取。

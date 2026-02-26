# CTBMS 大宗农产贸易超级智能体数据表设计草案（Prisma DDL）v1.0

- 文档类型：数据库设计草案（Prisma）
- 对应 PRD：`docs/aiagnet-chat/CTBMS大宗农产贸易超级智能体-产品需求文档-PRD-v1.md`
- 说明：本草案用于评审，落库时需与 `apps/api/prisma/schema.prisma` 合并

## 1. 设计目标

1. 支持天气、物流、指标、证据、质量治理数据落库。
2. 与现有 `DataConnector`、`WorkflowExecution`、`ConversationSession` 形成关联。
3. 支持回放、审计、订阅与回测链路复用。

## 1.1 设计边界（避免重复建模）

1. 不重复创建 `ConversationSession/ConversationPlan/ConversationSubscription/ConversationBacktestJob` 等会话域模型。
2. 不重建现有 `DataConnector` 主模型，仅扩展其配置能力与健康快照。
3. 本文档聚焦“数据底座标准化新增模型”，用于承接存量标准化和新增数据域。

## 2. 枚举草案

```prisma
enum DataFreshnessStatus {
  WITHIN_TTL
  NEAR_EXPIRE
  EXPIRED
}

enum DataSourceType {
  INTERNAL
  PUBLIC
  FUTURES_API
  WEATHER_API
  LOGISTICS_API
  MANUAL
}

enum MetricStatus {
  DRAFT
  ACTIVE
  DEPRECATED
}

enum EvidenceConflictResolution {
  PREFER_SOURCE_A
  PREFER_SOURCE_B
  MANUAL_REVIEW
  KEEP_BOTH
}

enum QualityIssueSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum ReconcileJobStatus {
  PENDING
  RUNNING
  DONE
  FAILED
}
```

## 3. 模型草案

```prisma
model WeatherObservation {
  id                String              @id @default(uuid())
  connectorId       String?
  regionCode        String
  stationCode       String?
  dataTime          DateTime
  tempC             Decimal?            @db.Decimal(10, 2)
  rainfallMm        Decimal?            @db.Decimal(10, 2)
  windSpeed         Decimal?            @db.Decimal(10, 2)
  anomalyScore      Decimal?            @db.Decimal(10, 4)
  eventLevel        String?
  freshnessStatus   DataFreshnessStatus @default(WITHIN_TTL)
  qualityScore      Decimal             @db.Decimal(5, 4)
  sourceType        DataSourceType
  sourceRecordId    String?
  collectedAt       DateTime            @default(now())
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  connector         DataConnector?      @relation(fields: [connectorId], references: [id])

  @@index([regionCode, dataTime])
  @@index([connectorId, dataTime])
  @@index([freshnessStatus, dataTime])
}

model LogisticsRouteSnapshot {
  id                  String              @id @default(uuid())
  connectorId         String?
  routeCode           String
  originRegionCode    String
  destinationRegionCode String
  transportMode       String
  dataTime            DateTime
  freightCost         Decimal             @db.Decimal(18, 4)
  transitHours        Decimal?            @db.Decimal(10, 2)
  delayIndex          Decimal?            @db.Decimal(10, 4)
  capacityUtilization Decimal?            @db.Decimal(10, 4)
  eventFlag           String?
  freshnessStatus     DataFreshnessStatus @default(WITHIN_TTL)
  qualityScore        Decimal             @db.Decimal(5, 4)
  sourceType          DataSourceType
  sourceRecordId      String?
  collectedAt         DateTime            @default(now())
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  connector           DataConnector?      @relation(fields: [connectorId], references: [id])

  @@index([routeCode, dataTime])
  @@index([originRegionCode, destinationRegionCode, dataTime])
  @@index([freshnessStatus, dataTime])
}

model MetricCatalog {
  id                  String       @id @default(uuid())
  metricCode          String       @unique
  metricName          String
  description         String?
  version             String
  expression          String       @db.Text
  unit                String?
  granularity         String?
  dimensions          Json?
  status              MetricStatus @default(DRAFT)
  ownerUserId         String?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  owner               User?        @relation(fields: [ownerUserId], references: [id])
  snapshots           MetricValueSnapshot[]

  @@unique([metricCode, version])
  @@index([status, updatedAt])
}

model MetricValueSnapshot {
  id                  String              @id @default(uuid())
  metricCatalogId     String
  metricCode          String
  metricVersion       String
  value               Decimal             @db.Decimal(20, 6)
  valueText           String?
  dimensions          Json?
  dataTime            DateTime
  freshnessStatus     DataFreshnessStatus @default(WITHIN_TTL)
  qualityScore        Decimal             @db.Decimal(5, 4)
  confidenceScore     Decimal?            @db.Decimal(5, 4)
  sourceSummary       Json?
  createdAt           DateTime            @default(now())

  metricCatalog       MetricCatalog       @relation(fields: [metricCatalogId], references: [id], onDelete: Cascade)

  @@index([metricCode, dataTime])
  @@index([metricCatalogId, dataTime])
}

model EvidenceBundle {
  id                  String      @id @default(uuid())
  conversationSessionId String?
  workflowExecutionId String?
  title               String?
  confidenceScore     Decimal?    @db.Decimal(5, 4)
  consistencyScore    Decimal?    @db.Decimal(5, 4)
  summary             Json?
  createdByUserId     String?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  session             ConversationSession? @relation(fields: [conversationSessionId], references: [id])
  execution           WorkflowExecution?   @relation(fields: [workflowExecutionId], references: [id])
  creator             User?                @relation(fields: [createdByUserId], references: [id])
  claims              EvidenceClaim[]
  conflicts           EvidenceConflict[]

  @@index([conversationSessionId, createdAt])
  @@index([workflowExecutionId, createdAt])
}

model EvidenceClaim {
  id                  String      @id @default(uuid())
  bundleId            String
  claimText           String      @db.Text
  claimType           String?
  confidenceScore     Decimal?    @db.Decimal(5, 4)
  evidenceItems       Json
  sourceCount         Int         @default(0)
  dataTimestamp       DateTime?
  createdAt           DateTime    @default(now())

  bundle              EvidenceBundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)

  @@index([bundleId, createdAt])
}

model EvidenceConflict {
  id                  String                      @id @default(uuid())
  bundleId            String
  topic               String
  sourceA             String
  sourceB             String
  valueA              Json?
  valueB              Json?
  resolution          EvidenceConflictResolution
  reason              String?
  impactLevel         String?
  createdAt           DateTime                    @default(now())

  bundle              EvidenceBundle              @relation(fields: [bundleId], references: [id], onDelete: Cascade)

  @@index([bundleId, createdAt])
  @@index([topic, createdAt])
}

model DataQualityIssue {
  id                  String               @id @default(uuid())
  datasetName         String
  sourceType          DataSourceType
  connectorId         String?
  issueType           String
  severity            QualityIssueSeverity
  message             String
  payload             Json?
  detectedAt          DateTime             @default(now())
  resolvedAt          DateTime?
  resolverUserId      String?
  resolutionNote      String?

  connector           DataConnector?       @relation(fields: [connectorId], references: [id])
  resolver            User?                @relation(fields: [resolverUserId], references: [id])

  @@index([datasetName, detectedAt])
  @@index([severity, detectedAt])
  @@index([connectorId, detectedAt])
}

model DataSourceHealthSnapshot {
  id                  String        @id @default(uuid())
  connectorId         String
  sourceType          DataSourceType
  windowStartAt       DateTime
  windowEndAt         DateTime
  requestCount        Int           @default(0)
  successCount        Int           @default(0)
  errorCount          Int           @default(0)
  p95LatencyMs        Int?
  avgLatencyMs        Int?
  availabilityRatio   Decimal?      @db.Decimal(6, 4)
  createdAt           DateTime      @default(now())

  connector           DataConnector @relation(fields: [connectorId], references: [id], onDelete: Cascade)

  @@index([connectorId, windowEndAt])
  @@index([sourceType, windowEndAt])
}

model StandardizationMappingRule {
  id              String    @id @default(uuid())
  datasetName      String
  mappingVersion   String
  sourceField      String
  targetField      String
  transformExpr    String?   @db.Text
  isRequired       Boolean   @default(false)
  nullPolicy       String    @default("FAIL") // FAIL | USE_DEFAULT | SKIP
  defaultValue     Json?
  rulePriority     Int       @default(0)
  isActive         Boolean   @default(true)
  createdByUserId  String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  creator          User?     @relation(fields: [createdByUserId], references: [id])

  @@index([datasetName, isActive])
  @@index([datasetName, mappingVersion])
  @@unique([datasetName, mappingVersion, sourceField, targetField])
}

model DataReconciliationJob {
  id                String             @id @default(uuid())
  datasetName        String
  status             ReconcileJobStatus @default(PENDING)
  legacyVersion      String?
  mappingVersion     String
  timeRangeFrom      DateTime
  timeRangeTo        DateTime
  dimensions         Json?
  thresholdConfig    Json?
  summary            Json?
  pass               Boolean?
  createdByUserId    String?
  startedAt          DateTime?
  finishedAt         DateTime?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  creator            User?              @relation(fields: [createdByUserId], references: [id])
  diffs              DataReconciliationDiff[]

  @@index([datasetName, createdAt])
  @@index([status, createdAt])
  @@index([mappingVersion, createdAt])
}

model DataReconciliationDiff {
  id                String               @id @default(uuid())
  jobId             String
  diffType          String // VALUE_DIFF | MISSING_IN_LEGACY | MISSING_IN_STANDARD | CONFLICT
  businessKey       String
  legacyPayload     Json?
  standardPayload   Json?
  diffScore         Decimal?             @db.Decimal(10, 6)
  resolved          Boolean              @default(false)
  resolutionNote    String?
  createdAt         DateTime             @default(now())

  job               DataReconciliationJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@index([jobId, diffType])
  @@index([businessKey])
}
```

## 4. 与现有模型关系

1. `connectorId` 关联现有 `DataConnector`。
2. `EvidenceBundle.workflowExecutionId` 关联现有 `WorkflowExecution`。
3. `EvidenceBundle.conversationSessionId` 关联现有 `ConversationSession`。
4. 指标快照可被现有工作流执行结果引用到 `ConversationAsset`。

## 5. 索引与性能建议

1. 时间序列查询优先建立 `(业务维度 + dataTime)` 复合索引。
2. 质量告警表按 `severity + detectedAt` 索引便于实时看板。
3. 高频写入表建议按月分区（PostgreSQL 原生分区可选）。

## 6. 迁移建议

1. 第一批迁移：`WeatherObservation`、`LogisticsRouteSnapshot`。
2. 第二批迁移：`MetricCatalog`、`MetricValueSnapshot`。
3. 第三批迁移：`EvidenceBundle`、`EvidenceClaim`、`EvidenceConflict`。
4. 第四批迁移：`DataQualityIssue`、`DataSourceHealthSnapshot`。
5. 第五批迁移：`StandardizationMappingRule`、`DataReconciliationJob`、`DataReconciliationDiff`。

## 7. 回滚策略

1. 新表迁移采用增量方式，不改动现有核心表结构。
2. 业务切流按功能开关控制，支持读老链路回退。
3. 若指标服务异常，回退到原有工作流计算节点。

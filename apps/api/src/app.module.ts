import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma';
import { UsersModule } from './modules/users/users.module';
import { MarketCategoryModule } from './modules/market-category';
import { MarketInfoModule } from './modules/market-info';
import { OrganizationModule } from './modules/organization';
import { DepartmentModule } from './modules/department';
import { RoleModule } from './modules/role';
import { InitModule } from './modules/init';
import { TagsModule } from './modules/tags';
import { TagGroupsModule } from './modules/tag-groups';
import { EnterpriseModule } from './modules/enterprise';
import { MarketIntelModule } from './modules/market-intel';
import { AIModule } from './modules/ai';
import { CollectionPointModule } from './modules/collection-point';
import { RegionModule } from './modules/region';
import { ExtractionConfigModule } from './modules/extraction-config';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { MockAuthMiddleware } from './common/middleware/mock-auth.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { LegacyApiDeprecationMiddleware } from './common/middleware/legacy-api-deprecation.middleware';
import { IntelTaskModule } from './modules/intel-task';
import { ConfigModule } from './modules/config/config.module';
import { CollectionPointAllocationModule } from './modules/collection-point-allocation';
import { PriceSubmissionModule } from './modules/price-submission';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { WorkflowDefinitionModule } from './modules/workflow-definition';
import { WorkflowExecutionModule } from './modules/workflow-execution';
import { WorkflowValidationModule } from './modules/workflow-validation';
import { DecisionRuleModule } from './modules/decision-rule';
import { AgentConfigModule } from './modules/agent-config';
import { ParameterCenterModule } from './modules/parameter-center';
import { DataConnectorModule } from './modules/data-connector';
import { DecisionRecordModule } from './modules/decision-record';
import { WorkflowExperimentModule } from './modules/workflow-experiment';
import { DebateTraceModule } from './modules/debate-trace';
import { TriggerGatewayModule } from './modules/trigger-gateway';
import { ReportExportModule } from './modules/report-export';
import { ExecutionInsightModule } from './modules/execution-insight';
import { TemplateCatalogModule } from './modules/template-catalog';
import { FuturesSimModule } from './modules/futures-sim';
import { UserConfigBindingModule } from './modules/user-config-binding';
import { ConnectorModule } from './modules/connector/connector.module';
import { WizardModule } from './modules/wizard/wizard.module';
import { MarketDataModule } from './modules/market-data';
import { AuditLogModule } from './modules/audit-log';
import { SemanticLayerModule } from './modules/semantic-layer';
import { DataGovernanceModule } from './modules/data-governance';
import { MetricCenterModule } from './modules/metric-center';
import { FeatureFlagModule } from './modules/feature-flag';
import { AgentToolModule } from './modules/agent-tool';
import { ConversationalWorkflowModule } from './modules/conversational-workflow';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AIModule,
    UsersModule,
    MarketCategoryModule,
    MarketInfoModule,
    OrganizationModule,
    DepartmentModule,
    RoleModule,
    InitModule,
    TagsModule,
    TagGroupsModule,
    EnterpriseModule,
    MarketIntelModule, // Keep this, even if we removed Task from it, it has other providers (though we might have removed too much from it? No, we kept services)
    CollectionPointModule,
    RegionModule,
    ExtractionConfigModule,
    IntelTaskModule,
    ConfigModule,
    CollectionPointAllocationModule,
    PriceSubmissionModule,
    KnowledgeModule,
    WorkflowDefinitionModule,
    WorkflowExecutionModule,
    WorkflowValidationModule,
    DecisionRuleModule,
    AgentConfigModule,
    ParameterCenterModule,
    DataConnectorModule,
    DecisionRecordModule,
    WorkflowExperimentModule,
    DebateTraceModule,
    TriggerGatewayModule,
    ReportExportModule,
    ExecutionInsightModule,
    TemplateCatalogModule,
    FuturesSimModule,
    UserConfigBindingModule,
    ConnectorModule,
    WizardModule,
    MarketDataModule,
    AuditLogModule,
    SemanticLayerModule,
    DataGovernanceModule,
    MetricCenterModule,
    FeatureFlagModule,
    AgentToolModule,
    ConversationalWorkflowModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, LegacyApiDeprecationMiddleware, LoggerMiddleware, MockAuthMiddleware)
      .forRoutes('*');
  }
}

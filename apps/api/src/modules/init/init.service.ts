import { Injectable, OnModuleInit, Logger, MessageEvent } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InitService implements OnModuleInit {
  // Init service for seeding data
  private readonly logger = new Logger(InitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.measureTime('Seed AI Config', () => this.seedAIConfig());
  }

  async isInitialized(): Promise<boolean> {
    const count = await this.prisma.businessMappingRule.count();
    return count > 0;
  }

  async initialize() {
    await this.onModuleInit();
    return { success: true, message: 'Initialization executed' };
  }

  /**
   * Spawns the seeding process and returns an Observable of log strings.
   * This separates the web process from the heavy seeding task.
   */
  streamSeed(): Observable<MessageEvent> {
    return new Observable((observer) => {
      // Determine script path:
      // In dev (ts-node): logic in seed.ts handles .ts execution
      // In prod (node): we run the compiled JS
      // But here we invoke the SAME seed.ts/js file using the same logic we fixed in deployment
      // Actually, safest is to run "npm run seed" or equiv, but inside the container/app structure
      // we should invoke directly.

      // Let's use the logic:
      // If running in .ts source, use ts-node
      // If running in .js dist, use node

      // Logic:
      // 1. Prioritize 'prisma/seed.ts' (Dev/Local) - Allows immediate editing without rebuild
      // 2. Fallback to 'dist/prisma/seed.js' (Prod/Docker) - Compiled artifacts

      const projectRoot = path.resolve(__dirname, '../../../../'); // apps/api
      const tsSeedPath = path.resolve(projectRoot, 'prisma/seed.ts');

      let command: string;
      let args: string[];

      const isProduction = process.env.NODE_ENV === 'production';

      if (!isProduction && fs.existsSync(tsSeedPath)) {
        // Dev/Local Environment: Run TS directly
        command = 'npx';
        args = ['ts-node', 'prisma/seed.ts'];
        this.logger.log(`Starting seed process (Source TS detected): ${command} ${args.join(' ')}`);
      } else {
        // Prod Environment (or TS missing): Run JS from dist
        // In production Docker, NODE_ENV is 'production', so we force this path
        // even if seed.ts exists (copied for schema reference)
        const jsSeedPath = path.resolve(projectRoot, 'dist/prisma/seed.js');
        command = 'node';
        args = [jsSeedPath];
        this.logger.log(`Starting seed process (Compiled JS): ${command} ${args.join(' ')}`);
      }

      const child = spawn(command, args, {
        cwd: projectRoot, // Run from apps/api root
        env: process.env, // Inherit env (DB URL etc)
      });

      const send = (data: string, type: 'stdout' | 'stderr' = 'stdout') => {
        observer.next({ data: { type, message: data } } as MessageEvent);
      };

      child.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) send(line, 'stdout');
        });
      });

      child.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) send(line, 'stderr');
        });
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          send('✅ Seeding completed successfully.', 'stdout');
        } else {
          send(`❌ Seeding failed with exit code ${code}`, 'stderr');
        }
        observer.complete();
      });

      child.on('error', (err: Error) => {
        send(`❌ Spawn error: ${err.message}`, 'stderr');
        observer.complete();
      });

      // Kill child if subscription unsubscribes?
      // Usually good practice, but seeding should probably finish...
      // For now, let's allow unsubscribe to kill
      return () => {
        if (!child.killed) child.kill();
      };
    });
  }

  private async measureTime(label: string, fn: () => Promise<unknown>) {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;

    let extraInfo = '';
    if (result && typeof result === 'object' && 'count' in result) {
      extraInfo = ` (${result.count} deleted)`;
    }

    this.logger.log(`${label} completed${extraInfo} in ${duration}ms`);
    return result;
  }

  async clearData() {
    this.logger.warn('⚠️ Starting Data Cleansing - This will wipe seeded tables!');
    try {
      // 1. Transaction Data (Leaves)
      await this.measureTime('Clear PriceData', () => this.prisma.priceData.deleteMany());
      await this.measureTime('Clear PriceSubmission', () =>
        this.prisma.priceSubmission.deleteMany(),
      );

      // 2. Intelligence Data
      await this.measureTime('Clear MarketInsight', () => this.prisma.marketInsight.deleteMany());
      await this.measureTime('Clear MarketEvent', () => this.prisma.marketEvent.deleteMany());

      // [NEW] Clear Tasks (Depends on User, blocks User deletion)
      // IntelTask references User, so it must be gone before User.
      await this.measureTime('Clear IntelTask', () => this.prisma.intelTask.deleteMany());
      await this.measureTime('Clear IntelTaskTemplate', () =>
        this.prisma.intelTaskTemplate.deleteMany(),
      );

      // 3. Main Intel (Depends on User - authorId)
      await this.measureTime('Clear MarketIntel', () => this.prisma.marketIntel.deleteMany());

      // 4. Collection Points (Depends on Region)
      await this.measureTime('Clear CollectionPoints', () =>
        this.prisma.collectionPoint.deleteMany(),
      );

      // 5. Enterprises & Tags
      await this.measureTime('Clear EntityTags', () => this.prisma.entityTag.deleteMany());
      await this.measureTime('Clear Enterprises', () => this.prisma.enterprise.deleteMany());
      await this.measureTime('Clear Tags', () => this.prisma.tag.deleteMany());
      await this.measureTime('Clear TagGroups', () => this.prisma.tagGroup.deleteMany());

      // 6. Configs
      await this.measureTime('Clear MarketCategories', () =>
        this.prisma.marketCategory.deleteMany(),
      );
      await this.measureTime('Clear EventTypes', () => this.prisma.eventTypeConfig.deleteMany());
      await this.measureTime('Clear InsightTypes', () =>
        this.prisma.insightTypeConfig.deleteMany(),
      );
      await this.measureTime('Clear ExtractionRules', () =>
        this.prisma.extractionRule.deleteMany(),
      );
      await this.measureTime('Clear BusinessMappingRules', () =>
        this.prisma.businessMappingRule.deleteMany(),
      );
      await this.measureTime('Clear PromptTemplates', () =>
        this.prisma.promptTemplate.deleteMany(),
      );
      await this.measureTime('Clear AIModelConfigs', () => this.prisma.aIModelConfig.deleteMany());
      await this.measureTime('Clear DictionaryItems', () =>
        this.prisma.dictionaryItem.deleteMany(),
      );
      await this.measureTime('Clear DictionaryDomains', () =>
        this.prisma.dictionaryDomain.deleteMany(),
      );

      // 6.5 Workflow / Agent / Parameter / Trigger Orchestration
      await this.measureTime('Clear WorkflowExperimentRuns', () =>
        this.prisma.workflowExperimentRun.deleteMany(),
      );
      await this.measureTime('Clear WorkflowExperiments', () =>
        this.prisma.workflowExperiment.deleteMany(),
      );
      await this.measureTime('Clear ExportTasks', () => this.prisma.exportTask.deleteMany());
      await this.measureTime('Clear TriggerLogs', () => this.prisma.triggerLog.deleteMany());
      await this.measureTime('Clear TriggerConfigs', () => this.prisma.triggerConfig.deleteMany());
      await this.measureTime('Clear UserConfigBindings', () =>
        this.prisma.userConfigBinding.deleteMany(),
      );
      await this.measureTime('Clear TemplateCatalogs', () =>
        this.prisma.templateCatalog.deleteMany(),
      );
      await this.measureTime('Clear DebateRoundTraces', () =>
        this.prisma.debateRoundTrace.deleteMany(),
      );
      await this.measureTime('Clear DecisionRecords', () =>
        this.prisma.decisionRecord.deleteMany(),
      );
      await this.measureTime('Clear WorkflowRuntimeEvents', () =>
        this.prisma.workflowRuntimeEvent.deleteMany(),
      );
      await this.measureTime('Clear NodeExecutions', () => this.prisma.nodeExecution.deleteMany());
      await this.measureTime('Clear WorkflowExecutions', () =>
        this.prisma.workflowExecution.deleteMany(),
      );
      await this.measureTime('Clear WorkflowPublishAudits', () =>
        this.prisma.workflowPublishAudit.deleteMany(),
      );
      await this.measureTime('Clear WorkflowVersions', () =>
        this.prisma.workflowVersion.deleteMany(),
      );
      await this.measureTime('Clear WorkflowDefinitions', () =>
        this.prisma.workflowDefinition.deleteMany(),
      );

      await this.measureTime('Clear ParameterChangeLogs', () =>
        this.prisma.parameterChangeLog.deleteMany(),
      );
      await this.measureTime('Clear ParameterItems', () => this.prisma.parameterItem.deleteMany());
      await this.measureTime('Clear ParameterSets', () => this.prisma.parameterSet.deleteMany());

      await this.measureTime('Clear DecisionRules', () => this.prisma.decisionRule.deleteMany());
      await this.measureTime('Clear DecisionRulePacks', () =>
        this.prisma.decisionRulePack.deleteMany(),
      );

      await this.measureTime('Clear AgentProfileSnapshots', () =>
        this.prisma.agentProfileSnapshot.deleteMany(),
      );
      await this.measureTime('Clear AgentPromptTemplateSnapshots', () =>
        this.prisma.agentPromptTemplateSnapshot.deleteMany(),
      );
      await this.measureTime('Clear AgentProfiles', () => this.prisma.agentProfile.deleteMany());
      await this.measureTime('Clear AgentPromptTemplates', () =>
        this.prisma.agentPromptTemplate.deleteMany(),
      );
      await this.measureTime('Clear DataConnectors', () => this.prisma.dataConnector.deleteMany());

      // 6.6 Market alert & futures simulation artifacts
      await this.measureTime('Clear MarketAlertStatusLogs', () =>
        this.prisma.marketAlertStatusLog.deleteMany(),
      );
      await this.measureTime('Clear MarketAlertInstances', () =>
        this.prisma.marketAlertInstance.deleteMany(),
      );
      await this.measureTime('Clear MarketAlertRules', () =>
        this.prisma.marketAlertRule.deleteMany(),
      );
      await this.measureTime('Clear FuturesDerivedFeatures', () =>
        this.prisma.futuresDerivedFeature.deleteMany(),
      );
      await this.measureTime('Clear FuturesQuoteSnapshots', () =>
        this.prisma.futuresQuoteSnapshot.deleteMany(),
      );
      await this.measureTime('Clear VirtualFuturesPositions', () =>
        this.prisma.virtualFuturesPosition.deleteMany(),
      );

      // 7. Master Data (Regions)
      // Use TRUNCATE fallback for self-referencing table
      try {
        await this.measureTime('Clear AdministrativeRegions', () =>
          this.prisma.administrativeRegion.deleteMany(),
        );
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn(
          `Failed to clear AdministrativeRegions via deleteMany (${message}). Trying raw TRUNCATE...`,
        );
        // Use TRUNCATE CASCADE to force wipe.
        await this.measureTime('Truncate AdministrativeRegions', () =>
          this.prisma.$executeRawUnsafe('TRUNCATE TABLE "AdministrativeRegion" CASCADE;'),
        );
      }

      // 8. Org Structure (Full Wipe)
      // Order matters for FK constraints: Users -> Depts -> Orgs -> Roles
      // But Users are also referenced by everything above.

      await this.measureTime('Clear Users', () => this.prisma.user.deleteMany());

      // Self-referencing tables again: Dept & Org
      try {
        await this.measureTime('Clear Departments', () => this.prisma.department.deleteMany());
      } catch (e) {
        await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "Department" CASCADE;');
      }

      try {
        await this.measureTime('Clear Organizations', () => this.prisma.organization.deleteMany());
      } catch (e) {
        await this.prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization" CASCADE;');
      }

      await this.measureTime('Clear Roles', () => this.prisma.role.deleteMany());

      this.logger.log('✅ Data Cleansing Completed (Full System Wipe).');
      return { success: true, message: 'Full system data cleared successfully.' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`❌ Data Cleansing Failed: ${message}`, stack);
      throw error;
    }
  }

  private async seedAIConfig() {
    const count = await this.prisma.aIModelConfig.count();
    if (count > 0) return;

    await this.prisma.aIModelConfig.create({
      data: {
        configKey: 'DEFAULT',
        provider: 'google',
        modelName: 'gemini-1.5-pro',
        apiKeyEnvVar: 'GEMINI_API_KEY',
        temperature: 0.3,
        maxTokens: 8192,
      },
    });
    this.logger.log('Seeded default AI config.');
  }
}

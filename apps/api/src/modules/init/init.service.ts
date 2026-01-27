
import { Injectable, OnModuleInit, Logger, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InitService implements OnModuleInit {
    // Init service for seeding data
    private readonly logger = new Logger(InitService.name);

    constructor(private readonly prisma: PrismaService) { }

    async onModuleInit() {
        await this.measureTime('Seed Business Rules', () => this.seedBusinessRules());
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
            const spawn = require('child_process').spawn;
            const path = require('path');

            // Determine script path:
            // In dev (ts-node): logic in seed.ts handles .ts execution
            // In prod (node): we run the compiled JS
            // But here we invoke the SAME seed.ts/js file using the same logic we fixed in deployment
            // Actually, safest is to run "npm run seed" or equiv, but inside the container/app structure
            // we should invoke directly.

            // Let's use the logic:
            // If running in .ts source, use ts-node
            // If running in .js dist, use node

            const fs = require('fs');

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

            child.stdout.on('data', (data: any) => {
                const lines = data.toString().split('\n');
                lines.forEach((line: string) => {
                    if (line.trim()) send(line, 'stdout');
                });
            });

            child.stderr.on('data', (data: any) => {
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

    private async measureTime(label: string, fn: () => Promise<void>) {
        const start = Date.now();
        await fn();
        this.logger.log(`${label} completed in ${Date.now() - start}ms`);
    }

    private async seedBusinessRules() {
        // Only seed if empty to avoid overwriting user changes
        const count = await this.prisma.businessMappingRule.count();
        if (count > 0) return;

        const rules = [
            // PRICE_SUB_TYPE mappings
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '平舱', targetValue: 'FOB' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: 'FOB', targetValue: 'FOB' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '到港', targetValue: 'ARRIVAL' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '到货', targetValue: 'ARRIVAL' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '成交', targetValue: 'TRANSACTION' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '收购', targetValue: 'PURCHASE' },
            { domain: 'PRICE_SUB_TYPE', matchMode: 'CONTAINS', pattern: '站台', targetValue: 'STATION_ORIGIN' },

            // PRICE_SOURCE_TYPE mappings
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '港务', targetValue: 'PORT' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '码头', targetValue: 'PORT' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '生物', targetValue: 'ENTERPRISE' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '化工', targetValue: 'ENTERPRISE' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '淀粉', targetValue: 'ENTERPRISE' },
            { domain: 'PRICE_SOURCE_TYPE', matchMode: 'CONTAINS', pattern: '酒精', targetValue: 'ENTERPRISE' },

            // SENTIMENT mappings
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'positive', targetValue: 'positive' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'bullish', targetValue: 'positive' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'strong', targetValue: 'positive' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'negative', targetValue: 'negative' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'bearish', targetValue: 'negative' },
            { domain: 'SENTIMENT', matchMode: 'CONTAINS', pattern: 'weak', targetValue: 'negative' },

            // GEO_LEVEL mappings
            { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '港', targetValue: 'PORT' },
            { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '市', targetValue: 'CITY' },
            { domain: 'GEO_LEVEL', matchMode: 'CONTAINS', pattern: '省', targetValue: 'PROVINCE' },
        ];

        for (const rule of rules) {
            await this.prisma.businessMappingRule.create({ data: rule });
        }
        this.logger.log(`Seeded ${rules.length} business rules.`);
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
            }
        });
        this.logger.log('Seeded default AI config.');
    }
}

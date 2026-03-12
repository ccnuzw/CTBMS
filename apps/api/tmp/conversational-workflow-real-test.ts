import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ConversationalWorkflowService } from '../src/modules/conversational-workflow/conversational-workflow.service';
import { ConfigService } from '../src/modules/config/config.service';
import { AIModelService } from '../src/modules/ai/ai-model.service';

function loadDatabaseUrlFromEnvFile() {
  if (process.env.DATABASE_URL) return;
  try {
    const env = readFileSync('.env', 'utf8');
    const match = env.match(/^DATABASE_URL=\"?([^\"\n]+)\"?/m);
    if (match) {
      process.env.DATABASE_URL = match[1];
    }
  } catch {
    // ignore missing .env
  }
}

async function run() {
  loadDatabaseUrlFromEnvFile();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const service = app.get(ConversationalWorkflowService);
  const configService = app.get(ConfigService);
  const aiModelService = app.get(AIModelService);

  const defaultConfig = await configService.getDefaultAIConfig();
  const resolvedKey = aiModelService.resolveApiKey(defaultConfig, aiModelService.apiKey);
  console.log('defaultConfig', {
    configKey: defaultConfig?.configKey,
    provider: defaultConfig?.provider,
    modelName: defaultConfig?.modelName,
    apiUrl: defaultConfig?.apiUrl,
    authType: defaultConfig?.authType,
    apiKeyEnvVar: defaultConfig?.apiKeyEnvVar,
    apiKeySet: Boolean(defaultConfig?.apiKey),
    resolvedKeyLength: resolvedKey?.length ?? 0,
  });

  const session = await service.createSession('b0000000-0000-0000-0000-000000000001');
  console.log('session', session);

  const first = await service.sendMessage(session.sessionId, '帮我做一个玉米的区域价差分析');
  console.log('first', JSON.stringify(first, null, 2));

  const second = await service.sendMessage(session.sessionId, '产区华北，销区华南');
  console.log('second', JSON.stringify(second, null, 2));

  const third = await service.sendMessage(session.sessionId, '开始');
  console.log('third', JSON.stringify(third, null, 2));

  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

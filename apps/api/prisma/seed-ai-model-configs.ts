import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AI_MODEL_CONFIGS: Array<{
  configKey: string;
  provider: string;
  modelName: string;
  apiKeyEnvVar: string;
  temperature: number;
  maxTokens: number;
  maxRetries: number;
  timeoutMs: number;
  isDefault: boolean;
}> = [
  {
    configKey: 'DEFAULT',
    provider: 'google',
    modelName: 'gemini-2.0-flash',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    temperature: 0.3,
    maxTokens: 8192,
    maxRetries: 2,
    timeoutMs: 30000,
    isDefault: true,
  },
  {
    configKey: 'FAST',
    provider: 'google',
    modelName: 'gemini-2.0-flash-lite',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    temperature: 0.2,
    maxTokens: 4096,
    maxRetries: 1,
    timeoutMs: 20000,
    isDefault: false,
  },
  {
    configKey: 'STRONG',
    provider: 'openai',
    modelName: 'gpt-4.1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    temperature: 0.2,
    maxTokens: 12000,
    maxRetries: 2,
    timeoutMs: 45000,
    isDefault: false,
  },
];

async function seedAiModelConfigs() {
  console.log('🌱 开始播种 AI 模型配置...');

  await prisma.aIModelConfig.updateMany({
    where: {
      configKey: {
        not: 'DEFAULT',
      },
    },
    data: {
      isDefault: false,
    },
  });

  for (const config of AI_MODEL_CONFIGS) {
    await prisma.aIModelConfig.upsert({
      where: { configKey: config.configKey },
      update: {
        provider: config.provider,
        modelName: config.modelName,
        apiKeyEnvVar: config.apiKeyEnvVar,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        maxRetries: config.maxRetries,
        timeoutMs: config.timeoutMs,
        isActive: true,
        isDefault: config.isDefault,
      },
      create: {
        configKey: config.configKey,
        provider: config.provider,
        modelName: config.modelName,
        apiKeyEnvVar: config.apiKeyEnvVar,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        maxRetries: config.maxRetries,
        timeoutMs: config.timeoutMs,
        isActive: true,
        isDefault: config.isDefault,
      },
    });
  }

  console.log(`✅ AI 模型配置播种完成，共 ${AI_MODEL_CONFIGS.length} 条`);
}

seedAiModelConfigs()
  .catch((error) => {
    console.error('❌ AI 模型配置播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

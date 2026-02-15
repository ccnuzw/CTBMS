import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SeedConnector = {
  connectorCode: string;
  connectorName: string;
  connectorType: string;
  category: string;
  endpointConfig?: Record<string, unknown>;
  queryTemplates?: Record<string, unknown>;
  responseMapping?: Record<string, unknown>;
  freshnessPolicy?: Record<string, unknown>;
  rateLimitConfig?: Record<string, unknown>;
  healthCheckConfig?: Record<string, unknown>;
  fallbackConnectorCode?: string | null;
};

const CONNECTORS: SeedConnector[] = [
  {
    connectorCode: 'MARKET_INTEL_INTERNAL_DB',
    connectorName: '市场情报-内部库连接器',
    connectorType: 'INTERNAL_DB',
    category: 'MARKET_INTEL',
    queryTemplates: {
      tableName: 'MarketIntel',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: {
      maxMinutes: 120,
    },
    healthCheckConfig: {
      strategy: 'db_ping',
    },
  },
  {
    connectorCode: 'MARKET_EVENT_INTERNAL_DB',
    connectorName: '市场事件-内部库连接器',
    connectorType: 'INTERNAL_DB',
    category: 'MARKET_EVENT',
    queryTemplates: {
      tableName: 'MarketEvent',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: {
      maxMinutes: 180,
    },
    healthCheckConfig: {
      strategy: 'db_ping',
    },
  },
  {
    connectorCode: 'MARKET_INSIGHT_INTERNAL_DB',
    connectorName: '市场洞察-内部库连接器',
    connectorType: 'INTERNAL_DB',
    category: 'MARKET_INSIGHT',
    queryTemplates: {
      tableName: 'MarketInsight',
      defaultTimeField: 'createdAt',
      defaultLimit: 100,
    },
    freshnessPolicy: {
      maxMinutes: 240,
    },
    healthCheckConfig: {
      strategy: 'db_ping',
    },
  },
  {
    connectorCode: 'MARKET_INTEL_REST_API',
    connectorName: '市场情报-外部 API 连接器',
    connectorType: 'REST_API',
    category: 'MARKET_INTEL',
    endpointConfig: {
      url: 'https://example.com/api/v1/market-intel',
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
    responseMapping: {
      dataPath: 'data.items',
    },
    freshnessPolicy: {
      maxMinutes: 60,
    },
    rateLimitConfig: {
      timeoutMs: 15000,
      qpm: 60,
    },
    healthCheckConfig: {
      strategy: 'http_get',
      timeoutMs: 3000,
    },
    fallbackConnectorCode: 'MARKET_INTEL_INTERNAL_DB',
  },
];

async function seedDataConnectors() {
  console.log('🌱 开始播种数据连接器...');

  for (const connector of CONNECTORS) {
    await prisma.dataConnector.upsert({
      where: {
        connectorCode: connector.connectorCode,
      },
      update: {
        connectorName: connector.connectorName,
        connectorType: connector.connectorType,
        category: connector.category,
        endpointConfig: connector.endpointConfig as never,
        queryTemplates: connector.queryTemplates as never,
        responseMapping: connector.responseMapping as never,
        freshnessPolicy: connector.freshnessPolicy as never,
        rateLimitConfig: connector.rateLimitConfig as never,
        healthCheckConfig: connector.healthCheckConfig as never,
        fallbackConnectorCode: connector.fallbackConnectorCode ?? null,
        ownerType: 'SYSTEM',
        isActive: true,
        version: 2,
      },
      create: {
        connectorCode: connector.connectorCode,
        connectorName: connector.connectorName,
        connectorType: connector.connectorType,
        category: connector.category,
        endpointConfig: connector.endpointConfig as never,
        queryTemplates: connector.queryTemplates as never,
        responseMapping: connector.responseMapping as never,
        freshnessPolicy: connector.freshnessPolicy as never,
        rateLimitConfig: connector.rateLimitConfig as never,
        healthCheckConfig: connector.healthCheckConfig as never,
        fallbackConnectorCode: connector.fallbackConnectorCode ?? null,
        ownerType: 'SYSTEM',
        isActive: true,
        version: 2,
      },
    });
  }

  console.log(`✅ 数据连接器播种完成，共 ${CONNECTORS.length} 条`);
}

seedDataConnectors()
  .catch((error) => {
    console.error('❌ 数据连接器播种失败', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

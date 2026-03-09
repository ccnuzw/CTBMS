import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [connector, user] = await Promise.all([
    prisma.dataConnector.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
  ]);

  const connectorId = connector?.id ?? null;
  const userId = user?.id ?? null;

  const weather = await prisma.weatherObservation.create({
    data: {
      connectorId,
      regionCode: 'CN-HEILONGJIANG',
      stationCode: 'HBIN-001',
      dataTime: new Date(),
      tempC: 4.5,
      rainfallMm: 0.2,
      windSpeed: 3.1,
      anomalyScore: 0.05,
      eventLevel: 'NORMAL',
      freshnessStatus: 'WITHIN_TTL',
      qualityScore: 0.96,
      sourceType: 'WEATHER_API',
      sourceRecordId: 'weather-seed-001',
    },
  });

  await prisma.logisticsRouteSnapshot.create({
    data: {
      connectorId,
      routeCode: 'NE-TO-NC-001',
      originRegionCode: 'CN-HEILONGJIANG',
      destinationRegionCode: 'CN-JIANGSU',
      transportMode: 'RAIL',
      dataTime: new Date(),
      freightCost: 420.5,
      transitHours: 36,
      delayIndex: 0.08,
      capacityUtilization: 0.72,
      eventFlag: 'NORMAL',
      freshnessStatus: 'WITHIN_TTL',
      qualityScore: 0.93,
      sourceType: 'LOGISTICS_API',
      sourceRecordId: 'logistics-seed-001',
    },
  });

  const metricCatalog = await prisma.metricCatalog.create({
    data: {
      metricCode: 'BASIS_SPOT',
      metricName: '基差',
      version: 'v1',
      expression: '(spot_price - futures_price)',
      unit: 'CNY/吨',
      granularity: 'daily',
      dimensions: {
        variables: {
          spot_price: 2520,
          futures_price: 2390,
        },
        freshnessTtlMinutes: 1440,
        qualityScoreDefault: 0.92,
        confidenceScoreDefault: 0.88,
      },
      status: 'ACTIVE',
      ownerUserId: userId ?? undefined,
    },
  });

  await prisma.metricValueSnapshot.create({
    data: {
      metricCatalogId: metricCatalog.id,
      metricCode: metricCatalog.metricCode,
      metricVersion: metricCatalog.version,
      value: 126.5,
      valueText: '126.5',
      dataTime: new Date(),
      freshnessStatus: 'WITHIN_TTL',
      qualityScore: 0.94,
      confidenceScore: 0.9,
      sourceSummary: {
        sources: ['INTERNAL', 'FUTURES_API'],
      },
    },
  });

  const bundle = await prisma.evidenceBundle.create({
    data: {
      title: '玉米基差分析',
      confidenceScore: 0.86,
      consistencyScore: 0.9,
      summary: {
        thesis: '基差处于低位，现货偏弱。',
      },
      createdByUserId: userId ?? undefined,
    },
  });

  await prisma.evidenceClaim.create({
    data: {
      bundleId: bundle.id,
      claimText: '东北玉米现货价格持续走弱',
      claimType: 'PRICE_TREND',
      confidenceScore: 0.82,
      evidenceItems: [
        {
          source: 'INTERNAL',
          metric: 'spot_price',
          value: 2480,
          dataTime: new Date().toISOString(),
        },
      ],
      sourceCount: 1,
      dataTimestamp: new Date(),
    },
  });

  await prisma.evidenceConflict.create({
    data: {
      bundleId: bundle.id,
      topic: '现货价格',
      sourceA: 'INTERNAL',
      sourceB: 'PUBLIC',
      valueA: { price: 2480 },
      valueB: { price: 2550 },
      resolution: 'MANUAL_REVIEW',
      reason: '发布时间不同',
      impactLevel: 'MEDIUM',
    },
  });

  await prisma.dataQualityIssue.create({
    data: {
      datasetName: 'SPOT_PRICE',
      sourceType: 'INTERNAL',
      connectorId,
      issueType: 'MISSING_FIELD',
      severity: 'MEDIUM',
      message: '缺少 spot_price 字段',
      payload: {
        recordId: 'spot-001',
      },
    },
  });

  if (connectorId) {
    await prisma.dataSourceHealthSnapshot.create({
      data: {
        connectorId,
        sourceType: 'INTERNAL',
        windowStartAt: new Date(Date.now() - 3600 * 1000),
        windowEndAt: new Date(),
        requestCount: 120,
        successCount: 118,
        errorCount: 2,
        p95LatencyMs: 480,
        avgLatencyMs: 210,
        availabilityRatio: 0.9833,
      },
    });
  }

  await prisma.standardizationMappingRule.create({
    data: {
      datasetName: 'SPOT_PRICE',
      mappingVersion: 'v1',
      sourceField: 'price',
      targetField: 'spotPrice',
      transformExpr: 'toDecimal(price)',
      isRequired: true,
      nullPolicy: 'FAIL',
      rulePriority: 1,
      createdByUserId: userId ?? undefined,
    },
  });

  console.log('✅ Data governance seed completed');
  console.log(`WeatherObservation: ${weather.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

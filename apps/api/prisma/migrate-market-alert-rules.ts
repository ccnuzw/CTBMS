import { PrismaClient } from '@prisma/client';
import { ALERT_RULE_DOMAIN, normalizeLegacyAlertRule } from './market-alert-migration-utils';

const prisma = new PrismaClient();

async function main() {
    console.log('Start migrating MARKET_ALERT_RULE into MarketAlertRule...');

    const legacyRules = await prisma.businessMappingRule.findMany({
        where: { domain: ALERT_RULE_DOMAIN },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    console.log(`Found ${legacyRules.length} legacy rules.`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const legacyRule of legacyRules) {
        const normalized = normalizeLegacyAlertRule(legacyRule);
        if (!normalized.ok) {
            failed += 1;
            console.error(`[FAILED] ${legacyRule.id}: ${normalized.error}`);
            continue;
        }

        const exists = await prisma.marketAlertRule.findUnique({
            where: { legacyRuleId: normalized.value.legacyRuleId },
            select: { id: true },
        });
        if (exists) {
            skipped += 1;
        }

        await prisma.marketAlertRule.upsert({
            where: { legacyRuleId: normalized.value.legacyRuleId },
            create: {
                name: normalized.value.name,
                type: normalized.value.type,
                threshold: normalized.value.threshold,
                days: normalized.value.days,
                direction: normalized.value.direction,
                severity: normalized.value.severity,
                priority: normalized.value.priority,
                isActive: normalized.value.isActive,
                legacyRuleId: normalized.value.legacyRuleId,
            },
            update: {
                name: normalized.value.name,
                type: normalized.value.type,
                threshold: normalized.value.threshold,
                days: normalized.value.days,
                direction: normalized.value.direction,
                severity: normalized.value.severity,
                priority: normalized.value.priority,
                isActive: normalized.value.isActive,
            },
        });

        success += 1;
    }

    console.log('----------------------------------------');
    console.log(`Total:   ${legacyRules.length}`);
    console.log(`Success: ${success}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed:  ${failed}`);
    console.log('----------------------------------------');

    if (failed > 0) {
        throw new Error(`Migration failed with ${failed} invalid legacy rules.`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

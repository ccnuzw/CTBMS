import { PrismaClient } from '@prisma/client';
import { ALERT_RULE_DOMAIN, normalizeLegacyAlertRule } from './market-alert-migration-utils';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking MARKET_ALERT_RULE migration consistency...');

    const legacyRules = await prisma.businessMappingRule.findMany({
        where: { domain: ALERT_RULE_DOMAIN },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const invalidLegacy: Array<{ id: string; reason: string }> = [];
    const validLegacy = legacyRules
        .map((row) => {
            const normalized = normalizeLegacyAlertRule(row);
            if (!normalized.ok) {
                invalidLegacy.push({ id: row.id, reason: normalized.error });
                return null;
            }
            return normalized.value;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

    console.log(`Legacy total: ${legacyRules.length}`);
    console.log(`Legacy valid: ${validLegacy.length}`);
    console.log(`Legacy invalid: ${invalidLegacy.length}`);

    if (invalidLegacy.length > 0) {
        console.log('Invalid legacy rules:');
        for (const item of invalidLegacy) {
            console.log(`- ${item.id}: ${item.reason}`);
        }
    }

    const newRules = await prisma.marketAlertRule.findMany({
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    console.log(`New rules total: ${newRules.length}`);

    const problems: string[] = [];

    if (newRules.length !== validLegacy.length) {
        problems.push(`count mismatch: new=${newRules.length}, validLegacy=${validLegacy.length}`);
    }

    const newByLegacyId = new Map(
        newRules
            .filter((row) => row.legacyRuleId)
            .map((row) => [row.legacyRuleId as string, row]),
    );

    for (const oldRule of validLegacy) {
        const migrated = newByLegacyId.get(oldRule.legacyRuleId);
        if (!migrated) {
            problems.push(`missing migrated rule for legacyRuleId=${oldRule.legacyRuleId}`);
            continue;
        }

        if (!migrated.name || !migrated.type || !migrated.severity) {
            problems.push(`invalid required fields in migrated rule id=${migrated.id}`);
            continue;
        }

        if (migrated.type !== oldRule.type) {
            problems.push(`type mismatch for legacyRuleId=${oldRule.legacyRuleId}: ${migrated.type} != ${oldRule.type}`);
        }
        if (migrated.severity !== oldRule.severity) {
            problems.push(`severity mismatch for legacyRuleId=${oldRule.legacyRuleId}: ${migrated.severity} != ${oldRule.severity}`);
        }
        if (migrated.priority !== oldRule.priority) {
            problems.push(`priority mismatch for legacyRuleId=${oldRule.legacyRuleId}: ${migrated.priority} != ${oldRule.priority}`);
        }
        if (migrated.isActive !== oldRule.isActive) {
            problems.push(`isActive mismatch for legacyRuleId=${oldRule.legacyRuleId}`);
        }
    }

    const samples = validLegacy.slice(0, 10).map((oldRule) => {
        const migrated = newByLegacyId.get(oldRule.legacyRuleId);
        return {
            legacyRuleId: oldRule.legacyRuleId,
            legacyName: oldRule.name,
            newId: migrated?.id ?? null,
            newName: migrated?.name ?? null,
            type: migrated?.type ?? null,
            severity: migrated?.severity ?? null,
        };
    });

    console.log('Sample mapping (first 10):');
    console.table(samples);

    if (problems.length > 0) {
        console.log('Consistency problems:');
        for (const problem of problems) {
            console.log(`- ${problem}`);
        }
        throw new Error(`Migration verification failed with ${problems.length} problem(s).`);
    }

    console.log('Migration check passed.');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

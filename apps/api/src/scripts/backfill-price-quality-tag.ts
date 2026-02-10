import { PriceQualityTag, Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CORRECTED_NOTE_KEYWORDS = ['修正', '更正', '校正', '修订'];
const IMPUTED_NOTE_KEYWORDS = ['补录', '估算', '插值', '补齐', '回填'];
const LATE_HOURS_THRESHOLD = 36;

type BackfillOptions = {
  limit: number;
  batchSize: number;
  dryRun: boolean;
  allRecords: boolean;
};

const parseOptions = (): BackfillOptions => {
  const args = process.argv.slice(2);
  const readArgValue = (name: string): string | null => {
    const matchedWithEqual = args.find((arg) => arg.startsWith(`${name}=`));
    if (matchedWithEqual) {
      return matchedWithEqual.slice(name.length + 1);
    }

    const index = args.findIndex((arg) => arg === name);
    if (index === -1) {
      return null;
    }
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      return null;
    }
    return next;
  };

  const readNumberArg = (name: string, fallback: number) => {
    const rawValue = readArgValue(name);
    if (rawValue === null) {
      return fallback;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };

  return {
    limit: readNumberArg('--limit', 50000),
    batchSize: readNumberArg('--batch-size', 500),
    dryRun: args.includes('--dry-run'),
    allRecords: args.includes('--all-records'),
  };
};

const inferQualityTag = (row: {
  note: string | null;
  effectiveDate: Date;
  createdAt: Date;
}): PriceQualityTag => {
  const note = (row.note || '').trim();
  if (CORRECTED_NOTE_KEYWORDS.some((keyword) => note.includes(keyword))) {
    return PriceQualityTag.CORRECTED;
  }
  if (IMPUTED_NOTE_KEYWORDS.some((keyword) => note.includes(keyword))) {
    return PriceQualityTag.IMPUTED;
  }
  const lateHours = (row.createdAt.getTime() - row.effectiveDate.getTime()) / (1000 * 60 * 60);
  if (lateHours > LATE_HOURS_THRESHOLD) {
    return PriceQualityTag.LATE;
  }
  return PriceQualityTag.RAW;
};

async function main() {
  const options = parseOptions();

  const where: Prisma.PriceDataWhereInput = options.allRecords
    ? {}
    : {
        qualityTag: PriceQualityTag.RAW,
      };

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let cursorId: string | undefined;

  while (scanned < options.limit) {
    const rows = await prisma.priceData.findMany({
      where,
      orderBy: { id: 'asc' },
      take: Math.min(options.batchSize, options.limit - scanned),
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        note: true,
        effectiveDate: true,
        createdAt: true,
        qualityTag: true,
      },
    });

    if (rows.length === 0) {
      break;
    }

    cursorId = rows[rows.length - 1].id;
    scanned += rows.length;

    const updates = rows
      .map((row) => {
        const inferredTag = inferQualityTag(row);
        if (row.qualityTag === inferredTag) {
          return null;
        }
        return { id: row.id, qualityTag: inferredTag };
      })
      .filter((item): item is { id: string; qualityTag: PriceQualityTag } => Boolean(item));

    unchanged += rows.length - updates.length;
    updated += updates.length;

    if (!options.dryRun && updates.length > 0) {
      await prisma.$transaction(
        updates.map((item) =>
          prisma.priceData.update({
            where: { id: item.id },
            data: { qualityTag: item.qualityTag },
          }),
        ),
      );
    }
  }

  console.log('[Price QualityTag Backfill] done', {
    ...options,
    mode: options.dryRun ? 'dry-run' : 'write',
    scopedToRawOnly: !options.allRecords,
    scanned,
    updated,
    unchanged,
  });
}

main()
  .catch((error) => {
    console.error('[Price QualityTag Backfill] fatal error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

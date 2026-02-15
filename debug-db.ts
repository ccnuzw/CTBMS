
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Checking PriceData columns...');
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'PriceData';
    `;
    console.log(columns);

    console.log('Testing raw region query...');
    const regionExpression = "COALESCE(NULLIF(p.\"city\", ''), NULLIF((p.\"region\")[2], ''), NULLIF((p.\"region\")[1], ''), NULLIF(p.\"location\", ''), '其他')";

    // Test basic select
    const result = await prisma.$queryRawUnsafe(`
      SELECT ${regionExpression} as region
      FROM "PriceData" p
      LIMIT 1
    `);
    console.log('Query result:', result);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();

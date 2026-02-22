import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const prompt = await prisma.promptTemplate.findUnique({ where: { code: 'MARKET_INTEL_SUMMARY_GENERATOR' } });
  console.log(prompt);
}
main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());

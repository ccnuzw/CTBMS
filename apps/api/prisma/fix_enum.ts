
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up conflicting data...');
  try {
    // Delete dependent records first if any
    await prisma.intelTask.deleteMany();
    await prisma.intelTaskTemplate.deleteMany();
    console.log('Successfully cleared IntelTask and IntelTaskTemplate tables.');
  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

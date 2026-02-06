
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Searching for stuck tasks...');

  // Find IntelTasks that are SUBMITTED but their PriceSubmission is REJECTED
  const stuckTasks = await prisma.intelTask.findMany({
    where: {
      status: 'SUBMITTED',
      priceSubmission: {
        status: 'REJECTED'
      }
    },
    include: {
      priceSubmission: {
        select: {
          status: true,
          batchCode: true
        }
      },
      assignee: {
        select: {
          name: true
        }
      }
    }
  });

  console.log(`Found ${stuckTasks.length} stuck tasks.`);

  for (const task of stuckTasks) {
    console.log(`Fixing task: ${task.title} (ID: ${task.id})`);
    console.log(`- Assignee: ${task.assignee?.name}`);
    console.log(`- Submission Status: ${task.priceSubmission?.status}`);

    await prisma.intelTask.update({
      where: { id: task.id },
      data: { status: 'RETURNED' }
    });

    console.log(`-> Updated status to RETURNED`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

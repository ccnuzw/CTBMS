import { PrismaClient } from '@prisma/client';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const prisma = new PrismaClient();
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 100,
});

async function main() {
  console.log('Verifying Vector Storage...');

  // 1. Get recent KnowledgeItems
  const items = await prisma.knowledgeItem.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      type: true,
      createdAt: true,
      contentPlain: true,
      contentRich: true,
    },
  });

  console.log(`Found ${items.length} recent KnowledgeItems.`);

  for (const item of items) {
    // 2. Count vectors for each item
    const vectorCount = await prisma.knowledgeVector.count({
      where: { knowledgeItemId: item.id },
    });

    console.log(`\nItem: ${item.title} (${item.type})`);
    console.log(`  ID: ${item.id}`);
    console.log(`  Created: ${item.createdAt}`);
    console.log(`  Vector Chunks: ${vectorCount}`);

    const content = (item.contentPlain || item.contentRich || '').trim();
    const expectedChunks = content ? (await splitter.createDocuments([content])).length : 0;
    const delta = vectorCount - expectedChunks;
    console.log(`  Expected Chunks: ${expectedChunks}`);
    console.log(`  Chunk Delta: ${delta >= 0 ? '+' : ''}${delta}`);

    if (vectorCount > 0) {
      // 3. Optional: Check first vector metadata (don't print full vector)
      const firstVector = await prisma.knowledgeVector.findFirst({
        where: { knowledgeItemId: item.id },
        select: { chunkIndex: true, tokenCount: true, content: true },
      });
      console.log(
        `  Sample Chunk [${firstVector?.chunkIndex}]: ${firstVector?.content.substring(0, 50)}... (Tokens: ${firstVector?.tokenCount})`,
      );
    } else {
      console.log('  ⚠️ No vectors found! This item might not be vectorized yet.');
    }
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

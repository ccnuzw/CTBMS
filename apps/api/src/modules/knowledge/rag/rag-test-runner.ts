
import { NestFactory } from '@nestjs/core';
import { KnowledgeModule } from '../knowledge.module';
import { RagPipelineService } from './rag-pipeline.service';
import { Logger } from '@nestjs/common';

async function main() {
    const logger = new Logger('RagTestRunner');

    // Bootstrap Nest Context to inject dependencies
    const app = await NestFactory.createApplicationContext(KnowledgeModule);
    const service = app.get(RagPipelineService);

    logger.log('--- Starting RAG Pipeline POC Test ---');

    // Mock Data: A financial report text
    const docId = 'report_2023_q1';
    const text = `
  # Q1 Financial Report 2023

  The company showed strong growth in the first quarter.
  Revenue increased by 20% compared to last year.

  ## Key Metrics Table
  | Metric | Q1 2023 | Q1 2022 |
  | :--- | :--- | :--- |
  | Revenue | $100M | $80M |
  | Net Profit | $15M | $12M |
  | Users | 500K | 400K |

  The outlook for Q2 remains positive as we expand into new markets.
  CEO John Doe stated that "Innovation is our key driver."
  `;

    try {
        // 1. Ingest
        await service.ingest(docId, text); // Note: returns chunk count now

        // 2. Search specific data point (e.g. "Net Profit")
        const query = "Net Profit";
        logger.log(`\nSearching for: "${query}"...`);

        const results = await service.search(query);

        logger.log('\nTop Results (Fused Score):');
        results.forEach((r, i) => {
            logger.log(`[${i + 1}] Score: ${r.score.toFixed(4)} | Content: ${r.content?.replace(/\n/g, ' ').substring(0, 50)}...`);
        });

        // Verification Logic
        const topResult = results[0];
        if (topResult && topResult.content && topResult.content.includes('Net Profit')) {
            logger.log('\n✅ SUCCESS: Retrieved the chunk containing "Net Profit" as the top result.');
        } else {
            logger.log('\n❌ FAILURE: Top result did not contain expected keyword.');
        }
    } catch (error) {
        logger.error('Test failed', error);
    } finally {
        await app.close();
    }
}

main();

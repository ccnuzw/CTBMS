
import { RagPipelineService } from './rag-pipeline.service';

async function main() {
    const service = new RagPipelineService();

    console.log('--- Starting RAG Pipeline POC Test ---');

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

    // 1. Ingest
    await service.ingest(docId, text);

    // 2. Search specific data point (e.g. "Net Profit")
    const query = "Net Profit";
    console.log(`\nSearching for: "${query}"...`);

    const results = await service.search(query);

    console.log('\nTop Results (Fused Score):');
    results.forEach((r, i) => {
        console.log(`[${i + 1}] Score: ${r.score.toFixed(4)} | Content: ${r.content?.replace(/\n/g, ' ').substring(0, 50)}...`);
    });

    // Verification Logic
    const topResult = results[0];
    if (topResult && topResult.content && topResult.content.includes('Net Profit')) {
        console.log('\n✅ SUCCESS: Retrieved the chunk containing "Net Profit" as the top result.');
    } else {
        console.log('\n❌ FAILURE: Top result did not contain expected keyword.');
    }
}

main();

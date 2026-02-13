#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const checks = [
  {
    file: 'apps/web/src/routes/index.tsx',
    patterns: [
      "path: 'workflow/agents'",
      "path: 'workflow/parameters'",
      "path: 'workflow/connectors'",
    ],
  },
  {
    file: 'apps/web/src/layouts/MainLayout.tsx',
    patterns: [
      "key: '/workflow/agents'",
      "key: '/workflow/parameters'",
      "key: '/workflow/connectors'",
    ],
  },
  {
    file: 'apps/web/src/features/workflow-runtime/components/WorkflowExecutionPage.tsx',
    patterns: ['运行绑定快照 (_workflowBindings)', '未解析绑定', '复制编码'],
  },
];

let failed = false;

for (const check of checks) {
  const content = await readFile(check.file, 'utf8');
  for (const pattern of check.patterns) {
    if (!content.includes(pattern)) {
      failed = true;
      console.error(`[FAIL] ${check.file} missing pattern: ${pattern}`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
  console.error('workflow web smoke failed');
} else {
  console.log('workflow web smoke passed');
}

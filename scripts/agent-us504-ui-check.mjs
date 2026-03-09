#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const checks = [
  {
    file: 'apps/web/src/features/agent-copilot/components/StructuredResultView.tsx',
    rules: [
      { id: 'section-conclusion', pattern: '核心结论' },
      { id: 'section-evidence', pattern: '证据依据' },
      { id: 'section-risk', pattern: '风险提示' },
      { id: 'section-action', pattern: '建议操作' },
    ],
  },
  {
    file: 'apps/web/src/features/agent-copilot/components/AgentCopilotPage.tsx',
    rules: [
      { id: 'entry-send-report', pattern: '发送报告' },
      { id: 'entry-schedule-send', pattern: '定时发送' },
      { id: 'tab-delivery', pattern: "{ label: '发送', value: 'delivery' }" },
      { id: 'tab-schedule', pattern: "{ label: '定时', value: 'schedule' }" },
    ],
  },
];

const results = [];
for (const check of checks) {
  const absPath = path.join(root, check.file);
  const content = readFileSync(absPath, 'utf-8');
  for (const rule of check.rules) {
    const ok =
      rule.pattern instanceof RegExp
        ? rule.pattern.test(content)
        : content.includes(rule.pattern);
    results.push({
      file: check.file,
      rule: rule.id,
      pattern: String(rule.pattern),
      ok,
    });
  }
}

const failed = results.filter((item) => !item.ok);
if (failed.length > 0) {
  process.stderr.write('US-504 UI structure check failed\n');
  for (const item of failed) {
    process.stderr.write(
      `- ${item.file} :: ${item.rule} missing pattern ${item.pattern}\n`,
    );
  }
  process.exit(1);
}

process.stdout.write('US-504 UI structure check passed\n');
for (const item of results) {
  process.stdout.write(`- ${item.file} :: ${item.rule}\n`);
}

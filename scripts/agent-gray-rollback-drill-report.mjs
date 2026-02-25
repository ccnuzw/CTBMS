import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/aiagnet-chat/CTBMS对话原生智能体-灰度与回滚演练记录-v2.md');

const flags = [
  'AGENT_COPILOT_ENABLED',
  'AGENT_DELIVERY_MULTI_CHANNEL_ENABLED',
  'AGENT_SCHEDULE_NL_ENABLED',
  'AGENT_SKILL_RUNTIME_GRANT_ENABLED',
  'AGENT_ASSET_SEMANTIC_REUSE_ENABLED',
];

const now = new Date();
const statusRows = flags.map((name) => {
  const value = process.env[name];
  const enabled = value === '1' || value === 'true';
  return {
    name,
    value: value ?? '(unset)',
    status: enabled ? 'ON' : 'OFF',
  };
});

const lines = [];
lines.push('# CTBMS 对话原生智能体 灰度与回滚演练记录 v2');
lines.push('');
lines.push(`- 生成时间: ${now.toISOString()}`);
lines.push('- 演练模式: 文档化流程 + 开关状态快照');
lines.push('');
lines.push('## 1. 灰度开关快照');
lines.push('');
lines.push('| 开关 | 当前值 | 状态 |');
lines.push('| --- | --- | --- |');
for (const row of statusRows) {
  lines.push(`| ${row.name} | ${row.value} | ${row.status} |`);
}
lines.push('');
lines.push('## 2. 建议灰度顺序');
lines.push('');
lines.push('1. 开启 `AGENT_COPILOT_ENABLED`（只读会话）');
lines.push('2. 开启 `AGENT_ASSET_SEMANTIC_REUSE_ENABLED`（复用增强）');
lines.push('3. 开启 `AGENT_DELIVERY_MULTI_CHANNEL_ENABLED`（多渠道投递）');
lines.push('4. 开启 `AGENT_SCHEDULE_NL_ENABLED`（自然语言调度）');
lines.push('5. 开启 `AGENT_SKILL_RUNTIME_GRANT_ENABLED`（低风险先用后审）');
lines.push('');
lines.push('## 3. 回滚策略');
lines.push('');
lines.push('1. 按灰度逆序逐项关闭开关。');
lines.push('2. 执行 `pnpm workflow:type-check:split` 与 `pnpm --filter api run test:e2e:agent-suite`。');
lines.push('3. 执行 `pnpm agent:pre-release` 验证回滚后基线。');
lines.push('4. 若投递异常，优先关闭 `AGENT_DELIVERY_MULTI_CHANNEL_ENABLED`。');
lines.push('5. 若复用误选升高，关闭 `AGENT_ASSET_SEMANTIC_REUSE_ENABLED` 并保留显式 assetId 模式。');
lines.push('');
lines.push('## 4. 演练结论');
lines.push('');
lines.push('- 该文档用于记录当前环境开关状态与标准回滚步骤。');
lines.push('- 正式演练建议与 `pnpm agent:uat-report`、`pnpm agent:ops-report` 联动归档。');

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`Generated gray rollback drill report: ${reportPath}\n`);

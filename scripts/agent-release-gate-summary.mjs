import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();

const sources = {
  uat: resolve(root, 'docs/aiagnet-chat/CTBMS对话原生智能体-UAT自动验收报告-v2.md'),
  ops: resolve(root, 'docs/aiagnet-chat/CTBMS对话原生智能体-监控与告警基线-v2.md'),
  drill: resolve(root, 'docs/aiagnet-chat/CTBMS对话原生智能体-灰度与回滚演练记录-v2.md'),
};

const target = resolve(root, 'docs/aiagnet-chat/CTBMS对话原生智能体-上线门禁总结-v2.md');

const readStatus = (filePath, passPattern) => {
  if (!existsSync(filePath)) {
    return {
      exists: false,
      status: 'MISSING',
      matched: false,
    };
  }
  const content = readFileSync(filePath, 'utf8');
  const matched = passPattern.test(content);
  return {
    exists: true,
    status: matched ? 'PASS' : 'FAIL',
    matched,
    content,
  };
};

const statuses = {
  uat: readStatus(sources.uat, /结论:\s*PASS/),
  ops: readStatus(sources.ops, /基线检查结论:\s*PASS/),
  drill: readStatus(sources.drill, /灰度与回滚演练记录/),
};

const allReady =
  statuses.uat.status === 'PASS' &&
  statuses.ops.status === 'PASS' &&
  statuses.drill.status !== 'MISSING';

const generatedAt = new Date();

const lines = [];
lines.push('# CTBMS 对话原生智能体 上线门禁总结 v2');
lines.push('');
lines.push(`- 生成时间: ${generatedAt.toISOString()}`);
lines.push(`- 发布结论: ${allReady ? 'GO' : 'NO-GO'}`);
lines.push('');
lines.push('## 1. 门禁检查结果');
lines.push('');
lines.push('| 门禁项 | 来源文档 | 状态 |');
lines.push('| --- | --- | --- |');
lines.push(`| UAT 自动验收 | \`docs/aiagnet-chat/CTBMS对话原生智能体-UAT自动验收报告-v2.md\` | ${statuses.uat.status} |`);
lines.push(`| 监控与告警基线 | \`docs/aiagnet-chat/CTBMS对话原生智能体-监控与告警基线-v2.md\` | ${statuses.ops.status} |`);
lines.push(`| 灰度与回滚演练 | \`docs/aiagnet-chat/CTBMS对话原生智能体-灰度与回滚演练记录-v2.md\` | ${statuses.drill.status} |`);
lines.push('');
lines.push('## 2. 关键发布命令（建议顺序）');
lines.push('');
lines.push('1. `pnpm agent:pre-release`');
lines.push('2. `pnpm agent:uat-report`');
lines.push('3. `pnpm agent:ops-report`');
lines.push('4. `pnpm agent:gray-rollback-report`');
lines.push('5. `pnpm agent:release-gate-summary`');
lines.push('');
lines.push('## 3. 风险与处置建议');
lines.push('');
if (allReady) {
  lines.push('- 当前门禁项全部达标，可进入灰度发布。');
  lines.push('- 建议先小流量灰度，再逐级扩大。');
  lines.push('- 继续监控：执行失败率、投递失败率、P95 延迟、高风险待审数量。');
} else {
  if (statuses.uat.status !== 'PASS') {
    lines.push('- UAT 未达标，禁止发布。');
  }
  if (statuses.ops.status !== 'PASS') {
    lines.push('- 监控基线未达标，需先修复告警项。');
  }
  if (statuses.drill.status === 'MISSING') {
    lines.push('- 缺少灰度回滚演练记录，需补齐后再评审。');
  }
}
lines.push('');
lines.push('## 4. 结果摘要');
lines.push('');
lines.push(`- GO/NO-GO: ${allReady ? 'GO' : 'NO-GO'}`);
lines.push(`- 备注: ${allReady ? '满足发布门禁条件' : '存在未通过项，需修复后重评'}`);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`Generated release gate summary: ${target}\n`);

if (!allReady) {
  process.exit(1);
}

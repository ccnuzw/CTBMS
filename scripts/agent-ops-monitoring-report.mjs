import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const reportPath = resolve(root, 'docs/aiagnet-chat/CTBMS对话原生智能体-监控与告警基线-v2.md');
const uatPath = resolve(root, 'docs/aiagnet-chat/CTBMS对话原生智能体-UAT自动验收报告-v2.md');

const runCommand = (command) => {
  const startedAt = new Date();
  try {
    execSync(command, {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const endedAt = new Date();
    return {
      command,
      status: 'PASS',
      startedAt,
      endedAt,
      durationSec: Number(((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)),
      snippet: 'ok',
    };
  } catch (error) {
    const endedAt = new Date();
    const raw =
      typeof error?.stdout === 'string'
        ? error.stdout
        : typeof error?.stderr === 'string'
          ? error.stderr
          : String(error);
    return {
      command,
      status: 'FAIL',
      startedAt,
      endedAt,
      durationSec: Number(((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)),
      snippet: raw.split('\n').slice(-20).join('\n'),
    };
  }
};

const uatStatus = (() => {
  if (!existsSync(uatPath)) {
    return 'MISSING';
  }
  const content = readFileSync(uatPath, 'utf8');
  if (content.includes('结论: PASS')) {
    return 'PASS';
  }
  if (content.includes('结论: FAIL')) {
    return 'FAIL';
  }
  return 'UNKNOWN';
})();

const checks = [
  runCommand('pnpm workflow:type-check:split'),
  runCommand('pnpm --filter api run test:e2e:agent-suite'),
];

const generatedAt = new Date();
const allPass = checks.every((item) => item.status === 'PASS') && uatStatus === 'PASS';

const alertRules = [
  ['会话执行失败率', '< 2% / 1h', 'warning>=2%', 'critical>=5%'],
  ['导出失败率', '< 1% / 1h', 'warning>=1%', 'critical>=3%'],
  ['投递失败率', '< 2% / 1h', 'warning>=2%', 'critical>=5%'],
  ['P95 响应延迟', '< 12s', 'warning>=12s', 'critical>=20s'],
  ['高风险草稿待审', '<= 5', 'warning>5', 'critical>10'],
  ['活跃授权1h内过期', '<= 3', 'warning>3', 'critical>8'],
];

const lines = [];
lines.push('# CTBMS 对话原生智能体 监控与告警基线 v2');
lines.push('');
lines.push(`- 生成时间: ${generatedAt.toISOString()}`);
lines.push(`- UAT 状态: ${uatStatus}`);
lines.push(`- 基线检查结论: ${allPass ? 'PASS' : 'FAIL'}`);
lines.push('');
lines.push('## 告警规则');
lines.push('');
lines.push('| 指标 | 目标 | Warning | Critical |');
lines.push('| --- | --- | --- | --- |');
for (const [metric, target, warning, critical] of alertRules) {
  lines.push(`| ${metric} | ${target} | ${warning} | ${critical} |`);
}
lines.push('');
lines.push('## 自动检查结果');
lines.push('');
lines.push('| 检查项 | 状态 | 耗时(秒) |');
lines.push('| --- | --- | --- |');
for (const item of checks) {
  lines.push(`| \`${item.command}\` | ${item.status} | ${item.durationSec} |`);
}
lines.push('');
for (const item of checks) {
  lines.push(`### ${item.command}`);
  lines.push('');
  lines.push(`- 状态: ${item.status}`);
  lines.push(`- 开始: ${item.startedAt.toISOString()}`);
  lines.push(`- 结束: ${item.endedAt.toISOString()}`);
  lines.push('');
  lines.push('```text');
  lines.push(item.snippet || '(no output)');
  lines.push('```');
  lines.push('');
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`Generated monitoring baseline report: ${reportPath}\n`);

if (!allPass) {
  process.exit(1);
}

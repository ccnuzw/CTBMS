import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();

const checks = [
  {
    requirement: '1. 自然对话直达结果',
    case: '会话创建/多轮自动执行主链路',
    command: 'pnpm --filter api exec ts-node test/agent-conversation.e2e-spec.ts',
  },
  {
    requirement: '2. 自生成能力与 Skill 能力',
    case: 'Skill Draft + 审批流 + 运行时授权治理',
    command: 'pnpm --filter api exec ts-node test/agent-conversation-skill-draft.e2e-spec.ts',
  },
  {
    requirement: '3. 无配置多轮 + 结果复用',
    case: '资产语义复用 + 跨轮候选选择',
    command: 'pnpm --filter api exec ts-node test/agent-conversation-assets.e2e-spec.ts',
  },
  {
    requirement: '4. 聊天展示 + 多渠道投递',
    case: '导出 + Email/DingTalk/WeCom/Feishu adapter',
    command: 'pnpm --filter api exec ts-node test/agent-conversation-delivery.e2e-spec.ts',
  },
  {
    requirement: '5. 对话式定时任务',
    case: '自然语言调度创建/暂停/恢复',
    command: 'pnpm --filter api exec ts-node test/agent-conversation-schedule.e2e-spec.ts',
  },
  {
    requirement: '全链路质量门禁',
    case: 'type-check + suite + pre-release',
    command: 'pnpm agent:pre-release',
  },
];

const runCheck = (item) => {
  const startedAt = new Date();
  try {
    execSync(item.command, {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const endedAt = new Date();
    return {
      ...item,
      status: 'PASS',
      startedAt,
      endedAt,
      durationSec: Number(((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)),
      outputSnippet: 'ok',
    };
  } catch (error) {
    const endedAt = new Date();
    const raw =
      typeof error?.stdout === 'string'
        ? error.stdout
        : typeof error?.stderr === 'string'
          ? error.stderr
          : String(error);
    const snippet = raw.split('\n').slice(-25).join('\n');
    return {
      ...item,
      status: 'FAIL',
      startedAt,
      endedAt,
      durationSec: Number(((endedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)),
      outputSnippet: snippet,
    };
  }
};

const results = checks.map((item) => runCheck(item));
const total = results.length;
const passed = results.filter((item) => item.status === 'PASS').length;
const failed = total - passed;
const generatedAt = new Date();

const reportPath = resolve(
  root,
  'docs/aiagnet-chat/CTBMS对话原生智能体-UAT自动验收报告-v2.md',
);
mkdirSync(dirname(reportPath), { recursive: true });

const lines = [];
lines.push('# CTBMS 对话原生智能体 UAT 自动验收报告 v2');
lines.push('');
lines.push(`- 生成时间: ${generatedAt.toISOString()}`);
lines.push(`- 总检查项: ${total}`);
lines.push(`- 通过: ${passed}`);
lines.push(`- 失败: ${failed}`);
lines.push(`- 结论: ${failed === 0 ? 'PASS' : 'FAIL'}`);
lines.push('');
lines.push('## 结果总览');
lines.push('');
lines.push('| 需求 | 用例 | 状态 | 耗时(秒) |');
lines.push('| --- | --- | --- | --- |');
for (const item of results) {
  lines.push(`| ${item.requirement} | ${item.case} | ${item.status} | ${item.durationSec} |`);
}
lines.push('');
lines.push('## 执行明细');
lines.push('');
for (const item of results) {
  lines.push(`### ${item.requirement} - ${item.case}`);
  lines.push('');
  lines.push(`- 命令: \`${item.command}\``);
  lines.push(`- 状态: ${item.status}`);
  lines.push(`- 开始: ${item.startedAt.toISOString()}`);
  lines.push(`- 结束: ${item.endedAt.toISOString()}`);
  lines.push(`- 耗时: ${item.durationSec}s`);
  lines.push('');
  lines.push('```text');
  lines.push(item.outputSnippet || '(no output)');
  lines.push('```');
  lines.push('');
}

writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`Generated UAT report: ${reportPath}\n`);

if (failed > 0) {
  process.exit(1);
}

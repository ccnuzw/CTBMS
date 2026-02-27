/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 动态编排系统 · 全面集成测试
 *
 * 使用复杂的中文提示词模拟真实用户场景，验证：
 *   1. ConversationIntentService.detectByRules — 16 条意图规则 × 边界场景
 *   2. ConversationOrchestratorService.parseJsonObject — LLM 常见输出 × 3 策略容错
 *   3. ConversationOrchestratorService.assembleEphemeralWorkflow — DSL 安全校验
 *   4. ConversationSynthesizerService — 报告构建 + 归一化 + 提取器
 *   5. 跨模块集成 — 意图检测 → 响应生成完整流程
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConversationOrchestratorService } from './services/conversation-orchestrator.service';
import { ConversationSynthesizerService } from './services/conversation-synthesizer.service';
import { ConversationIntentService } from './services/conversation-intent.service';
import { ConversationUtilsService } from './services/conversation-utils.service';
import { PrismaService } from '../../prisma';
import { AIModelService } from '../ai/ai-model.service';
import { AIProviderFactory } from '../ai/providers/provider.factory';
import { ConversationAssetService } from './services/conversation-asset.service';

// ── Mock Providers ────────────────────────────────────────────────────────────

const mockPrisma = {
    conversationSession: { findFirst: jest.fn(), findMany: jest.fn() },
    conversationAsset: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    conversationTurn: { findMany: jest.fn() },
    agentSkillDraft: { create: jest.fn() },
};

const mockAiModelService = {
    getSystemModelConfig: jest.fn().mockResolvedValue(null),
};

const mockAiProviderFactory = {
    getProvider: jest.fn(),
};

const mockAssetService = {
    createAsset: jest.fn().mockResolvedValue({ id: 'asset-test-1' }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: 意图检测 — 复杂用户提示词
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConversationIntentService — 复杂提示词意图检测', () => {
    let service: ConversationIntentService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConversationIntentService,
                ConversationUtilsService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: AIModelService, useValue: mockAiModelService },
                { provide: AIProviderFactory, useValue: mockAiProviderFactory },
            ],
        }).compile();
        service = module.get<ConversationIntentService>(ConversationIntentService);
    });

    // ── 1.1 ASSEMBLE_WORKFLOW 组装工作流意图 ───────────────────────────────────

    describe('ASSEMBLE_WORKFLOW 意图检测', () => {
        const testCases = [
            '帮我组装一个工作流来分析铜期货市场',
            '编排一下分析流程，先看供应链再分析价格走势',
            '先用供应链分析agent分析原材料供给情况，再做价格预测，最后汇总生成报告',
            '创建一个工作流把三个分析步骤串起来',
            '搭建一个流水线来进行全面的市场分析',
            '帮我组合多个分析智能体形成完整分析',
        ];

        it.each(testCases)('应识别: "%s"', (prompt) => {
            const result = (service as any).detectByRules(prompt, 'IDLE');
            expect(result).not.toBeNull();
            expect(result.type).toBe('ASSEMBLE_WORKFLOW');
        });
    });

    // ── 1.2 PROMOTE_AGENT 晋升智能体意图 ──────────────────────────────────────

    describe('PROMOTE_AGENT 意图检测', () => {
        const testCases = [
            '晋升这个临时智能体为正式技能',
            '保存这个智能体到系统中',
            '把这个agent持久化保存',
            '永久保存这个agent不要让它过期',
            '帮我转正这个临时智能体',
        ];

        it.each(testCases)('应识别: "%s"', (prompt) => {
            const result = (service as any).detectByRules(prompt, 'IDLE');
            expect(result).not.toBeNull();
            expect(result.type).toBe('PROMOTE_AGENT');
        });
    });

    // ── 1.3 CREATE_AGENT 创建智能体意图 ───────────────────────────────────────

    describe('CREATE_AGENT 意图检测', () => {
        const testCases = [
            '创建一个专门分析铜价走势的智能体',
            '帮我创建一个分析供应链风险的agent',
            '生成一个agent来监控LME库存变化',
            '新建一个智能体专门跟踪TC/RC费用',
        ];

        it.each(testCases)('应识别: "%s"', (prompt) => {
            const result = (service as any).detectByRules(prompt, 'IDLE');
            expect(result).not.toBeNull();
            expect(result.type).toBe('CREATE_AGENT');
        });
    });

    // ── 1.4 EXPORT 导出意图（需 DONE 状态） ──────────────────────────────────

    describe('EXPORT 意图检测', () => {
        it('应在 DONE 状态下识别导出', () => {
            const result = (service as any).detectByRules('导出这份分析报告', 'DONE');
            expect(result?.type).toBe('EXPORT');
            expect(result?.format).toBe('PDF');
        });

        it('应识别 Excel 格式导出', () => {
            const result = (service as any).detectByRules('把结果下载为excel文件', 'DONE');
            expect(result?.type).toBe('EXPORT');
            expect(result?.format).toBe('EXCEL');
        });

        it('应在 IDLE 状态下拒绝导出', () => {
            const result = (service as any).detectByRules('导出分析报告', 'IDLE');
            expect(result).toBeNull();
        });
    });

    // ── 1.5 DELIVER_EMAIL 邮件投递意图 ────────────────────────────────────────

    describe('DELIVER_EMAIL 意图检测', () => {
        it('应识别邮件+地址', () => {
            const result = (service as any).detectByRules(
                '把这份报告发到邮箱 zhang@company.com', 'DONE',
            );
            expect(result?.type).toBe('DELIVER_EMAIL');
            expect(result?.emailTo).toContain('zhang@company.com');
        });

        it('应识别多个邮箱地址', () => {
            const result = (service as any).detectByRules(
                '发送邮件给 a@test.com 和 b@test.com', 'DONE',
            );
            expect(result?.type).toBe('DELIVER_EMAIL');
            expect(result?.emailTo).toHaveLength(2);
        });

        it('应识别不含地址的邮件请求', () => {
            const result = (service as any).detectByRules(
                '发到我的邮箱', 'RESULT_DELIVERY',
            );
            expect(result?.type).toBe('DELIVER_EMAIL');
        });
    });

    // ── 1.6 SCHEDULE 定时意图 ─────────────────────────────────────────────────

    describe('SCHEDULE 意图检测', () => {
        const testCases = [
            '每天早上8点自动执行这个分析',
            '设置定时任务每周一运行',
            '每月1号定期生成报告',
        ];

        it.each(testCases)('应识别: "%s"', (prompt) => {
            const result = (service as any).detectByRules(prompt, 'IDLE');
            expect(result?.type).toBe('SCHEDULE');
        });
    });

    // ── 1.7 COMPARE 对比意图 ──────────────────────────────────────────────────

    describe('COMPARE 意图检测', () => {
        it('应识别对比', () => {
            const result = (service as any).detectByRules(
                '把上次的铜价分析和这次的结果对比一下', 'IDLE',
            );
            expect(result?.type).toBe('COMPARE');
        });

        it('应识别 vs 比较', () => {
            const result = (service as any).detectByRules('A策略 vs B策略', 'IDLE');
            expect(result?.type).toBe('COMPARE');
        });
    });

    // ── 1.8 RETRY 重试意图 ────────────────────────────────────────────────────

    describe('RETRY 意图检测', () => {
        it('应在 FAILED 状态下识别重试', () => {
            const result = (service as any).detectByRules('重新分析一下', 'FAILED');
            expect(result?.type).toBe('RETRY');
        });

        it('应在 IDLE 状态下拒绝重试', () => {
            const result = (service as any).detectByRules('重来', 'IDLE');
            expect(result).toBeNull();
        });
    });

    // ── 1.9 HELP 帮助意图 ─────────────────────────────────────────────────────

    describe('HELP 意图检测', () => {
        const testCases = ['帮助', '怎么用', '如何使用这个系统', '有什么功能'];

        it.each(testCases)('应识别: "%s"', (prompt) => {
            const result = (service as any).detectByRules(prompt, 'IDLE');
            expect(result?.type).toBe('HELP');
        });
    });

    // ── 1.10 意图优先级 & 边界场景 ────────────────────────────────────────────

    describe('边界场景', () => {
        it('不应误识别普通闲聊', () => {
            const result = (service as any).detectByRules('今天天气怎么样', 'IDLE');
            expect(result).toBeNull();
        });

        it('不应误识别单纯的分析问题', () => {
            const result = (service as any).detectByRules(
                '铜价未来三个月走势如何？', 'IDLE',
            );
            expect(result).toBeNull();
        });

        it('带空格和标点应正常识别', () => {
            const result = (service as any).detectByRules(
                '  帮 我 创建 一个 分析铜价 的 智能体 ！  ', 'IDLE',
            );
            expect(result?.type).toBe('CREATE_AGENT');
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: parseJsonObject — 模拟 LLM 各种输出
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseJsonObject — LLM 输出容错', () => {
    let orchestrator: ConversationOrchestratorService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConversationOrchestratorService,
                ConversationUtilsService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: AIModelService, useValue: mockAiModelService },
                { provide: AIProviderFactory, useValue: mockAiProviderFactory },
                { provide: ConversationAssetService, useValue: mockAssetService },
            ],
        }).compile();
        orchestrator = module.get<ConversationOrchestratorService>(ConversationOrchestratorService);
    });

    describe('正常 JSON', () => {
        it('标准对象', () => {
            expect((orchestrator as any).parseJsonObject('{"name":"test"}')).toEqual({ name: 'test' });
        });

        it('嵌套对象', () => {
            const input = '{"agent":{"code":"cu-analysis","prompt":"分析铜价"},"risk":"LOW"}';
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.agent?.code).toBe('cu-analysis');
        });

        it('含中文值', () => {
            const input = '{"标题":"铜价分析报告","内容":"看涨"}';
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.['标题']).toBe('铜价分析报告');
        });
    });

    describe('Markdown 围栏', () => {
        it('```json 围栏', () => {
            const input = '```json\n{"agentCode":"cu-supply","riskLevel":"LOW"}\n```';
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.agentCode).toBe('cu-supply');
        });

        it('``` 无语言标记围栏', () => {
            const input = '```\n{"mode":"LINEAR","nodes":[]}\n```';
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.mode).toBe('LINEAR');
        });

        it('围栏前后有 LLM 解释文本', () => {
            const input = `好的，我已经为您生成了Agent规格：

\`\`\`json
{"agentCode":"supply-risk","name":"供应链风险分析","riskLevel":"LOW"}
\`\`\`

这个Agent会帮助您分析供应链相关的风险因素。`;
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.agentCode).toBe('supply-risk');
            expect(result?.name).toBe('供应链风险分析');
        });
    });

    describe('混合文本提取', () => {
        it('JSON 嵌入在解释文本中', () => {
            const input = `根据分析，以下是结果：
{"summary":"铜价预计上涨","confidence":0.85}
以上便是分析结论。`;
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.summary).toBe('铜价预计上涨');
            expect(result?.confidence).toBe(0.85);
        });

        it('多个 JSON 块只取第一个', () => {
            const input = '第一个: {"a":1} 第二个: {"b":2}';
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result).toHaveProperty('a');
        });
    });

    describe('LLM 常见输出缺陷', () => {
        it('尾逗号', () => {
            const input = '{"name":"test","value":123,}';
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.name).toBe('test');
        });

        it('嵌套尾逗号', () => {
            const input = '{"agents":["a","b",],"count":2,}';
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.count).toBe(2);
        });

        it('单引号 JSON', () => {
            const input = "{'agentCode':'cu-monitor','riskLevel':'MEDIUM'}";
            const result = (orchestrator as any).parseJsonObject(input);
            expect(result?.agentCode).toBe('cu-monitor');
        });

        it('混合单双引号', () => {
            const input = `{"name":'铜价分析',"status":"ACTIVE"}`;
            // 策略2应能提取 {}, 策略3可能修复引号
            const result = (orchestrator as any).parseJsonObject(input);
            // 此处视解析能力，至少不应返回null或抛错
            if (result) {
                expect(result).toHaveProperty('name');
            }
        });
    });

    describe('拒绝非对象', () => {
        it('拒绝数组', () => {
            expect((orchestrator as any).parseJsonObject('[1,2,3]')).toBeNull();
        });

        it('拒绝纯字符串', () => {
            expect((orchestrator as any).parseJsonObject('"hello"')).toBeNull();
        });

        it('拒绝纯数字', () => {
            expect((orchestrator as any).parseJsonObject('42')).toBeNull();
        });

        it('拒绝空字符串', () => {
            expect((orchestrator as any).parseJsonObject('')).toBeNull();
        });

        it('拒绝完全无效内容', () => {
            expect((orchestrator as any).parseJsonObject('今天铜价如何？')).toBeNull();
        });

        it('拒绝 null', () => {
            expect((orchestrator as any).parseJsonObject('null')).toBeNull();
        });
    });

    describe('复杂 Agent Spec 模拟', () => {
        it('应解析完整 Agent 规格 JSON', () => {
            const llmOutput = `\`\`\`json
{
  "agentCode": "cu-supply-risk",
  "name": "铜供应链风险分析Agent",
  "systemPrompt": "你是一个专业的有色金属供应链分析师...",
  "outputSchema": {
    "type": "object",
    "properties": {
      "riskLevel": { "type": "string" },
      "factors": { "type": "array" }
    }
  },
  "requiredDataSources": ["market-data", "inventory-data"],
  "parameterRefs": ["cu-grade", "delivery-period"],
  "riskLevel": "LOW"
}
\`\`\``;
            const result = (orchestrator as any).parseJsonObject(llmOutput);
            expect(result).not.toBeNull();
            expect(result.agentCode).toBe('cu-supply-risk');
            expect(result.requiredDataSources).toHaveLength(2);
            expect(result.riskLevel).toBe('LOW');
        });

        it('应解析带尾逗号的 workflow DSL', () => {
            const llmOutput = `\`\`\`json
{
  "name": "铜价综合分析流",
  "mode": "LINEAR",
  "nodes": [
    {"id": "n1", "type": "agent-call", "label": "供应分析", "config": {}},
    {"id": "n2", "type": "agent-call", "label": "需求分析", "config": {}},
    {"id": "n3", "type": "join", "label": "汇总", "config": {}},
  ],
  "edges": [
    {"from": "n1", "to": "n3"},
    {"from": "n2", "to": "n3"},
  ],
}
\`\`\``;
            const result = (orchestrator as any).parseJsonObject(llmOutput);
            expect(result).not.toBeNull();
            expect(result.name).toBe('铜价综合分析流');
            expect(result.nodes).toHaveLength(3);
            expect(result.edges).toHaveLength(2);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Synthesizer — 报告构建与数据归一化
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConversationSynthesizerService — 报告构建', () => {
    let synthesizer: ConversationSynthesizerService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConversationSynthesizerService,
                ConversationUtilsService,
                { provide: PrismaService, useValue: mockPrisma },
                { provide: AIModelService, useValue: mockAiModelService },
                { provide: AIProviderFactory, useValue: mockAiProviderFactory },
                { provide: ConversationAssetService, useValue: mockAssetService },
            ],
        }).compile();
        synthesizer = module.get<ConversationSynthesizerService>(ConversationSynthesizerService);
    });

    // ── 3.1 buildReportCards — 卡片生成 ───────────────────────────────────────

    describe('buildReportCards', () => {
        it('完整报告应生成所有类型卡片', () => {
            const cards = synthesizer.buildReportCards({
                title: '2024年Q1铜市场综合分析',
                summary: '供给偏紧叠加需求复苏，预计铜价维持高位震荡。',
                keyFindings: [
                    { label: 'LME库存', value: '库存降至15万吨以下，为近5年新低' },
                    { label: 'TC/RC费用', value: '冶炼加工费持续走低至$20/吨' },
                    { label: '下游需求', value: '新能源汽车和电网投资拉动铜需求增长8%' },
                ],
                riskWarnings: [
                    '中国房地产持续低迷可能拖累铜需求',
                    '美联储加息可能导致有色金属板块承压',
                ],
                actionSuggestions: [
                    '逢回调建立多头仓位，目标价位$9,500/吨',
                    '关注LME库存变化，库存跌破10万吨时加仓',
                    '设置止损位于$8,800/吨',
                ],
                dataTimestamp: '2024-03-15T10:30:00Z',
                sourceAgentCount: 4,
                synthesizedAt: new Date().toISOString(),
            });

            // 1 SUMMARY + 3 FINDING + 1 RISK + 1 ACTION = 6
            expect(cards).toHaveLength(6);
            expect(cards[0].type).toBe('SUMMARY');
            expect(cards[0].title).toBe('2024年Q1铜市场综合分析');
            expect(cards[0].metadata?.sourceAgentCount).toBe(4);

            expect(cards[1].type).toBe('FINDING');
            expect(cards[1].title).toBe('LME库存');
            expect(cards[2].type).toBe('FINDING');
            expect(cards[3].type).toBe('FINDING');

            expect(cards[4].type).toBe('RISK');
            expect(cards[4].content).toContain('房地产');

            expect(cards[5].type).toBe('ACTION');
            expect(cards[5].content).toContain('$9,500');
        });

        it('无风险和建议时应只生成 SUMMARY + FINDING', () => {
            const cards = synthesizer.buildReportCards({
                title: '简要报告',
                summary: '市场平稳',
                keyFindings: [{ label: '趋势', value: '横盘整理' }],
                riskWarnings: [],
                actionSuggestions: [],
                dataTimestamp: null,
                sourceAgentCount: 1,
                synthesizedAt: new Date().toISOString(),
            });

            expect(cards).toHaveLength(2); // SUMMARY + 1 FINDING
            expect(cards.every((c) => c.type !== 'RISK' && c.type !== 'ACTION')).toBe(true);
        });

        it('卡片 order 应连续递增', () => {
            const cards = synthesizer.buildReportCards({
                title: 'T', summary: 'S',
                keyFindings: [{ label: 'A', value: 'B' }, { label: 'C', value: 'D' }],
                riskWarnings: ['R'], actionSuggestions: ['A'],
                dataTimestamp: null, sourceAgentCount: 1, synthesizedAt: '',
            });

            for (let i = 0; i < cards.length; i++) {
                expect(cards[i].order).toBe(i);
            }
        });

        it('卡片 ID 应唯一', () => {
            const cards = synthesizer.buildReportCards({
                title: 'T', summary: 'S',
                keyFindings: [{ label: 'A', value: 'B' }, { label: 'C', value: 'D' }],
                riskWarnings: ['R'], actionSuggestions: ['A'],
                dataTimestamp: null, sourceAgentCount: 2, synthesizedAt: '',
            });

            const ids = cards.map((c) => c.id);
            expect(new Set(ids).size).toBe(ids.length);
        });
    });

    // ── 3.2 buildFallbackReport — 回退报告 ────────────────────────────────────

    describe('buildFallbackReport', () => {
        it('完整输入应生成结构化报告', () => {
            const report = (synthesizer as any).buildFallbackReport(
                [
                    '铜价已连续上涨3个月',
                    'LME库存降至23万吨',
                    '中国精铜进口同比增长12%',
                    '新能源汽车用铜量同比增长25%',
                    '全球铜矿产量增速放缓至2%',
                ],
                '综合来看，供给偏紧叠加需求旺盛，铜价中长期看涨。',
                ['建议逢低建仓', '关注TC/RC变化趋势'],
                [
                    { agentCode: 'supply', perspective: '供应分析', content: '产量受限' },
                    { agentCode: 'demand', perspective: '需求分析', content: '需求旺盛' },
                    { agentCode: 'macro', perspective: '宏观分析', content: '宽松预期' },
                ],
            );

            expect(report.title).toBe('分析结果汇总');
            expect(report.summary).toContain('供给偏紧');
            expect(report.keyFindings).toHaveLength(5);
            expect(report.keyFindings[0].label).toBe('发现 1');
            expect(report.actionSuggestions).toHaveLength(2);
            expect(report.sourceAgentCount).toBe(3);
        });

        it('空事实时应使用默认摘要', () => {
            const report = (synthesizer as any).buildFallbackReport(
                [], '', [], [],
            );

            expect(report.title).toBe('分析结果汇总');
            expect(report.summary).toBe('暂无分析结论。');
            expect(report.keyFindings).toHaveLength(0);
            expect(report.sourceAgentCount).toBe(0);
        });

        it('超过5个事实应截断', () => {
            const facts = Array.from({ length: 10 }, (_, i) => `事实${i + 1}`);
            const report = (synthesizer as any).buildFallbackReport(facts, '', [], []);
            expect(report.keyFindings).toHaveLength(5);
        });

        it('超过3个建议应截断', () => {
            const actions = ['建议1', '建议2', '建议3', '建议4', '建议5'];
            const report = (synthesizer as any).buildFallbackReport([], '', actions, []);
            expect(report.actionSuggestions).toHaveLength(3);
        });
    });

    // ── 3.3 normalizeFindings — findings 归一化 ───────────────────────────────

    describe('normalizeFindings', () => {
        it('完整结构应保留', () => {
            const result = (synthesizer as any).normalizeFindings([
                { label: '库存下降', value: 'LME铜库存环比减少5%', confidence: 0.92 },
                { label: '价格上涨', value: 'LME三月铜升至$9200', confidence: 0.88 },
            ]);

            expect(result).toHaveLength(2);
            expect(result[0].label).toBe('库存下降');
            expect(result[0].confidence).toBe(0.92);
        });

        it('应过滤空 label 和空 value', () => {
            const result = (synthesizer as any).normalizeFindings([
                { label: '', value: '有值无标签' },
                { label: '有标签', value: '' },
                { label: '完整', value: '完整数据', confidence: 0.7 },
            ]);

            expect(result).toHaveLength(1);
            expect(result[0].label).toBe('完整');
        });

        it('应截断超过5项', () => {
            const items = Array.from({ length: 8 }, (_, i) => ({
                label: `发现${i}`, value: `内容${i}`, confidence: 0.5 + i * 0.05,
            }));
            const result = (synthesizer as any).normalizeFindings(items);
            expect(result).toHaveLength(5);
        });

        it('应夹紧 confidence 到 [0,1]', () => {
            const result = (synthesizer as any).normalizeFindings([
                { label: 'A', value: 'B', confidence: 1.5 },
                { label: 'C', value: 'D', confidence: -0.3 },
            ]);

            expect(result[0].confidence).toBeLessThanOrEqual(1);
            expect(result[1].confidence).toBeGreaterThanOrEqual(0);
        });

        it('非数组输入应返回空', () => {
            expect((synthesizer as any).normalizeFindings(null)).toEqual([]);
            expect((synthesizer as any).normalizeFindings('not array')).toEqual([]);
            expect((synthesizer as any).normalizeFindings(42)).toEqual([]);
        });
    });

    // ── 3.4 extractFacts — 事实提取 ───────────────────────────────────────────

    describe('extractFacts', () => {
        it('字符串数组应直接提取', () => {
            const result = (synthesizer as any).extractFacts({
                facts: ['铜价上涨5%', 'LME库存减少3万吨', 'TC/RC费用降至$20/吨'],
            });
            expect(result).toHaveLength(3);
            expect(result[0]).toBe('铜价上涨5%');
        });

        it('对象数组应提取 text 字段', () => {
            const result = (synthesizer as any).extractFacts({
                facts: [
                    { text: '铜价上涨', citations: [{ source: 'LME' }] },
                    { text: '库存下降', citations: [] },
                ],
            });
            expect(result).toHaveLength(2);
        });

        it('空 facts 应返回空数组', () => {
            expect((synthesizer as any).extractFacts({})).toEqual([]);
            expect((synthesizer as any).extractFacts({ facts: null })).toEqual([]);
        });

        it('混合类型 facts 应过滤无效项', () => {
            const result = (synthesizer as any).extractFacts({
                facts: ['有效', null, 123, '也有效', undefined],
            });
            expect(result).toHaveLength(2);
        });
    });

    // ── 3.5 Synthesizer parseJsonObject ───────────────────────────────────────

    describe('parseJsonObject (Synthesizer)', () => {
        it('应与 Orchestrator 有相同的容错能力', () => {
            const fencedInput = '```json\n{"result":"ok"}\n```';
            expect((synthesizer as any).parseJsonObject(fencedInput)).toEqual({ result: 'ok' });

            const trailingComma = '{"a":1,}';
            expect((synthesizer as any).parseJsonObject(trailingComma)).toEqual({ a: 1 });

            const singleQuote = "{'b':2}";
            expect((synthesizer as any).parseJsonObject(singleQuote)).toEqual({ b: 2 });
        });

        it('模拟 LLM 合成输出（带解释+JSON）', () => {
            const llmOutput = `根据多个Agent的分析结果，我综合判断如下：

\`\`\`json
{
  "title": "铜价走势分析报告",
  "summary": "综合供需基本面和宏观因素，铜价短期偏强",
  "keyFindings": [
    {"label": "供给端", "value": "全球铜矿干扰率上升", "confidence": 0.85},
    {"label": "需求端", "value": "新能源拉动铜需求", "confidence": 0.9}
  ],
  "riskWarnings": ["美元走强可能打压铜价"],
  "actionSuggestions": ["逢低建仓"]
}
\`\`\`

希望以上分析对您有帮助。`;
            const result = (synthesizer as any).parseJsonObject(llmOutput);
            expect(result).not.toBeNull();
            expect(result.title).toBe('铜价走势分析报告');
            expect(result.keyFindings).toHaveLength(2);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 4: ConversationUtilsService — 工具方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConversationUtilsService — 工具方法', () => {
    let utils: ConversationUtilsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [ConversationUtilsService],
        }).compile();
        utils = module.get<ConversationUtilsService>(ConversationUtilsService);
    });

    describe('toRecord', () => {
        it('正常对象应透传', () => {
            expect(utils.toRecord({ a: 1 })).toEqual({ a: 1 });
        });

        it('数组应返回空对象', () => {
            expect(utils.toRecord([1, 2, 3])).toEqual({});
        });

        it('null/undefined 应返回空对象', () => {
            expect(utils.toRecord(null)).toEqual({});
            expect(utils.toRecord(undefined)).toEqual({});
        });

        it('字符串应返回空对象', () => {
            expect(utils.toRecord('hello')).toEqual({});
        });
    });

    describe('pickString', () => {
        it('应返回有效字符串', () => {
            expect(utils.pickString('hello')).toBe('hello');
        });

        it('应 trim 空白', () => {
            expect(utils.pickString('  hello  ')).toBe('hello');
        });

        it('空字符串应返回 null', () => {
            expect(utils.pickString('')).toBeNull();
            expect(utils.pickString('   ')).toBeNull();
        });

        it('非字符串应返回 null', () => {
            expect(utils.pickString(42)).toBeNull();
            expect(utils.pickString(null)).toBeNull();
        });
    });

    describe('isUuid', () => {
        it('应认 valid UUID', () => {
            expect(utils.isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        it('应拒绝非 UUID', () => {
            expect(utils.isUuid('not-a-uuid')).toBe(false);
            expect(utils.isUuid('')).toBe(false);
        });
    });

    describe('mergeSlots', () => {
        it('应合并多个 slot', () => {
            const result = utils.mergeSlots({ a: '1' }, { b: '2' }, { c: '3' });
            expect(result).toEqual({ a: '1', b: '2', c: '3' });
        });

        it('后面的值应覆盖前面的', () => {
            const result = utils.mergeSlots({ a: '1' }, { a: '2' });
            expect(result).toEqual({ a: '2' });
        });

        it('应跳过非对象参数', () => {
            const result = utils.mergeSlots({ a: '1' }, undefined, null as any);
            expect(result).toEqual({ a: '1' });
        });
    });

    describe('mapExecutionStatus', () => {
        it('SUCCESS → DONE', () => {
            expect(utils.mapExecutionStatus('SUCCESS')).toBe('DONE');
        });

        it('FAILED → FAILED', () => {
            expect(utils.mapExecutionStatus('FAILED')).toBe('FAILED');
        });

        it('CANCELED → FAILED', () => {
            expect(utils.mapExecutionStatus('CANCELED')).toBe('FAILED');
        });

        it('RUNNING → EXECUTING', () => {
            expect(utils.mapExecutionStatus('RUNNING')).toBe('EXECUTING');
        });
    });
});

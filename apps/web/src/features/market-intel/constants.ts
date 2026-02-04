import { IntelCategory, IntelSourceType, type AIAnalysisResult } from '@packages/types';

// =============================================
// 采集规范配置
// =============================================

interface GuidelineItem {
  label: string;
  desc: string;
}

interface CategoryGuideline {
  title: string;
  color: string;
  items: GuidelineItem[];
}

export const INTEL_CATEGORY_GUIDELINES: Partial<Record<IntelCategory, CategoryGuideline>> = {
  [IntelCategory.A_STRUCTURED]: {
    title: 'AB类：文本采集 (价格/事件/洞察) 规范',
    color: 'blue',
    items: [
      { label: '价格数据', desc: '包含【品名】【价格】【单位】【水分】【容重】等要素，AI 自动提取为 A 类结构化数据。' },
      { label: '事件情报', desc: '遵循 5W1H 原则描述事件：时间、地点、主体、动作、影响，AI 自动提取为 B 类事件。' },
      { label: '后市洞察', desc: '包含预判和分析的内容，AI 会自动识别情绪倾向和预测方向。' },
      { label: '一份日报多类产出', desc: '系统会自动分析日报内容，同时提取价格数据、市场事件和洞察预判。' },
    ],
  },
  [IntelCategory.B_SEMI_STRUCTURED]: {
    title: 'AB类：文本采集 (价格/事件/洞察) 规范',
    color: 'blue',
    items: [
      { label: '价格数据', desc: '包含【品名】【价格】【单位】【水分】【容重】等要素，AI 自动提取为 A 类结构化数据。' },
      { label: '事件情报', desc: '遵循 5W1H 原则描述事件：时间、地点、主体、动作、影响，AI 自动提取为 B 类事件。' },
      { label: '后市洞察', desc: '包含预判和分析的内容，AI 会自动识别情绪倾向和预测方向。' },
      { label: '一份日报多类产出', desc: '系统会自动分析日报内容，同时提取价格数据、市场事件和洞察预判。' },
    ],
  },
  [IntelCategory.C_DOCUMENT]: {
    title: 'C类：混合文档与研报 (Reports & Minutes) 采集规范',
    color: 'orange',
    items: [
      { label: '扫描件识别', desc: '支持直接上传图片或拍摄文档，系统将自动执行 OCR 提取全文并建立索引。' },
      { label: '表格处理', desc: '文中的Excel表格或图片表格，AI会自动识别OCR并结构化，无需人工拆解。' },
      { label: '来源标注', desc: '必须注明会议时间、参会方或研报发布机构（如：XX咨询周报）。' },
      { label: '归档原则', desc: '原始文件归档在C类库，但提取出的数据会分发至全系统。' },
    ],
  },
};

// =============================================
// 任务类型
// =============================================

export interface Task {
  id: string;
  title: string;
  deadline: string;
  status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
  type: 'PRICE_REPORT' | 'FIELD_CHECK';
}

// =============================================
// 用户统计类型
// =============================================

export interface UserStats {
  rank: number;
  name: string;
  role: string;
  region: string;
  creditCoefficient: number;
  monthlyPoints: number;
  submissionCount: number;
  accuracyRate: number;
  highValueCount: number;
}

// =============================================
// 情报卡片类型（前端展示用）
// =============================================

export interface InfoCardMetadata {
  sourceType: IntelSourceType;
  submittedAt: string;
  effectiveTime: string;
  location: string;
  region?: string[];
  gps?: { lat: number; lng: number; verified: boolean };
  author: {
    name: string;
    role: string;
  };
}

export interface InfoCard {
  id: string;
  category: IntelCategory;
  metadata: InfoCardMetadata;
  rawContent: string;
  aiAnalysis: AIAnalysisResult;
  isFlagged: boolean;
  qualityScore?: {
    completeness: number;
    scarcity: number;
    validation: number;
    total: number;
  };
}

// =============================================
// Mock 数据
// =============================================

const today = new Date();
const setTime = (h: number, m: number): string => {
  const d = new Date(today);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const MOCK_TASKS: Task[] = [
  {
    id: 't-001',
    title: '晨间港口报价上报 (AM Price)',
    deadline: setTime(9, 30),
    status: 'PENDING',
    type: 'PRICE_REPORT',
  },
  {
    id: 't-002',
    title: '通辽梅花检修现场确认',
    deadline: setTime(14, 0),
    status: 'PENDING',
    type: 'FIELD_CHECK',
  },
];

export const MOCK_USERS: UserStats[] = [
  {
    rank: 1,
    name: '张三',
    role: '港口信息员',
    region: '辽宁省',
    creditCoefficient: 4.9,
    monthlyPoints: 2450,
    submissionCount: 85,
    accuracyRate: 98,
    highValueCount: 12,
  },
  {
    rank: 2,
    name: '王五',
    role: '高级分析师',
    region: '总部',
    creditCoefficient: 4.8,
    monthlyPoints: 2100,
    submissionCount: 42,
    accuracyRate: 99,
    highValueCount: 28,
  },
  {
    rank: 3,
    name: '李四',
    role: '区域业务员',
    region: '内蒙古',
    creditCoefficient: 4.5,
    monthlyPoints: 1850,
    submissionCount: 60,
    accuracyRate: 92,
    highValueCount: 8,
  },
  {
    rank: 4,
    name: '陈六',
    role: '物流专员',
    region: '吉林省',
    creditCoefficient: 4.2,
    monthlyPoints: 1200,
    submissionCount: 35,
    accuracyRate: 95,
    highValueCount: 5,
  },
  {
    rank: 5,
    name: '赵七',
    role: '实习生',
    region: '黑龙江',
    creditCoefficient: 3.8,
    monthlyPoints: 800,
    submissionCount: 50,
    accuracyRate: 85,
    highValueCount: 1,
  },
];

export const MOCK_CARDS: InfoCard[] = [
  // A类：市场数据
  {
    id: 'a-001',
    category: IntelCategory.A_STRUCTURED,
    metadata: {
      sourceType: IntelSourceType.FIRST_LINE,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      effectiveTime: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      location: '锦州港',
      region: ['辽宁省', '锦州市'],
      gps: { lat: 41.1, lng: 121.1, verified: true },
      author: { name: '张三', role: '港口信息员' },
    },
    rawContent: '锦州港玉米平舱价：2820元/吨。水分14.5%，容重720。',
    isFlagged: false,
    qualityScore: { completeness: 90, scarcity: 80, validation: 95, total: 88 },
    aiAnalysis: {
      summary: '锦州港今日玉米平舱价录入为2820元/吨，质量标准为水分14.5%、容重720，价格处于区域合理区间。',
      tags: ['#玉米', '#平舱价', '#锦州港'],
      sentiment: 'neutral',
      confidenceScore: 99,
      extractedData: { price: 2820, unit: '元/吨', commodity: '玉米', moisture: '14.5%' },
      entities: ['锦州港'],
    },
  },
  {
    id: 'a-002',
    category: IntelCategory.A_STRUCTURED,
    metadata: {
      sourceType: IntelSourceType.FIRST_LINE,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      effectiveTime: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      location: '锦州港',
      region: ['辽宁省', '锦州市'],
      gps: { lat: 41.1, lng: 121.1, verified: true },
      author: { name: '张三', role: '港口信息员' },
    },
    rawContent: '锦州港玉米平舱价：2810元/吨。',
    isFlagged: false,
    aiAnalysis: {
      summary: '锦州港昨日玉米平舱价2810元/吨。',
      tags: ['#玉米', '#平舱价', '#锦州港'],
      sentiment: 'neutral',
      confidenceScore: 98,
      extractedData: { price: 2810, unit: '元/吨', commodity: '玉米' },
      entities: ['锦州港'],
    },
  },
  {
    id: 'a-003',
    category: IntelCategory.A_STRUCTURED,
    metadata: {
      sourceType: IntelSourceType.COMPETITOR,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      effectiveTime: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      location: '通辽',
      region: ['内蒙古', '通辽市'],
      author: { name: '李四', role: '区域业务员' },
    },
    rawContent: '梅花味精挂牌价：2750元/吨。',
    isFlagged: false,
    qualityScore: { completeness: 80, scarcity: 50, validation: 90, total: 75 },
    aiAnalysis: {
      summary: '通辽梅花味精今日挂牌收购价2750元/吨。',
      tags: ['#玉米', '#挂牌价', '#梅花味精', '#深加工'],
      sentiment: 'neutral',
      confidenceScore: 95,
      extractedData: { price: 2750, unit: '元/吨', commodity: '玉米' },
      entities: ['梅花味精'],
    },
  },
  // B类：事件情报
  {
    id: 'b-001',
    category: IntelCategory.B_SEMI_STRUCTURED,
    metadata: {
      sourceType: IntelSourceType.FIRST_LINE,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      effectiveTime: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      location: '通辽',
      region: ['内蒙古', '通辽市'],
      gps: { lat: 43.6, lng: 122.2, verified: true },
      author: { name: '李四', role: '区域业务员' },
    },
    rawContent: '梅花味精今天突发通知，因设备检修，拒收30水以上的潮粮，门口排队车辆开始劝返。',
    isFlagged: false,
    qualityScore: { completeness: 95, scarcity: 100, validation: 80, total: 95 },
    aiAnalysis: {
      summary: '通辽梅花味精因设备检修拒收30水以上潮粮，导致物流积压。',
      tags: ['#停收', '#检修', '#梅花味精', '#物流'],
      sentiment: 'negative',
      confidenceScore: 95,
      structuredEvent: {
        subject: '梅花味精',
        action: '设备检修/拒收潮粮',
        impact: '车辆劝返/物流积压',
      },
      entities: ['梅花味精'],
    },
  },
  {
    id: 'b-002',
    category: IntelCategory.B_SEMI_STRUCTURED,
    metadata: {
      sourceType: IntelSourceType.COMPETITOR,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      effectiveTime: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
      location: '市场传闻',
      region: ['东北'],
      author: { name: '王五', role: '分析师' },
    },
    rawContent: '传闻吉林深加工补贴可能延期，但具体文件未下发，市场观望情绪浓厚。',
    isFlagged: false,
    qualityScore: { completeness: 60, scarcity: 80, validation: 50, total: 65 },
    aiAnalysis: {
      summary: '市场传闻吉林深加工补贴政策可能延期，由于缺乏官方文件确认，市场主体多持观望态度。',
      tags: ['#补贴', '#传闻', '#观望'],
      sentiment: 'neutral',
      confidenceScore: 70,
      structuredEvent: {
        subject: '吉林深加工补贴',
        action: '传闻延期',
        impact: '市场观望',
      },
      entities: ['吉林深加工'],
    },
  },
  // C类：知识库
  {
    id: 'c-001',
    category: IntelCategory.C_DOCUMENT,
    metadata: {
      sourceType: IntelSourceType.OFFICIAL,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      effectiveTime: '2024-05-01T00:00:00.000Z',
      location: '吉林省全境',
      region: ['吉林省'],
      author: { name: '王五', role: '高级分析师' },
    },
    rawContent: '[文件] 关于调整玉米深加工补贴的通知.pdf',
    isFlagged: false,
    qualityScore: { completeness: 100, scarcity: 40, validation: 100, total: 90 },
    aiAnalysis: {
      summary: '吉林省粮食局发布通知：自5月1日起，省内深加工补贴上调50元/吨，期限3个月。',
      tags: ['#政策', '#补贴', '#深加工'],
      sentiment: 'positive',
      confidenceScore: 98,
      entities: ['省粮食局'],
    },
  },
  {
    id: 'c-002',
    category: IntelCategory.C_DOCUMENT,
    metadata: {
      sourceType: IntelSourceType.COMPETITOR,
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      effectiveTime: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      location: '全国',
      region: ['全国'],
      author: { name: '王五', role: '高级分析师' },
    },
    rawContent: '[研报] 2024年二季度玉米供需平衡表预测.docx',
    isFlagged: false,
    aiAnalysis: {
      summary: '第三方机构预测二季度玉米缺口扩大至500万吨，建议增加备库。',
      tags: ['#研报', '#供需', '#预测'],
      sentiment: 'positive',
      confidenceScore: 90,
      entities: ['第三方机构'],
    },
  },
];

// K线图颜色配置
export const LINE_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#0891b2', // Cyan
  '#be123c', // Rose
  '#4d7c0f', // Lime
];

// =============================================
// AI 预测相关标签映射
// =============================================

// 合并情感/情绪/预测相关标签（对应 MARKET_SENTIMENT 字典域）
export const MARKET_SENTIMENT_LABELS: Record<string, string> = {
  // 标准 Code
  'BULLISH': '看涨/积极',
  'BEARISH': '看跌/消极',
  'NEUTRAL': '中性/震荡',
  'MIXED': '混合/波动',
  'STABLE': '平稳',
  'VOLATILE': '剧烈波动',
};

export const PREDICTION_TIMEFRAME_LABELS: Record<string, string> = {
  'SHORT': '短期',
  'MEDIUM': '中期',
  'LONG': '长期',
  'SHORT_TO_MEDIUM': '短中期',
  'MEDIUM_TO_LONG': '中长期',
};


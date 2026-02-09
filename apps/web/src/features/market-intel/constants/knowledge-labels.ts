export const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  DAILY: '日报',
  WEEKLY: '周报',
  MONTHLY: '月报',
  RESEARCH: '研报',
  POLICY: '政策',
  FLASH: '快讯',
  THIRD_PARTY: '外部资讯',
};

export const KNOWLEDGE_STATUS_META: Record<string, { label: string; color: string }> = {
  PUBLISHED: { label: '已发布', color: 'success' },
  PENDING_REVIEW: { label: '审核中', color: 'orange' },
  APPROVED: { label: '已通过', color: 'blue' },
  REJECTED: { label: '已拒绝', color: 'red' },
  DRAFT: { label: '草稿', color: 'default' },
  ARCHIVED: { label: '已归档', color: 'default' },
};

export const KNOWLEDGE_PERIOD_LABELS: Record<string, string> = {
  DAY: '日',
  WEEK: '周',
  MONTH: '月',
  QUARTER: '季度',
  YEAR: '年',
  ADHOC: '非周期',
};

export const KNOWLEDGE_SOURCE_LABELS: Record<string, string> = {
  FIRST_LINE: '一线采集',
  COMPETITOR: '竞对情报',
  OFFICIAL_GOV: '官方发布',
  OFFICIAL: '官方发布',
  RESEARCH_INST: '研究机构',
  MEDIA: '媒体报道',
  INTERNAL_REPORT: '内部研报',
};

export const KNOWLEDGE_RELATION_LABELS: Record<string, string> = {
  WEEKLY_ROLLUP_OF: '周报汇总自',
  DERIVED_FROM: '衍生自',
  SAME_TOPIC: '同主题',
  CITES: '引用',
  FOLLOW_UP: '后续跟进',
  CONTRADICTS: '观点冲突',
};

export const KNOWLEDGE_SENTIMENT_LABELS: Record<string, string> = {
  BULLISH: '偏多',
  BEARISH: '偏空',
  NEUTRAL: '中性',
};

export const KNOWLEDGE_TAG_LABELS: Record<string, string> = {
  SOYBEAN: '大豆',
  CORN: '玉米',
  PALM_OIL: '棕榈油',
  SOYBEAN_MEAL: '豆粕',
  SOYBEAN_OIL: '豆油',
  SUGAR: '白糖',
  COTTON: '棉花',
  HOG: '生猪',
  UREA: '尿素',
  WHEAT: '小麦',
  RICE: '稻谷',
};

export const formatKnowledgeTagLabel = (tag: string) => {
  const normalized = tag.trim().toUpperCase();
  return KNOWLEDGE_TAG_LABELS[normalized] || tag;
};

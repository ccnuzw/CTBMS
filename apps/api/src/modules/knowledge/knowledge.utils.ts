import { ContentType, ContentType as PrismaContentType, KnowledgePeriodType, KnowledgeStatus, ReviewStatus, KnowledgeType, Prisma } from '@prisma/client';
import { IntelCategory, KnowledgeRelationType } from '@prisma/client';

type KnowledgeListQuery = {
  type?: KnowledgeType;
  status?: KnowledgeStatus;
  periodType?: KnowledgePeriodType;
  periodKey?: string;
  sourceType?: string;
  commodity?: string;
  region?: string;
  keyword?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
  authorId?: string;
};
export type { KnowledgeListQuery };
type CreateKnowledgeInput = {
  type: KnowledgeType;
  title: string;
  contentPlain: string;
  contentRich?: string;
  sourceType?: string;
  publishAt?: Date;
  effectiveAt?: Date;
  periodType?: KnowledgePeriodType;
  periodKey?: string;
  location?: string;
  region?: string[];
  commodities?: string[];
  status?: KnowledgeStatus;
  authorId: string;
  summary?: string;
  tags?: string[];
};
export type { CreateKnowledgeInput };
type UpdateKnowledgeInput = Partial<CreateKnowledgeInput>;
export type { UpdateKnowledgeInput };
type BackfillResult = {
  intelProcessed: number;
  reportProcessed: number;
  failures: Array<{ source: 'intel' | 'report'; id: string; reason: string }>;
};
export type { BackfillResult };
type RelationQueryOptions = {
  types?: KnowledgeRelationType[];
  minWeight?: number;
  limit?: number;
  direction?: 'incoming' | 'outgoing' | 'both';
};
export type { RelationQueryOptions };
export function toContentType(type: KnowledgeType): ContentType {
    if (type === 'DAILY') return ContentType.DAILY_REPORT;
    return ContentType.RESEARCH_REPORT;
  }

export function mapLegacyContentTypeToKnowledgeType(
    contentType: PrismaContentType | null,
  ): KnowledgeType {
    if (contentType === 'DAILY_REPORT') return 'DAILY';
    if (contentType === 'RESEARCH_REPORT') return 'RESEARCH';
    return 'THIRD_PARTY';
  }

export function mapLegacyContentTypeToPeriodType(
    contentType: PrismaContentType | null,
  ): KnowledgePeriodType {
    if (contentType === 'DAILY_REPORT') return 'DAY';
    return 'ADHOC';
  }

export function mapReportPeriodToKnowledgePeriodType(
    reportPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ADHOC' | null,
  ): KnowledgePeriodType {
    if (reportPeriod === 'DAILY') return 'DAY';
    if (reportPeriod === 'WEEKLY') return 'WEEK';
    if (reportPeriod === 'MONTHLY') return 'MONTH';
    if (reportPeriod === 'QUARTERLY') return 'QUARTER';
    if (reportPeriod === 'ANNUAL') return 'YEAR';
    return 'ADHOC';
  }

export function mapReviewStatusToKnowledgeStatus(reviewStatus: ReviewStatus): KnowledgeStatus {
    if (reviewStatus === 'APPROVED') return 'PUBLISHED';
    if (reviewStatus === 'REJECTED') return 'REJECTED';
    if (reviewStatus === 'ARCHIVED') return 'ARCHIVED';
    return 'PENDING_REVIEW';
  }

export function toPeriodKey(date: Date, periodType: KnowledgePeriodType): string {
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const month = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${d.getUTCDate()}`.padStart(2, '0');

    if (periodType === 'DAY') return `${year}-${month}-${day}`;
    if (periodType === 'MONTH') return `${year}-${month}`;
    if (periodType === 'YEAR') return `${year}`;
    if (periodType === 'WEEK') {
      const week = getIsoWeek(d);
      return `${year}-W${String(week).padStart(2, '0')}`;
    }
    if (periodType === 'QUARTER') {
      const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
      return `${year}-Q${quarter}`;
    }
    return `${year}-${month}-${day}`;
  }

export function getIsoWeek(date: Date): number {
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

export function getWeekRange(date: Date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7;
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - day + 1);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const week = getIsoWeek(date);
    const periodKey = `${weekStart.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;

    return { weekStart, weekEnd, periodKey };
  }

export function buildWeeklySections(
    sourceItems: Array<{
      title: string;
      type: KnowledgeType;
      publishAt: Date | null;
      contentPlain: string;
      analysis: {
        summary: string | null;
        events: Prisma.JsonValue | null;
        insights: Prisma.JsonValue | null;
        prediction: Prisma.JsonValue | null;
        keyPoints: Prisma.JsonValue | null;
      } | null;
    }>,
  ) {
    const market: string[] = [];
    const events: string[] = [];
    const risks: string[] = [];
    const outlook: string[] = [];

    for (const item of sourceItems) {
      const summary = item.analysis?.summary || item.contentPlain.slice(0, 140);
      const date = item.publishAt ? new Date(item.publishAt).toISOString().slice(5, 10) : '未知';

      if (item.type === 'DAILY') {
        market.push(`[${date}] ${item.title}：${summary}`);
      }

      const rawEvents = Array.isArray(item.analysis?.events) ? item.analysis?.events : [];
      rawEvents.slice(0, 2).forEach((event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const text = event?.content || event?.impact || event?.action;
        if (text) events.push(`[${date}] ${text}`);
      });

      const rawInsights = Array.isArray(item.analysis?.insights) ? item.analysis?.insights : [];
      rawInsights.slice(0, 2).forEach((insight: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const text = insight?.content || insight?.title;
        if (text && /风险|波动|不确定|下行|紧张|承压/.test(text)) {
          risks.push(`[${date}] ${text}`);
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prediction = (item.analysis?.prediction || {}) as any;
      const outlookText = prediction?.reasoning || prediction?.logic;
      if (outlookText) {
        outlook.push(`[${date}] ${outlookText}`);
      }
    }

    const sectionResult = {
      market: market.slice(0, 8),
      events: events.slice(0, 8),
      risks: risks.slice(0, 6),
      outlook: outlook.slice(0, 6),
    };

    return sectionResult;
  }

export function renderWeeklyPlainContent(
    periodKey: string,
    sections: { market: string[]; events: string[]; risks: string[]; outlook: string[] },
  ) {
    const renderSection = (title: string, items: string[]) => {
      if (items.length === 0) return `${title}\n- 暂无结构化提取内容`;
      return `${title}\n${items.map((item) => `- ${item}`).join('\n')}`;
    };

    return [
      `${periodKey} 周报`,
      renderSection('一、行情', sections.market),
      renderSection('二、事件', sections.events),
      renderSection('三、风险', sections.risks),
      renderSection('四、展望', sections.outlook),
    ].join('\n\n');
  }

export function renderWeeklyRichContent(
    periodKey: string,
    sections: { market: string[]; events: string[]; risks: string[]; outlook: string[] },
  ) {
    const renderSection = (title: string, items: string[]) => {
      if (items.length === 0) {
        return `<h3>${title}</h3><p>暂无结构化提取内容</p>`;
      }
      const list = items.map((item) => `<li>${item}</li>`).join('');
      return `<h3>${title}</h3><ul>${list}</ul>`;
    };

    return [
      `<h2>${periodKey} 周报</h2>`,
      renderSection('一、行情', sections.market),
      renderSection('二、事件', sections.events),
      renderSection('三、风险', sections.risks),
      renderSection('四、展望', sections.outlook),
    ].join('');
  }

export function buildWeeklySummary(
    periodKey: string,
    sections: { market: string[]; events: string[]; risks: string[]; outlook: string[] },
    sourceCount: number,
  ) {
    const riskSignal = sections.risks.length >= 4 ? '风险信号偏强' : '风险总体可控';
    const outlookSignal =
      sections.outlook.length > 0 ? '建议关注下周关键变量变化。' : '下周展望信息仍需补充。';
    return `${periodKey} 周报基于 ${sourceCount} 条来源内容生成，覆盖行情（${sections.market.length}）、事件（${sections.events.length}）、风险（${sections.risks.length}）与展望（${sections.outlook.length}）四个维度。${riskSignal}${outlookSignal}`;
  }

export function buildWeeklyMetrics(sections: {
    market: string[];
    events: string[];
    risks: string[];
    outlook: string[];
  }) {
    const riskLevel =
      sections.risks.length >= 5 ? 'HIGH' : sections.risks.length >= 2 ? 'MEDIUM' : 'LOW';
    const sentiment = sections.outlook.some((line) => /看涨|偏强|上涨|改善/.test(line))
      ? 'BULLISH'
      : sections.outlook.some((line) => /看跌|承压|下行|走弱/.test(line))
        ? 'BEARISH'
        : 'NEUTRAL';

    const confidence = Math.max(
      55,
      Math.min(95, 55 + sections.market.length * 3 + sections.events.length * 2),
    );

    return {
      priceMoveCount: sections.market.length,
      eventCount: sections.events.length,
      riskLevel,
      sentiment,
      confidence,
    };
  }

export function parseWeeklyContent(content: string) {
    const market: string[] = [];
    const events: string[] = [];
    const risks: string[] = [];
    const outlook: string[] = [];

    // Normalize HTML: replace block tags with newlines
    const normalizedContent = content
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>?/gm, '') // Remove remaining tags
      .replace(/(?:\r\n|\r|\n)+/g, '\n') // Collapse multiple newlines
      .trim();

    // Helper to extract lines under a specific header
    const extractSection = (headerRegex: RegExp, targetArray: string[]) => {
      const lines = normalizedContent.split('\n');
      let inSection = false;
      for (const line of lines) {
        // If we hit a line that could be a new main header
        const isHeaderLine = /^(#+\s*|一、|二、|三、|四、|五、|六、|【)/.test(line.trim());

        if (headerRegex.test(line) && isHeaderLine) {
          inSection = true;
          continue;
        }

        // If we hit another main header, we stop
        if (inSection && isHeaderLine && !headerRegex.test(line)) {
          inSection = false;
          continue;
        }
        if (inSection) {
          const text = line.replace(/^[-*]\s*/, '').trim();
          if (text) targetArray.push(text);
        }
      }
    };

    extractSection(/行情|回顾|走势/, market);
    extractSection(/事件|政策|消息|供需/, events);
    extractSection(/风险|预警/, risks);
    extractSection(/展望|后市|预判/, outlook);

    return { market, events, risks, outlook };
  }


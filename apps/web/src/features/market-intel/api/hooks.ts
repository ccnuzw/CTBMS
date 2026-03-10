/**
 * @file hooks.ts (Barrel Re-export)
 *
 * 该文件已按领域拆分为以下文件：
 * - intel-hooks.ts   : 情报 CRUD、统计、排行榜、AI 分析、文档升级
 * - price-hooks.ts   : 价格数据、预警、对比分析、采集点、行政区划
 * - event-hooks.ts   : 市场事件、附件管理、过滤选项、趋势分析
 * - insight-hooks.ts : 市场洞察、关联内容
 * - search-hooks.ts  : 情报流、仪表盘、AI 简报、全景检索、搜索建议
 *
 * 本文件仅保留 re-export 以保持向后兼容。
 */

export * from './intel-hooks';
export * from './price-hooks';
export * from './event-hooks';
export * from './insight-hooks';
export * from './search-hooks';

/**
 * 状态机类枚举常量
 *
 * 这些枚举与代码逻辑强耦合，不适合做成数据字典。
 * 前端需要显示 label/color 时使用此文件的映射。
 */

// =============================================
// 填报批次状态 (SUBMISSION_STATUS)
// =============================================
export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  PARTIAL_APPROVED: '部分通过',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
};

export const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  PARTIAL_APPROVED: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
};

// =============================================
// 价格审核状态 (PRICE_REVIEW_STATUS)
// =============================================
export const PRICE_REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  AUTO_APPROVED: '自动通过',
};

export const PRICE_REVIEW_STATUS_COLORS: Record<string, string> = {
  PENDING: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  AUTO_APPROVED: 'success',
};

// =============================================
// 审核状态 (REVIEW_STATUS)
// =============================================
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  ARCHIVED: '已归档',
};

export const REVIEW_STATUS_COLORS: Record<string, string> = {
  PENDING: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
  ARCHIVED: 'default',
};

// =============================================
// 情报任务状态 (INTEL_TASK_STATUS)
// =============================================
export const INTEL_TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: '待处理',
  SUBMITTED: '已提交待审核',
  RETURNED: '已驳回需修改',
  COMPLETED: '已完成',
  OVERDUE: '已逾期',
};

export const INTEL_TASK_STATUS_COLORS: Record<string, string> = {
  PENDING: 'default',
  SUBMITTED: 'processing',
  RETURNED: 'warning',
  COMPLETED: 'success',
  OVERDUE: 'error',
};

// =============================================
// 情报流处理状态 (INTEL_FEED_STATUS)
// =============================================
export const INTEL_FEED_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  confirmed: '已确认',
  flagged: '已标记',
  archived: '已归档',
};

export const INTEL_FEED_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  confirmed: 'green',
  flagged: 'red',
  archived: 'default',
};

// =============================================
// 分配状态 (ALLOCATION_STATUS)
// =============================================
export const ALLOCATION_STATUS_LABELS: Record<string, string> = {
  ALLOCATED: '已分配',
  UNALLOCATED: '未分配',
};

export const ALLOCATION_STATUS_COLORS: Record<string, string> = {
  ALLOCATED: 'success',
  UNALLOCATED: 'default',
};

// =============================================
// 任务周期类型 (TASK_CYCLE_TYPE)
// =============================================
export const TASK_CYCLE_TYPE_LABELS: Record<string, string> = {
  DAILY: '每日',
  WEEKLY: '每周',
  MONTHLY: '每月',
  ONE_TIME: '一次性',
};

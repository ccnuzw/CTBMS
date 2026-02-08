/**
 * 数据字典分类常量
 * 用于字典管理界面的分类筛选和展示
 */

export const DOMAIN_CATEGORIES = {
    USER_ORG: { label: '用户组织', color: 'blue', icon: '👥' },
    TAG_ENTERPRISE: { label: '标签客商', color: 'green', icon: '🏷️' },
    REGION: { label: '区域点位', color: 'orange', icon: '📍' },
    PRICE: { label: '价格相关', color: 'red', icon: '💰' },
    INTEL: { label: '情报内容', color: 'purple', icon: '📊' },
    MARKET: { label: '市场分析', color: 'cyan', icon: '📈' },
} as const;

export type DomainCategory = keyof typeof DOMAIN_CATEGORIES;

export const DOMAIN_CATEGORY_OPTIONS = Object.entries(DOMAIN_CATEGORIES).map(
    ([value, { label }]) => ({ value, label }),
);

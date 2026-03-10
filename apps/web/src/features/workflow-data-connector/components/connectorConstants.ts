import { DataConnectorType } from '@packages/types';

// =============================================
// 常量映射
// =============================================

export const typeOptions: DataConnectorType[] = [
    'INTERNAL_DB',
    'REST_API',
    'EXCHANGE_API',
    'GRAPHQL',
    'FILE_IMPORT',
    'WEBHOOK',
];

export const ownerTypeOptions = ['SYSTEM', 'ADMIN'] as const;

export const connectorTypeLabelMap: Record<DataConnectorType, string> = {
    INTERNAL_DB: '内部数据库',
    REST_API: 'REST 接口',
    EXCHANGE_API: '交易所接口',
    GRAPHQL: 'GraphQL 接口',
    FILE_IMPORT: '文件导入',
    WEBHOOK: 'Webhook 回调',
};

export const connectorCategoryLabelMap: Record<string, string> = {
    MARKET_INTEL: '市场情报',
    MARKET_EVENT: '市场事件',
    MARKET_INSIGHT: '市场洞察',
    MARKET: '市场',
    PRICE: '价格',
    FUTURES: '期货',
    INTEL: '情报',
    ANALYSIS: '分析',
    TRADING: '交易',
    RISK_MANAGEMENT: '风控管理',
    MONITORING: '监控',
    REPORTING: '报表',
};

export const categoryOptions = Object.entries(connectorCategoryLabelMap).map(([value, label]) => ({
    label: `${label} (${value})`,
    value,
}));

// =============================================
// 工具函数
// =============================================

export const getConnectorTypeLabel = (value?: DataConnectorType | null): string => {
    if (!value) return '-';
    return connectorTypeLabelMap[value] ?? value;
};

export const getConnectorCategoryLabel = (value?: string | null): string => {
    if (!value) return '-';
    const normalized = value.trim().toUpperCase();
    return connectorCategoryLabelMap[normalized] ?? value;
};

export const getActiveStatusLabel = (value?: boolean): string => (value ? '启用' : '停用');

export const parsePositiveInt = (value: string | null, fallback: number): number => {
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
};

/**
 * 将名称自动转换为 SNAKE_CASE 编码
 * "内部价格数据" → "nei_bu_jia_ge_shu_ju" (简化拼音/直译)
 * 如果名称全是英文，则直接 UPPER_SNAKE_CASE
 */
export const slugifyConnectorCode = (name?: string): string => {
    if (!name?.trim()) return '';
    const trimmed = name.trim();
    // If all ASCII - just snake_case it
    if (/^[\x20-\x7e]+$/.test(trimmed)) {
        return trimmed
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
    }
    // For Chinese/mixed, produce a simplified slug
    return trimmed
        .replace(/[\s-]+/g, '_')
        .replace(/[^\w\u4e00-\u9fa5]+/g, '')
        .toUpperCase();
};

/**
 * 根据连接器类型，将结构化表单字段组装为 endpointConfig JSON
 */
export const assembleEndpointConfig = (
    type: DataConnectorType,
    formValues: Record<string, unknown>,
): Record<string, unknown> | undefined => {
    const ep = (formValues.endpointConfig ?? {}) as Record<string, unknown>;
    const clean = (obj: Record<string, unknown>) => {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            if (val !== undefined && val !== null && val !== '') {
                result[key] = val;
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    };

    switch (type) {
        case 'INTERNAL_DB':
            return clean({
                host: ep.host,
                port: ep.port,
                database: ep.database,
                schema: ep.schema,
                username: ep.username,
                password: ep.password,
                ssl: ep.ssl,
            });
        case 'REST_API':
            return clean({
                baseUrl: ep.baseUrl,
                authType: ep.authType,
                headerKey: ep.headerKey,
                headerValue: ep.headerValue,
                timeout: ep.timeout,
            });
        case 'EXCHANGE_API':
            return clean({
                baseUrl: ep.baseUrl,
                apiKey: ep.apiKey,
                secretKey: ep.secretKey,
            });
        case 'GRAPHQL':
            return clean({
                endpoint: ep.endpoint,
                wsEndpoint: ep.wsEndpoint,
                authHeader: ep.authHeader,
            });
        case 'FILE_IMPORT':
            return clean({
                filePath: ep.filePath,
                format: ep.format,
                delimiter: ep.delimiter,
                encoding: ep.encoding,
            });
        case 'WEBHOOK':
            return clean({
                callbackUrl: ep.callbackUrl,
                secretToken: ep.secretToken,
                retryCount: ep.retryCount,
                contentType: ep.contentType,
            });
        default:
            return ep && Object.keys(ep).length > 0 ? ep : undefined;
    }
};

/**
 * 将 endpointConfig JSON 反解为嵌套表单字段
 */
export const decomposeEndpointConfig = (config?: Record<string, unknown> | null) => {
    if (!config) return {};
    return { endpointConfig: config };
};

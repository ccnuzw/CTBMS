import { ChangeDetailSectionKey, ChangeDetailViewMode } from './types';

export const VALIDATION_GUIDANCE_MAP: Record<string, string> = {
    WF001: '请补齐流程基础信息（流程ID、名称、模式、节点与连线）。',
    WF002: '节点ID或连线ID重复，请修改为唯一标识。',
    WF003: '存在指向不存在节点的连线，请检查连线起点/终点。',
    WF004: '存在悬空节点，请补连线或删除无效节点。',
    WF005: '线性模式需要保持单主链路，当前链路存在分叉。',
    WF101: '辩论模式必须包含：上下文构建、辩论回合、裁判节点。',
    WF102: 'DAG 模式需包含汇聚节点（join）。',
    WF103: '审批节点后仅允许连接输出节点。',
    WF104: '发布前必须配置风险闸门（risk-gate）。',
    WF105: '当 joinPolicy=QUORUM 时，需要设置 quorumBranches 且 >= 2。',
    WF106: '请补齐运行策略（超时、重试、退避、错误策略）。',
    WF201: '数据连线类型不兼容，请调整上下游字段类型。',
    WF202: '输入绑定引用了不存在字段，请重新选择变量。',
    WF203: '表达式引用了未解析参数，请检查参数包绑定。',
    WF301: '规则包依赖未发布或不可访问，请先发布/启用规则包。',
    WF302: '参数包依赖未发布或不可访问，请先发布/启用参数包。',
    WF303: '智能体依赖未发布或未启用，请先处理智能体状态。',
};

export const extractIssueCode = (message: string): string | undefined => {
    const matched = message.match(/(WF\d{3})/);
    return matched?.[1];
};

export const summarizeIds = (ids: string[]): string => {
    if (ids.length === 0) {
        return '0';
    }
    if (ids.length <= 3) {
        return ids.join(', ');
    }
    return `${ids.slice(0, 3).join(', ')} 等 ${ids.length} 项`;
};

export const filterIdsByKeyword = (ids: string[], keyword: string): string[] => {
    if (!keyword) {
        return ids;
    }
    return ids.filter((id) => id.toLowerCase().includes(keyword));
};

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const BATCH_LOCATE_LIMIT = 20;
export const BATCH_LOCATE_INTERVAL_MS = 180;
export const NODE_SECTION_KEYS: ChangeDetailSectionKey[] = ['focus-node-added', 'focus-node-removed', 'focus-node-runtime'];
export const EDGE_SECTION_KEYS: ChangeDetailSectionKey[] = ['focus-edge-added', 'focus-edge-removed'];
export const ALL_SECTION_KEYS: ChangeDetailSectionKey[] = [...NODE_SECTION_KEYS, ...EDGE_SECTION_KEYS];

export const getVisibleSectionKeysByViewMode = (viewMode: ChangeDetailViewMode): ChangeDetailSectionKey[] => {
    if (viewMode === 'ADDED') {
        return ['focus-node-added', 'focus-edge-added'];
    }
    if (viewMode === 'REMOVED') {
        return ['focus-node-removed', 'focus-edge-removed'];
    }
    if (viewMode === 'RUNTIME') {
        return ['focus-node-runtime'];
    }
    return ALL_SECTION_KEYS;
};

import { useMemo, useState, useEffect, useRef } from 'react';
import { App, Form } from 'antd';
import { useSearchParams } from 'react-router-dom';
import type {
    CreateParameterItemDto,
    CreateParameterSetDto,
    ParameterItemDto,
    ParameterScopeLevel,
    ParameterSetDto,
    UpdateParameterItemDto,
    WorkflowTemplateSource,
} from '@packages/types';
import { getErrorMessage } from '../../../api/client';
import {
    useBatchResetParameterItems,
    useCreateParameterItem,
    useCreateParameterSet,
    useDeleteParameterSet,
    useParameterChangeLogs,
    useParameterImpactPreview,
    useParameterOverrideDiff,
    useParameterSetDetail,
    useParameterSets,
    usePublishParameterSet,
    useResetParameterItemToDefault,
    useUpdateParameterItem,
} from '../api';

export const scopeOptions: ParameterScopeLevel[] = [
    'PUBLIC_TEMPLATE',
    'USER_TEMPLATE',
    'GLOBAL',
    'COMMODITY',
    'REGION',
    'ROUTE',
    'STRATEGY',
    'SESSION',
];

export const paramTypeOptions = ['number', 'string', 'boolean', 'enum', 'json', 'expression'];

export const scopeColorMap: Record<string, string> = {
    PUBLIC_TEMPLATE: 'blue',
    USER_TEMPLATE: 'cyan',
    GLOBAL: 'green',
    COMMODITY: 'orange',
    REGION: 'purple',
    ROUTE: 'magenta',
    STRATEGY: 'geekblue',
    SESSION: 'red',
};

export const operationColorMap: Record<string, string> = {
    CREATE: 'green',
    UPDATE: 'blue',
    DELETE: 'red',
    RESET_TO_DEFAULT: 'orange',
    BATCH_RESET: 'volcano',
    PUBLISH: 'purple',
};

export const templateSourceLabelMap: Record<WorkflowTemplateSource, string> = {
    PUBLIC: '公共',
    PRIVATE: '私有',
    COPIED: '复制',
};

export const getTemplateSourceLabel = (value?: WorkflowTemplateSource | null): string => {
    if (!value) return '-';
    return templateSourceLabelMap[value] ?? value;
};

export const scopeLabelMap: Record<ParameterScopeLevel, string> = {
    PUBLIC_TEMPLATE: '公共模板',
    USER_TEMPLATE: '用户模板',
    GLOBAL: '全局',
    COMMODITY: '品种',
    REGION: '区域',
    ROUTE: '航线',
    STRATEGY: '策略',
    SESSION: '会话',
};

export const getScopeLabel = (value?: ParameterScopeLevel | string): string => {
    if (!value) return '-';
    return scopeLabelMap[value as ParameterScopeLevel] ?? value;
};

export const getActiveStatusLabel = (value?: boolean): string => (value ? '启用' : '停用');

export const parsePositiveInt = (value: string | null, fallback: number): number => {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
};

export const isPublished = (version?: number): boolean =>
    Number.isInteger(version) && Number(version) >= 2;

export const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
};

export const parseMaybeJsonText = (value: unknown): unknown => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        return value;
    }
    const raw = value.trim();
    if (!raw) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
};

export const slugifyParamCode = (name?: string): string => {
    const normalized = (name || '')
        .trim()
        .toUpperCase()
        .replace(/[\s/\\]+/g, '_')
        .replace(/[^\w-]+/g, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized;
};

export function useParameterSetViewModel() {
    const { message } = App.useApp();
    const [setForm] = Form.useForm<CreateParameterSetDto>();
    const [itemForm] = Form.useForm<CreateParameterItemDto>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [keywordInput, setKeywordInput] = useState(searchParams.get('keyword')?.trim() || '');
    const [keyword, setKeyword] = useState<string | undefined>(
        searchParams.get('keyword')?.trim() || undefined,
    );
    const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(
        searchParams.get('isActive') === 'true'
            ? true
            : searchParams.get('isActive') === 'false'
                ? false
                : undefined,
    );
    const [createVisible, setCreateVisible] = useState(false);
    const [compareVisible, setCompareVisible] = useState(false);
    const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
    const [publishingSetId, setPublishingSetId] = useState<string | null>(null);
    const [itemVisible, setItemVisible] = useState(false);
    const [isParamCodeCustomized, setIsParamCodeCustomized] = useState(false);
    const [editItemVisible, setEditItemVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<ParameterItemDto | null>(null);
    const [detailTab, setDetailTab] = useState('items');
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [scopeResetLevel, setScopeResetLevel] = useState<ParameterScopeLevel | undefined>(undefined);
    const [scopeResetValue, setScopeResetValue] = useState('');
    const [page, setPage] = useState(parsePositiveInt(searchParams.get('page'), 1));
    const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get('pageSize'), 20));
    const [logPage, setLogPage] = useState(1);
    const [auditViewMode, setAuditViewMode] = useState<'table' | 'timeline'>('table');

    const [editItemForm] = Form.useForm<{
        paramName?: string;
        paramType?: string;
        scopeLevel?: ParameterScopeLevel;
        scopeValue?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value?: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defaultValue?: any;
        minValueText?: string;
        maxValueText?: string;
        unit?: string;
        source?: string;
        changeReason?: string;
        isActive?: boolean;
    }>();

    const setTableContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const next = new URLSearchParams();
        if (keyword) next.set('keyword', keyword);
        if (isActiveFilter !== undefined) next.set('isActive', String(isActiveFilter));
        next.set('page', String(page));
        next.set('pageSize', String(pageSize));
        setSearchParams(next, { replace: true });
    }, [isActiveFilter, keyword, page, pageSize, setSearchParams]);

    useEffect(() => {
        if (!itemVisible) {
            setIsParamCodeCustomized(false);
        }
    }, [itemVisible]);

    const { data, isLoading } = useParameterSets({
        includePublic: true,
        keyword,
        isActive: isActiveFilter,
        page,
        pageSize,
    });

    const { data: setDetail, isLoading: isDetailLoading } = useParameterSetDetail(
        selectedSetId || undefined,
    );

    const { data: overrideDiff, isLoading: isDiffLoading } = useParameterOverrideDiff(
        detailTab === 'diff' ? selectedSetId || undefined : undefined,
    );

    const { data: changeLogs, isLoading: isLogsLoading } = useParameterChangeLogs(
        detailTab === 'audit' ? selectedSetId || undefined : undefined,
        { page: logPage, pageSize: 20 },
    );

    const { data: impactPreview, isLoading: isImpactLoading } = useParameterImpactPreview(
        detailTab === 'impact' ? selectedSetId || undefined : undefined,
    );

    const normalizedKeyword = keyword?.trim().toLowerCase() || '';
    const highlightedSetId = useMemo(() => {
        if (!normalizedKeyword) return null;
        const rows = data?.data || [];
        const exactMatch = rows.find((item) => item.setCode.trim().toLowerCase() === normalizedKeyword);
        if (exactMatch) return exactMatch.id;
        const fuzzyMatch = rows.find((item) => {
            const code = item.setCode.trim().toLowerCase();
            const name = item.name.trim().toLowerCase();
            return code.includes(normalizedKeyword) || name.includes(normalizedKeyword);
        });
        return fuzzyMatch?.id || null;
    }, [data?.data, normalizedKeyword]);

    useEffect(() => {
        if (!highlightedSetId || !setTableContainerRef.current) return;
        const timer = window.setTimeout(() => {
            const row = setTableContainerRef.current?.querySelector<HTMLElement>(
                `tr[data-row-key="${highlightedSetId}"]`,
            );
            row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 0);
        return () => window.clearTimeout(timer);
    }, [highlightedSetId]);

    const createSetMutation = useCreateParameterSet();
    const deleteSetMutation = useDeleteParameterSet();
    const createItemMutation = useCreateParameterItem();
    const publishSetMutation = usePublishParameterSet();
    const resetItemMutation = useResetParameterItemToDefault();
    const batchResetMutation = useBatchResetParameterItems();
    const updateItemMutation = useUpdateParameterItem();

    const handlePublishSet = async (record: ParameterSetDto) => {
        if (!record.isActive) {
            message.warning('参数包未启用，无法发布');
            return;
        }
        if (isPublished(record.version)) {
            message.info('参数包已发布');
            return;
        }
        try {
            setPublishingSetId(record.id);
            await publishSetMutation.mutateAsync({ id: record.id });
            message.success(`参数包 ${record.setCode} 发布成功`);
        } catch (error) {
            message.error(getErrorMessage(error) || '发布失败');
        } finally {
            setPublishingSetId(null);
        }
    };

    const handleResetItem = async (itemId: string) => {
        if (!selectedSetId) return;
        try {
            await resetItemMutation.mutateAsync({ setId: selectedSetId, itemId });
            message.success('已重置到默认值');
        } catch (error) {
            message.error(getErrorMessage(error) || '重置失败');
        }
    };

    const handleBatchReset = async () => {
        if (!selectedSetId || selectedItemIds.length === 0) return;
        try {
            const result = await batchResetMutation.mutateAsync({
                setId: selectedSetId,
                dto: { itemIds: selectedItemIds },
            });
            message.success(`已重置 ${result.resetCount} 个参数项`);
            setSelectedItemIds([]);
        } catch (error) {
            message.error(getErrorMessage(error) || '批量重置失败');
        }
    };

    const handleScopeBatchReset = async () => {
        if (!selectedSetId || !scopeResetLevel) {
            message.warning('请选择作用域后再执行批量重置');
            return;
        }
        try {
            const result = await batchResetMutation.mutateAsync({
                setId: selectedSetId,
                dto: {
                    scopeLevel: scopeResetLevel,
                    scopeValue: scopeResetValue.trim() || undefined,
                    reason: '按作用域批量重置',
                },
            });
            message.success(`按作用域重置完成，影响 ${result.resetCount} 个参数项`);
            setScopeResetLevel(undefined);
            setScopeResetValue('');
            setSelectedItemIds([]);
        } catch (error) {
            message.error(getErrorMessage(error) || '按作用域批量重置失败');
        }
    };

    const handleCreateSet = async () => {
        try {
            const values = await setForm.validateFields();
            await createSetMutation.mutateAsync(values);
            message.success('参数包创建成功');
            setCreateVisible(false);
            setForm.resetFields();
        } catch (error) {
            message.error(getErrorMessage(error) || '参数包创建失败');
        }
    };

    const handleCreateItem = async () => {
        if (!selectedSetId) return;
        try {
            const values = await itemForm.validateFields();
            const payload: CreateParameterItemDto = {
                ...values,
                value: parseMaybeJsonText(values.value),
                defaultValue: parseMaybeJsonText(values.defaultValue),
            };
            await createItemMutation.mutateAsync({ setId: selectedSetId, payload });
            message.success('参数项创建成功');
            setItemVisible(false);
            itemForm.resetFields();
        } catch (error) {
            message.error(getErrorMessage(error) || '参数项创建失败');
        }
    };

    const openEditItem = (record: ParameterItemDto) => {
        setEditingItem(record);
        const isJsonOrText = record.paramType === 'json' || record.paramType === 'expression';

        editItemForm.setFieldsValue({
            paramName: record.paramName,
            paramType: record.paramType,
            scopeLevel: record.scopeLevel,
            scopeValue: record.scopeValue || undefined,
            value: isJsonOrText
                ? (record.value === null || record.value === undefined ? '' : JSON.stringify(record.value, null, 2))
                : record.value,
            defaultValue: isJsonOrText
                ? (record.defaultValue === null || record.defaultValue === undefined ? '' : JSON.stringify(record.defaultValue, null, 2))
                : record.defaultValue,
            minValueText:
                record.minValue === null || record.minValue === undefined
                    ? ''
                    : JSON.stringify(record.minValue, null, 2),
            maxValueText:
                record.maxValue === null || record.maxValue === undefined
                    ? ''
                    : JSON.stringify(record.maxValue, null, 2),
            unit: record.unit || undefined,
            source: record.source || undefined,
            isActive: record.isActive,
        });
        setEditItemVisible(true);
    };

    const handleUpdateItem = async () => {
        if (!selectedSetId || !editingItem) return;
        try {
            const values = await editItemForm.validateFields();
            const isJsonOrText = values.paramType === 'json' || values.paramType === 'expression';

            const payload: UpdateParameterItemDto = {
                paramName: values.paramName,
                paramType: values.paramType as UpdateParameterItemDto['paramType'],
                scopeLevel: values.scopeLevel,
                scopeValue: values.scopeValue,
                value: isJsonOrText ? parseMaybeJsonText(values.value) : values.value,
                defaultValue: isJsonOrText ? parseMaybeJsonText(values.defaultValue) : values.defaultValue,
                minValue: parseMaybeJsonText(values.minValueText),
                maxValue: parseMaybeJsonText(values.maxValueText),
                unit: values.unit,
                source: values.source,
                changeReason: values.changeReason || '更新参数项',
                isActive: values.isActive,
            };
            await updateItemMutation.mutateAsync({
                setId: selectedSetId,
                itemId: editingItem.id,
                payload,
            });
            message.success('参数项更新成功');
            setEditItemVisible(false);
            setEditingItem(null);
            editItemForm.resetFields();
        } catch (error) {
            message.error(getErrorMessage(error) || '参数项更新失败');
        }
    };

    const overrideSummary = useMemo(() => {
        const items = setDetail?.items ?? [];
        const total = items.length;
        let inherited = 0;
        let overridden = 0;
        let noTemplate = 0;
        for (const item of items) {
            const hasDefault = item.defaultValue !== null && item.defaultValue !== undefined;
            if (!hasDefault) {
                noTemplate++;
                continue;
            }
            const hasValue = item.value !== null && item.value !== undefined;
            if (!hasValue || JSON.stringify(item.value) === JSON.stringify(item.defaultValue)) {
                inherited++;
            } else {
                overridden++;
            }
        }
        const overrideRate = total > 0 ? Math.round((overridden / total) * 100) : 0;
        return { total, inherited, overridden, noTemplate, overrideRate };
    }, [setDetail?.items]);

    return {
        state: {
            keywordInput,
            keyword,
            isActiveFilter,
            createVisible,
            compareVisible,
            selectedSetId,
            publishingSetId,
            itemVisible,
            isParamCodeCustomized,
            editItemVisible,
            editingItem,
            detailTab,
            selectedItemIds,
            scopeResetLevel,
            scopeResetValue,
            page,
            pageSize,
            logPage,
            auditViewMode,
            setForm,
            itemForm,
            editItemForm,
        },
        setters: {
            setKeywordInput,
            setKeyword,
            setIsActiveFilter,
            setCreateVisible,
            setCompareVisible,
            setSelectedSetId,
            setPublishingSetId,
            setItemVisible,
            setIsParamCodeCustomized,
            setEditItemVisible,
            setEditingItem,
            setDetailTab,
            setSelectedItemIds,
            setScopeResetLevel,
            setScopeResetValue,
            setPage,
            setPageSize,
            setLogPage,
            setAuditViewMode,
        },
        data: {
            data,
            isLoading,
            setDetail,
            isDetailLoading,
            overrideDiff,
            isDiffLoading,
            changeLogs,
            isLogsLoading,
            impactPreview,
            isImpactLoading,
        },
        computed: {
            normalizedKeyword,
            highlightedSetId,
            overrideSummary,
        },
        refs: {
            setTableContainerRef,
        },
        mutations: {
            createSetMutation,
            deleteSetMutation,
            createItemMutation,
            publishSetMutation,
            resetItemMutation,
            batchResetMutation,
            updateItemMutation,
        },
        actions: {
            handlePublishSet,
            handleResetItem,
            handleBatchReset,
            handleScopeBatchReset,
            handleCreateSet,
            handleCreateItem,
            openEditItem,
            handleUpdateItem,
        }
    };
}

import { useMemo } from 'react';
import { PRICE_SUB_TYPE_LABELS } from '@packages/types';
import type { DictionaryItem } from '@packages/types';

/**
 * 统一的价格类型标签映射工具
 * 优先使用字典（动态配置），回退到静态中文标签兜底
 * 保证返回 Record<string, string>，支持任意 string key 访问
 */
export const usePriceSubTypeLabels = (dictionaryItems?: DictionaryItem[]): Record<string, string> => {
  return useMemo(() => {
    // 始终以静态标签为兜底，确保任何情况下都有中文显示
    const baseLabels: Record<string, string> = { ...PRICE_SUB_TYPE_LABELS };
    
    // 如果有字典数据，则覆盖静态标签（字典优先）
    if (dictionaryItems && dictionaryItems.length > 0) {
      dictionaryItems.forEach(item => {
        if (item.isActive) {
          baseLabels[item.code] = item.label;
        }
      });
    }
    
    return baseLabels;
  }, [dictionaryItems]);
};

/**
 * 获取价格类型选项（用于 Select/EditableProTable）
 * 优先字典，回退到静态中文选项
 */
export const usePriceSubTypeOptions = (dictionaryItems?: DictionaryItem[]) => {
  return useMemo(() => {
    const optionsFromDict = dictionaryItems?.filter(item => item.isActive).map(item => ({
      value: item.code,
      label: item.label,
    }));

    if (optionsFromDict?.length) {
      return optionsFromDict;
    }

    // 静态兜底选项
    return Object.entries(PRICE_SUB_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
    }));
  }, [dictionaryItems]);
};
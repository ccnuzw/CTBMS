import { PriceQualityTag } from '@packages/types';

export { PriceQualityTag };

export const PRICE_QUALITY_TAG_OPTIONS: Array<{ label: string; value: PriceQualityTag }> = [
    { label: '原始', value: PriceQualityTag.RAW },
    { label: '补录/估算', value: PriceQualityTag.IMPUTED },
    { label: '修正', value: PriceQualityTag.CORRECTED },
    { label: '延迟', value: PriceQualityTag.LATE },
];

export const PRICE_QUALITY_TAG_LABELS: Record<PriceQualityTag, string> = {
    [PriceQualityTag.RAW]: '原始',
    [PriceQualityTag.IMPUTED]: '补录/估算',
    [PriceQualityTag.CORRECTED]: '修正',
    [PriceQualityTag.LATE]: '延迟',
};

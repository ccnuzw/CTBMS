import { useState, useMemo, useEffect } from 'react';
import { Form, App } from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    ReportType,
    REPORT_TYPE_LABELS,
    REPORT_PERIOD_LABELS,
    IntelCategory,
    ContentType,
    type AIAnalysisResult,
} from '@packages/types';
import { useAnalyzeContent } from '../api/hooks';
import {
    useCreateKnowledgeReport,
    useUpdateKnowledgeReport,
    useKnowledgeReport,
    useKnowledgeReportStats,
    useSubmitDraftReport,
    useSubmitReport,
    useUpdateReport,
    CreateReportPayload,
} from '../api/knowledge-hooks';
import { useProvinces } from '../api/region';
import { MARKET_SENTIMENT_LABELS, PREDICTION_TIMEFRAME_LABELS } from '../constants';
import { useDictionaries } from '@/hooks/useDictionaries';

export const PERIODIC_REPORT_META: Record<string, { label: string; color: string; icon: string }> = {
    DAILY: { label: '日报', color: 'blue', icon: '📋' },
    WEEKLY: { label: '周报', color: 'cyan', icon: '📊' },
    MONTHLY: { label: '月报', color: 'purple', icon: '📑' },
};

export const getPeriodicReportTemplates = (): Record<string, string> => ({
    DAILY: `## 一、市场概况\n\n今日市场整体表现平稳/波动，主要品种价格...\n\n## 二、重点品种分析\n\n### 1. [品种名]\n- 现货价格：\n- 涨跌幅：\n- 成交情况：\n\n## 三、市场要闻\n\n1. \n2. \n\n## 四、后市展望\n\n根据当前市场情况分析...`,
    WEEKLY: `## 一、本周市场回顾\n\n本周（${dayjs().startOf('week').add(1, 'day').format('MM/DD')}-${dayjs().endOf('week').add(1, 'day').format('MM/DD')}）市场...\n\n## 二、价格走势分析\n\n| 品种 | 周初价 | 周末价 | 涨跌幅 |\n|------|--------|--------|--------|\n|      |        |        |        |\n\n## 三、供需分析\n\n### 供应端\n- \n\n### 需求端\n- \n\n## 四、政策与消息面\n\n1. \n2. \n\n## 五、下周展望\n\n`,
    MONTHLY: `## 一、${dayjs().format('YYYY年M月')}市场总结\n\n本月市场整体运行情况...\n\n## 二、价格月度走势\n\n### 主要品种月度表现\n| 品种 | 月初价 | 月末价 | 月涨跌幅 | 均价 |\n|------|--------|--------|----------|------|\n|      |        |        |          |      |\n\n## 三、月度供需平衡分析\n\n### 供应分析\n- \n\n### 需求分析\n- \n\n### 库存变化\n- \n\n## 四、政策环境\n\n1. \n2. \n\n## 五、下月展望\n\n`,
});

export type AnalysisTarget = 'all' | 'meta' | 'keyPoints' | 'prediction' | 'dataPoints';

export function useResearchReportCreateViewModel() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { id: routeEditId } = useParams<{ id?: string }>();
    const [searchParams] = useSearchParams();
    const taskId = searchParams.get('taskId');

    const knowledgeType = searchParams.get('knowledgeType') || 'RESEARCH';
    const isPeriodicReport = ['DAILY', 'WEEKLY', 'MONTHLY'].includes(knowledgeType);
    const periodicMeta = PERIODIC_REPORT_META[knowledgeType];

    const reportIdFromQuery = searchParams.get('reportId');
    const editId = routeEditId || reportIdFromQuery || undefined;
    const isEditMode = Boolean(editId);

    const [form] = Form.useForm<CreateReportPayload & { content?: string }>();
    const keyPointsWatch = Form.useWatch('keyPoints', form);
    const predictionWatch = Form.useWatch('prediction', form);
    const dataPointsWatch = Form.useWatch('dataPoints', form);

    const createMutation = useCreateKnowledgeReport();
    const updateMutation = useUpdateKnowledgeReport();
    const submitReportMutation = useSubmitDraftReport();
    const analyzeMutation = useAnalyzeContent();

    const submitPeriodicReport = useSubmitReport();
    const updatePeriodicReport = useUpdateReport();

    const { data: existingReport, isLoading: isLoadingReport } = useKnowledgeReport(editId || '');

    const [aiSectionCollapsed, setAiSectionCollapsed] = useState(true);
    const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
    const [aiSectionMeta, setAiSectionMeta] = useState<{
        overall?: { confidence: number; updatedAt: Date };
        keyPoints?: { confidence: number; updatedAt: Date };
        prediction?: { confidence: number; updatedAt: Date };
        dataPoints?: { confidence: number; updatedAt: Date };
        meta?: { confidence: number; updatedAt: Date };
    }>({});

    const { data: stats } = useKnowledgeReportStats();
    const { data: provinces } = useProvinces();
    const { data: dictionaries } = useDictionaries([
        'REPORT_TYPE',
        'REPORT_PERIOD',
        'MARKET_SENTIMENT',
        'PREDICTION_TIMEFRAME',
    ]);

    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [uploadedIntelId, setUploadedIntelId] = useState<string | null>(null);
     
    const [uploadedAttachment, setUploadedAttachment] = useState<any>(null);

    const commodityOptions =
         
        stats?.topCommodities?.map((item: Record<string, any>) => ({
            label: item.name,
            value: item.name,
        })) || [];

    const regionOptions =
        provinces?.map?.((p: { name: string }) => ({
            label: p.name,
            value: p.name,
        })) || [];

    const reportTypeOptions = useMemo(() => {
        const items = dictionaries?.REPORT_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) {
            return Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => ({ label, value }));
        }
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const reportPeriodOptions = useMemo(() => {
        const items = dictionaries?.REPORT_PERIOD?.filter((item) => item.isActive) || [];
        if (!items.length) {
            return Object.entries(REPORT_PERIOD_LABELS).map(([value, label]) => ({ label, value }));
        }
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const predictionDirectionOptions = useMemo(() => {
        const items = dictionaries?.MARKET_SENTIMENT?.filter((item) => item.isActive) || [];
        if (!items.length) {
            return Object.entries(MARKET_SENTIMENT_LABELS).map(([value, label]) => ({ label, value }));
        }
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const predictionTimeframeOptions = useMemo(() => {
        const items = dictionaries?.PREDICTION_TIMEFRAME?.filter((item) => item.isActive) || [];
        if (!items.length) {
            return Object.entries(PREDICTION_TIMEFRAME_LABELS).map(([value, label]) => ({
                label,
                value,
            }));
        }
        return items.map((item) => ({ label: item.label, value: item.code }));
    }, [dictionaries]);

    const normalizeDictValue = (value?: string | null) => (value || '').trim().toUpperCase();

    const predictionDirectionValueMap = useMemo(() => {
        const map: Record<string, string> = {
            POSITIVE: 'BULLISH',
            NEGATIVE: 'BEARISH',
            STABLE: 'NEUTRAL',
            VOLATILE: 'MIXED',
        };

        Object.keys(MARKET_SENTIMENT_LABELS).forEach((code) => {
            map[normalizeDictValue(code)] = normalizeDictValue(code);
        });

        const items = dictionaries?.MARKET_SENTIMENT?.filter((item) => item.isActive) || [];
        items.forEach((item) => {
            const normalizedCode = normalizeDictValue(item.code);
            map[normalizedCode] = normalizedCode;
            const aliases = ((item.meta as { aliases?: string[] } | null)?.aliases || []).filter(
                (alias): alias is string => Boolean(alias),
            );
            aliases.forEach((alias) => {
                map[normalizeDictValue(alias)] = normalizedCode;
            });
        });

        return map;
    }, [dictionaries]);

    const predictionTimeframeValueMap = useMemo(() => {
        const map: Record<string, string> = {
            SHORT_TERM: 'SHORT',
            MEDIUM_TERM: 'MEDIUM',
            LONG_TERM: 'LONG',
            'SHORT-TERM': 'SHORT',
            'MEDIUM-TERM': 'MEDIUM',
            'LONG-TERM': 'LONG',
        };

        Object.keys(PREDICTION_TIMEFRAME_LABELS).forEach((code) => {
            map[normalizeDictValue(code)] = normalizeDictValue(code);
        });

        const items = dictionaries?.PREDICTION_TIMEFRAME?.filter((item) => item.isActive) || [];
        items.forEach((item) => {
            const normalizedCode = normalizeDictValue(item.code);
            map[normalizedCode] = normalizedCode;
            const aliases = ((item.meta as { aliases?: string[] } | null)?.aliases || []).filter(
                (alias): alias is string => Boolean(alias),
            );
            aliases.forEach((alias) => {
                map[normalizeDictValue(alias)] = normalizedCode;
            });
        });

        return map;
    }, [dictionaries]);

    const normalizePredictionDirection = (value?: string | null): string | undefined => {
        if (!value) return undefined;
        const normalized = normalizeDictValue(value);
        return predictionDirectionValueMap[normalized] || value;
    };

    const normalizePredictionTimeframe = (value?: string | null): string | undefined => {
        if (!value) return undefined;
        const normalized = normalizeDictValue(value);
        return predictionTimeframeValueMap[normalized] || value;
    };

    useEffect(() => {
        if (isEditMode && existingReport) {
             
            const existingPrediction = (existingReport.analysis?.prediction || {}) as any;
            const bodyContent = existingReport.contentRich || existingReport.contentPlain || existingReport.analysis?.summary;
            form.setFieldsValue({
                title: existingReport.title,
                reportType: existingReport.analysis?.reportType || existingReport.type,
                publishAt: existingReport.publishAt ? existingReport.publishAt : undefined,
                sourceType: existingReport.sourceType || undefined,
                commodities: existingReport.commodities,
                region: existingReport.region,
                summary: existingReport.analysis?.summary || undefined,
                content: bodyContent || undefined,
                 
                keyPoints: existingReport.analysis?.keyPoints as any,
                prediction: {
                    ...existingPrediction,
                    direction: normalizePredictionDirection(existingPrediction.direction),
                    timeframe: normalizePredictionTimeframe(existingPrediction.timeframe),
                },
                 
                dataPoints: existingReport.analysis?.dataPoints as any,
            });
        }
    }, [isEditMode, existingReport, form, predictionDirectionValueMap, predictionTimeframeValueMap]);

    const hasAiData =
         
        ((keyPointsWatch as any[])?.length || 0) > 0 ||
         
        (predictionWatch as any)?.direction ||
         
        ((dataPointsWatch as any[])?.length || 0) > 0;

    const autoTitle = useMemo(() => {
        if (!isPeriodicReport) return '';
        const dateStr = dayjs().format('YYYY-MM-DD');
        const formCommodities = form.getFieldValue('commodities') || [];
        const commodityStr = formCommodities.length > 0 ? formCommodities.join('/') : '综合';
        return `${dateStr} ${commodityStr}市场${periodicMeta?.label || '报告'}`;
    }, [isPeriodicReport, form, periodicMeta]);

    const handleFinish = async (values: CreateReportPayload & { content?: string }, submitAction?: 'save' | 'submit') => {
        const bodyContent = form.getFieldValue('content') || values.content;
        const summaryContent = form.getFieldValue('summary') || values.summary;

        if (!bodyContent) {
            message.error(isPeriodicReport ? '请填写报告内容' : '研报正文不能为空');
            return;
        }

        const stripped = bodyContent.replace(/<[^>]*>?/gm, '');

        if (isPeriodicReport) {
            const finalTitle = (values.title || '').trim() || autoTitle;
            const reportPayload = {
                type: knowledgeType as 'DAILY' | 'WEEKLY' | 'MONTHLY',
                title: finalTitle,
                contentPlain: stripped,
                contentRich: bodyContent,
                commodities: values.commodities,
                region: values.region,
                authorId: 'current-user',
                taskId: taskId || undefined,
                triggerAnalysis: true,
            };

            try {
                if (isEditMode && editId) {
                    await updatePeriodicReport.mutateAsync({ id: editId, ...reportPayload });
                    message.success(`${periodicMeta?.label}修改成功！`);
                } else {
                    await submitPeriodicReport.mutateAsync(reportPayload);
                    message.success(`${periodicMeta?.label}提交成功！等待审核...`);
                }
                navigate(taskId ? '/workstation' : '/intel/knowledge/items');
            } catch (error: unknown) {
                 
                message.error((error as any).response?.data?.message || '提交失败，请重试');
                if (import.meta.env.DEV) console.error(error);
            }
            return;
        }

        const payload: CreateReportPayload = {
            ...values,
            contentRich: bodyContent,
            contentPlain: stripped,
            summary: summaryContent || stripped.slice(0, 300) + '...',
            authorId: 'current-user',
            intelId: uploadedIntelId || undefined,
            attachmentIds: uploadedAttachment ? [uploadedAttachment.id] : undefined,
        };

        try {
            let currentReportId = editId;
            if (isEditMode && editId) {
                await updateMutation.mutateAsync({
                    id: editId,
                    ...payload,
                });
            } else {
                const createRes = await createMutation.mutateAsync(payload);
                currentReportId = createRes.id;
            }

            if (submitAction === 'submit' && currentReportId) {
                await submitReportMutation.mutateAsync({
                    id: currentReportId,
                    taskId: taskId || undefined,
                    authorId: payload.authorId,
                });
                message.success(taskId ? '已提交审核并标记任务为待审核' : '研报已提交审核');
            } else {
                message.success(isEditMode ? '研报草稿更新成功' : '研报草稿保存成功');
            }

            navigate('/intel/knowledge?tab=library&content=reports');
        } catch (error) {
            message.error(isEditMode ? '操作失败，请重试' : '操作失败，请重试');
            if (import.meta.env.DEV) console.error(error);
        }
    };

     
    const handleUploadSuccess = (result: any) => {
        if (result.intel?.id) {
            setUploadedIntelId(result.intel.id);
        }

        if (result.attachment) {
            setUploadedAttachment(result.attachment);
        }

        const content = result.intel?.rawContent || result.content;
        if (content) {
            const currentContent = form.getFieldValue('content') || '';
            const isHtml = /^\s*<.*>/.test(content) || /<br\/>|<p>|<div>/i.test(content);

            const processedContent = isHtml
                ? content
                : content
                    .split('\n')
                    .map((line: string) => {
                        const trimmed = line.trim();
                        if (/^[一二三四五六七八九十]+、/.test(trimmed)) return `### ${trimmed}`;
                        if (/^[(（][一二三四五六七八九十]+[)）]/.test(trimmed)) return `#### ${trimmed}`;
                        return trimmed;
                    })
                    .filter((line: string) => line.length > 0)
                    .join('\n\n');

            const newContent = currentContent ? `${currentContent}${processedContent}` : processedContent;

            form.setFieldValue('content', newContent);
            message.success('文档解析成功，内容已自动填入');
        } else {
            message.warning({
                content: '文档上传成功，但未提取到文本内容（可能是图片或扫描件）。请手动输入正文。',
                duration: 5,
            });
        }
    };

    const performAnalysis = async (content: string, targets: AnalysisTarget[] = ['all']) => {
        if (analyzeMutation.isPending) return;

        const hide = message.loading('AI 正在深度分析研报内容...', 0);

        try {
            const result = await analyzeMutation.mutateAsync({
                content: content,
                category: IntelCategory.C_DOCUMENT,
                contentType: ContentType.RESEARCH_REPORT,
            });

            if (result) {
                const now = new Date();
                const applyAll = targets.includes('all');
                const shouldApply = (target: AnalysisTarget) => applyAll || targets.includes(target);

                const updates: Partial<CreateReportPayload> = {};
                const extractedFields: string[] = [];

                if (shouldApply('meta')) {
                    if (result.extractedData?.title && !form.getFieldValue('title')) {
                        updates.title = result.extractedData.title;
                        extractedFields.push('标题');
                    }

                    if (result.commodities?.length) {
                        updates.commodities = result.commodities;
                        extractedFields.push('关联品种');
                    }
                    if (result.regions?.length) {
                        updates.region = result.regions;
                        extractedFields.push('关联区域');
                    }

                    if (result.reportType) updates.reportType = result.reportType;
                    if (result.reportPeriod) updates.reportPeriod = result.reportPeriod;

                    setAiSectionMeta((prev) => ({
                        ...prev,
                        meta: { confidence: result.confidenceScore || 0, updatedAt: now },
                    }));
                }

                if (shouldApply('keyPoints') && result.keyPoints?.length) {
                    updates.keyPoints = result.keyPoints.map((kp) => ({
                        ...kp,
                        sentiment:
                            kp.sentiment === 'bullish'
                                ? 'positive'
                                : kp.sentiment === 'bearish'
                                    ? 'negative'
                                    : kp.sentiment === 'neutral'
                                        ? 'neutral'
                                        : kp.sentiment,
                    }));
                    extractedFields.push('核心观点');
                    const confidences = result.keyPoints
                        .map((kp) => kp.confidence)
                        .filter((value): value is number => typeof value === 'number');
                    const avgConfidence =
                        confidences.length > 0
                            ? Math.round(confidences.reduce((sum, val) => sum + val, 0) / confidences.length)
                            : result.confidenceScore || 0;
                    setAiSectionMeta((prev) => ({
                        ...prev,
                        keyPoints: { confidence: avgConfidence, updatedAt: now },
                    }));
                }

                if (shouldApply('prediction') && result.prediction) {
                    updates.prediction = {
                        direction: normalizePredictionDirection(result.prediction.direction),
                        timeframe: normalizePredictionTimeframe(result.prediction.timeframe),
                        reasoning: result.prediction.logic || result.prediction.reasoning,
                    };
                    extractedFields.push('后市预判');
                    setAiSectionMeta((prev) => ({
                        ...prev,
                        prediction: { confidence: result.confidenceScore || 0, updatedAt: now },
                    }));
                }

                if (shouldApply('dataPoints') && result.dataPoints?.length) {
                    updates.dataPoints = result.dataPoints.map((dp) => ({
                        metric: dp.metric,
                        value: dp.value,
                        unit: dp.unit,
                    }));
                    extractedFields.push('关键数据');
                    setAiSectionMeta((prev) => ({
                        ...prev,
                        dataPoints: { confidence: result.confidenceScore || 0, updatedAt: now },
                    }));
                }

                if (result.summary && typeof result.summary === 'string' && result.summary.length > 20) {
                    updates.summary = result.summary;
                    extractedFields.push('摘要');
                }

                 
                form.setFieldsValue(updates as any);
                setAiSectionCollapsed(false);
                setAiResult(result);
                setAiSectionMeta((prev) => ({
                    ...prev,
                    overall: { confidence: result.confidenceScore || 0, updatedAt: now },
                }));

                if (extractedFields.length > 0) {
                    message.success(`AI 分析完成，已自动提取：${extractedFields.join('、')}`);
                } else {
                    message.info('AI 分析完成，但未提取到关键结构化信息');
                }
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error(error);
            message.error('AI 分析失败，请检查网络或重试');
        } finally {
            hide();
        }
    };

    const handleAnalyzeEditorContent = async (targets: AnalysisTarget[] = ['all']) => {
        if (analyzeMutation.isPending) return;

        const content = form.getFieldValue('content');
        if (!content || content.replace(/<[^>]*>?/gm, '').trim().length === 0) {
            message.warning('编辑器内容为空，无法分析');
            return;
        }
        await performAnalysis(content, targets);
    };

    const handleUploadAnalysisTrigger = async (content: string) => {
        await performAnalysis(content, ['all']);
    };

    const isOfficeDoc = (filename?: string, mime?: string) => {
        if (!filename) return false;
        return (
            /\.(doc|docx|ppt|pptx)$/i.test(filename) ||
            mime?.includes('word') ||
            mime?.includes('presentation') ||
            mime?.includes('powerpoint')
        );
    };

    const initialValues = useMemo(
        () => ({
            reportType: ReportType.MARKET,
            publishDate: new Date(),
            summary: '',
            content: '',
        }),
        [],
    );

    return {
        state: {
            taskId,
            knowledgeType,
            isPeriodicReport,
            periodicMeta,
            isEditMode,
            form,
            keyPointsWatch,
            predictionWatch,
            dataPointsWatch,
            aiSectionCollapsed,
            aiResult,
            aiSectionMeta,
            isPreviewModalOpen,
            uploadedIntelId,
            uploadedAttachment,
            hasAiData,
            autoTitle,
            initialValues,
            isLoadingReport,
        },
        setters: {
            setAiSectionCollapsed,
            setAiResult,
            setAiSectionMeta,
            setIsPreviewModalOpen,
            setUploadedIntelId,
            setUploadedAttachment,
        },
        data: {
            commodityOptions,
            regionOptions,
            reportTypeOptions,
            reportPeriodOptions,
            predictionDirectionOptions,
            predictionTimeframeOptions,
        },
        actions: {
            handleFinish,
            handleUploadSuccess,
            handleAnalyzeEditorContent,
            handleUploadAnalysisTrigger,
            isOfficeDoc,
            navigate,
        },
        mutations: {
            createMutation,
            updateMutation,
            submitReportMutation,
            analyzeMutation,
            submitPeriodicReport,
            updatePeriodicReport,
        }
    };
}

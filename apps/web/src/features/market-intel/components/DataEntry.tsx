import React, { useState, useEffect } from 'react';
import { Row, Col, message, theme } from 'antd';
import {
    ContentType,
    CONTENT_TYPE_SOURCE_OPTIONS,
    IntelSourceType,
    IntelCategory,
    type AIAnalysisResult,
    type InfoCard,
} from '../types';
import { useCreateMarketIntel, useAnalyzeContent } from '../api';
import { CollectionConsole } from './CollectionConsole';
import { IntelInsightPanel } from './IntelInsightPanel';

interface DataEntryProps {
    onSuccess?: (card?: InfoCard) => void;
    onCancel?: () => void;
}

export const DataEntry: React.FC<DataEntryProps> = ({ onSuccess }) => {
    const { token } = theme.useToken();

    // === State Management ===
    const [contentType, setContentType] = useState<ContentType>(ContentType.DAILY_REPORT);
    const [sourceType, setSourceType] = useState<IntelSourceType>(IntelSourceType.FIRST_LINE);
    const [content, setContent] = useState('');
    const [gpsStatus, setGpsStatus] = useState<'idle' | 'verifying' | 'success' | 'failed'>('idle');
    const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
    const [imageData, setImageData] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
    const [activeTab, setActiveTab] = useState('text');

    const createMutation = useCreateMarketIntel();
    const analyzeMutation = useAnalyzeContent();

    // Auto-select source type on content type change
    useEffect(() => {
        setAiResult(null);
        setContent('');
        setImageData(null);
        setGpsStatus('idle');

        const availableSources = CONTENT_TYPE_SOURCE_OPTIONS[contentType] || [];
        if (availableSources.length > 0) {
            setSourceType(availableSources[0]);
        }

        if (contentType === ContentType.DAILY_REPORT) {
            setActiveTab('text');
        } else {
            setActiveTab('file');
        }
    }, [contentType]);

    // Calculate Quality Score
    const calculatePreviewScore = () => {
        let score = 0;
        if (content.length > 50) score += 30;
        else if (content.length > 10) score += 10;

        if (content.length > 500) score += 20;

        if (gpsStatus === 'success') score += 30;
        else if (sourceType !== IntelSourceType.FIRST_LINE) score += 20; // Official sources are trusted

        if (imageData) score += 20;
        return Math.min(score, 100);
    };

    const previewScore = calculatePreviewScore();

    // GPS Verification Simulation
    const handleGpsVerify = () => {
        setGpsStatus('verifying');
        setTimeout(() => {
            setGpsStatus('success');
            message.success('位置验证成功：锦州港物流园区 (Mock)');
        }, 1500);
    };

    // AI Analysis Handler
    const handleAnalyze = async () => {
        if (!content.trim() && !imageData) {
            message.warning('请先输入内容或上传图片');
            return;
        }

        try {
            // Map legacy category
            let legacyCategory = IntelCategory.B_SEMI_STRUCTURED;
            if (contentType === ContentType.RESEARCH_REPORT || contentType === ContentType.POLICY_DOC) {
                legacyCategory = IntelCategory.C_DOCUMENT;
            }

            const result = await analyzeMutation.mutateAsync({
                content,
                category: legacyCategory,
                location: '锦州港物流园区',
                base64Image: imageData?.data,
                mimeType: imageData?.mimeType,
            });
            setAiResult(result);

            // Append OCR text if content is empty/short
            if (result.ocrText && content.length < 50) {
                setContent((prev) => {
                    const separator = prev ? '\n\n--- OCR 识别结果 ---\n' : '--- OCR 识别结果 ---\n';
                    return prev + separator + result.ocrText;
                });
            }
        } catch (error) {
            message.error('AI 分析失败');
            console.error(error);
        }
    };

    // Submit Handler
    const handleSubmit = async () => {
        if (!aiResult) {
            message.warning('请先进行 AI 分析');
            return;
        }

        if (sourceType === IntelSourceType.FIRST_LINE && gpsStatus !== 'success') {
            message.error('系统阻断：一线采集必须通过地理围栏校验！');
            return;
        }

        try {
            let legacyCategory = IntelCategory.B_SEMI_STRUCTURED;
            if (contentType === ContentType.RESEARCH_REPORT || contentType === ContentType.POLICY_DOC) {
                legacyCategory = IntelCategory.C_DOCUMENT;
            }

            const totalScore = Math.round(previewScore * 0.4 + 80 * 0.3 + 0 * 0.3); // Simple formula

            await createMutation.mutateAsync({
                category: legacyCategory,
                contentType,
                sourceType,
                rawContent: content,
                effectiveTime: aiResult.extractedEffectiveTime
                    ? new Date(aiResult.extractedEffectiveTime)
                    : new Date(),
                location: '锦州港物流园区',
                region: ['辽宁省', '锦州市'],
                gpsVerified: gpsStatus === 'success',
                aiAnalysis: aiResult,
                completenessScore: previewScore,
                scarcityScore: 80,
                validationScore: 0,
                totalScore,
                isFlagged: !!aiResult.validationMessage,
            });
            message.success('情报提交成功');
            onSuccess?.();
            handleReset();
        } catch (error) {
            message.error('提交失败');
            console.error(error);
        }
    };

    // Reset Handler
    const handleReset = () => {
        setContent('');
        setAiResult(null);
        setImageData(null);
        setGpsStatus('idle');
    };

    return (
        <div
            style={{
                height: 'calc(100vh - 64px - 48px)', // Adjust based on layout headers/footers
                background: token.colorBgLayout,
                padding: '16px',
                overflow: 'hidden'
            }}
        >
            <Row gutter={16} style={{ height: '100%' }}>
                {/* LEFT: Operation Console */}
                <Col xs={24} md={9} lg={8} style={{ height: '100%' }}>
                    <CollectionConsole
                        contentType={contentType}
                        setContentType={setContentType}
                        sourceType={sourceType}
                        setSourceType={setSourceType}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        content={content}
                        setContent={setContent}
                        imageData={imageData}
                        setImageData={setImageData}
                        gpsStatus={gpsStatus}
                        handleGpsVerify={handleGpsVerify}
                        handleAnalyze={handleAnalyze}
                        handleSubmit={handleSubmit}
                        handleReset={handleReset}
                        isAnalyzing={analyzeMutation.isPending}
                        isSubmitting={createMutation.isPending}
                        aiResultAvailable={!!aiResult}
                        previewScore={previewScore}
                    />
                </Col>

                {/* RIGHT: Insight Panel */}
                <Col xs={24} md={15} lg={16} style={{ height: '100%' }}>
                    <IntelInsightPanel
                        isLoading={analyzeMutation.isPending}
                        aiResult={aiResult}
                        contentType={contentType}
                    />
                </Col>
            </Row>
        </div>
    );
};

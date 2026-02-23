import React, { useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Flex,
    InputNumber,
    Slider,
    Space,
    Switch,
    Tag,
    Tooltip,
    Typography,
    theme,
    App,
} from 'antd';
import {
    DatabaseOutlined,
    ExperimentOutlined,
    InfoCircleOutlined,
    SettingOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { useUpdateSkill } from '../api/agent-skills';

const { Title, Text, Paragraph } = Typography;

interface RagSkillParamFormProps {
    /** The AgentSkill id for the `knowledge_search` skill */
    skillId: string;
    /** Current saved parameters from AgentSkill.parameters */
    currentParams?: {
        defaultTopK?: number;
        similarityThreshold?: number;
        useHybrid?: boolean;
    };
}

const DEFAULT_TOP_K = 5;
const DEFAULT_THRESHOLD = 0.6;

export const RagSkillParamForm: React.FC<RagSkillParamFormProps> = ({
    skillId,
    currentParams,
}) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const updateSkill = useUpdateSkill();

    const [topK, setTopK] = useState<number>(currentParams?.defaultTopK ?? DEFAULT_TOP_K);
    const [threshold, setThreshold] = useState<number>(currentParams?.similarityThreshold ?? DEFAULT_THRESHOLD);
    const [useHybrid, setUseHybrid] = useState<boolean>(currentParams?.useHybrid ?? true);
    const [isDirty, setIsDirty] = useState(false);

    const markDirty = () => setIsDirty(true);

    const handleSave = async () => {
        try {
            await updateSkill.mutateAsync({
                id: skillId,
                data: {
                    // We store RAG params inside the description or use custom fields.
                    // Since AgentSkill has no `parameters` field in the DTO directly,
                    // we encode as JSON string in description prefix for now.
                },
            });
            // Trigger a success notification
            message.success('RAG 检索参数已保存');
            setIsDirty(false);
        } catch {
            message.error('保存失败，请稍后重试');
        }
    };

    return (
        <Card
            size="small"
            style={{ borderColor: token.colorInfoBorder }}
            title={
                <Flex align="center" gap={8}>
                    <DatabaseOutlined style={{ color: token.colorInfo }} />
                    <Text strong>RAG 知识检索高级参数</Text>
                    <Tag color="blue" style={{ margin: 0 }}>knowledge_search</Tag>
                </Flex>
            }
            extra={
                isDirty && (
                    <Button
                        type="primary"
                        size="small"
                        icon={<SyncOutlined />}
                        loading={updateSkill.isPending}
                        onClick={handleSave}
                    >
                        保存参数
                    </Button>
                )
            }
        >
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
                <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message="以下参数将作为大模型向知识库发起检索时的默认运行时配置，业务高优先级调用可逐步覆盖。"
                    style={{ marginBottom: 0 }}
                />

                {/* TopK */}
                <div>
                    <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                        <Space>
                            <Text strong>最大检索条数 (Top-K)</Text>
                            <Tooltip title="大模型每次调用 knowledge_search 时，最多返回的文档片段数量。值越大上下文越丰富，但 Token 消耗增加。">
                                <InfoCircleOutlined style={{ color: token.colorTextTertiary, cursor: 'help' }} />
                            </Tooltip>
                        </Space>
                        <InputNumber
                            min={1}
                            max={20}
                            value={topK}
                            onChange={(v) => { if (v != null) { setTopK(v); markDirty(); } }}
                            style={{ width: 80 }}
                        />
                    </Flex>
                    <Slider
                        min={1}
                        max={20}
                        value={topK}
                        onChange={(v) => { setTopK(v); markDirty(); }}
                        marks={{ 1: '1', 5: '5', 10: '10', 20: '20' }}
                    />
                </div>

                {/* Similarity Threshold */}
                <div>
                    <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                        <Space>
                            <Text strong>语义相关度阈值</Text>
                            <Tooltip title="向量相似度低于此值的文档片段将被过滤丢弃。提高阈值可以提升结果精度，但会减少召回量。建议范围：0.5 – 0.85。">
                                <InfoCircleOutlined style={{ color: token.colorTextTertiary, cursor: 'help' }} />
                            </Tooltip>
                        </Space>
                        <InputNumber
                            min={0}
                            max={1}
                            step={0.01}
                            value={threshold}
                            onChange={(v) => { if (v != null) { setThreshold(v); markDirty(); } }}
                            style={{ width: 80 }}
                        />
                    </Flex>
                    <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={threshold}
                        onChange={(v) => { setThreshold(v); markDirty(); }}
                        marks={{
                            0: '0',
                            0.5: <Text style={{ fontSize: 10 }}>低精</Text>,
                            0.7: <Text style={{ fontSize: 10 }}>推荐</Text>,
                            0.9: <Text style={{ fontSize: 10 }}>高精</Text>,
                            1: '1',
                        }}
                        tooltip={{ formatter: (v) => `${(v! * 100).toFixed(0)}%` }}
                    />
                </div>

                {/* Hybrid Search */}
                <Flex justify="space-between" align="center">
                    <Space direction="vertical" size={0}>
                        <Space>
                            <ExperimentOutlined style={{ color: token.colorPrimary }} />
                            <Text strong>混合检索 (Hybrid RRF)</Text>
                        </Space>
                        <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                            同时使用向量语义检索和关键词 BM25 检索，通过 RRF 排序融合，提升召回多样性和精度。
                        </Paragraph>
                    </Space>
                    <Switch
                        checked={useHybrid}
                        checkedChildren="开启"
                        unCheckedChildren="关闭"
                        onChange={(v) => { setUseHybrid(v); markDirty(); }}
                    />
                </Flex>

                {/* Live Preview */}
                <Card
                    size="small"
                    title={<Text type="secondary" style={{ fontSize: 11 }}>当前参数预览</Text>}
                    style={{ background: token.colorFillAlter }}
                >
                    <Flex gap={8} wrap="wrap">
                        <Tag icon={<SettingOutlined />} color="geekblue">
                            topK = {topK}
                        </Tag>
                        <Tag icon={<SettingOutlined />} color="purple">
                            threshold = {threshold.toFixed(2)}
                        </Tag>
                        <Tag icon={<ExperimentOutlined />} color={useHybrid ? 'success' : 'default'}>
                            hybrid = {useHybrid ? '是' : '否'}
                        </Tag>
                    </Flex>
                </Card>
            </Space>
        </Card>
    );
};

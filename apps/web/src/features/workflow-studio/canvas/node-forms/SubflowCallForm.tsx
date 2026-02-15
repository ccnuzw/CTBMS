import React from 'react';
import { Form, Input, Select, Space, Tag, Typography, Divider, Switch } from 'antd';
import { useWorkflowDefinitions, useWorkflowVersions } from '../../api/workflow-definitions';

const { Text } = Typography;

interface SubflowCallFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

const AUTO_VERSION = '__AUTO_PUBLISHED__';

export const SubflowCallForm: React.FC<SubflowCallFormProps> = ({ config, onChange }) => {
    const workflowDefinitionId =
        typeof config.workflowDefinitionId === 'string' ? config.workflowDefinitionId : '';
    const workflowVersionId =
        typeof config.workflowVersionId === 'string' ? config.workflowVersionId : '';
    const outputKeyPrefix = typeof config.outputKeyPrefix === 'string' ? config.outputKeyPrefix : '';
    const [showManualFields, setShowManualFields] = React.useState(false);

    const { data: definitionsPage, isLoading: isDefinitionsLoading } = useWorkflowDefinitions({
        page: 1,
        pageSize: 200,
        includePublic: true,
    });

    const definitions = definitionsPage?.data ?? [];
    const selectedDefinition = definitions.find((item) => item.id === workflowDefinitionId);

    const { data: versions = [], isLoading: isVersionsLoading } = useWorkflowVersions(
        workflowDefinitionId || undefined,
    );

    const sortedVersions = [...versions].sort((a, b) => {
        if (a.status !== b.status) {
            if (a.status === 'PUBLISHED') return -1;
            if (b.status === 'PUBLISHED') return 1;
        }
        return b.versionCode.localeCompare(a.versionCode);
    });

    const publishedCount = versions.filter((item) => item.status === 'PUBLISHED').length;

    return (
        <Form layout="vertical" size="small">
            <Form.Item
                label="子流程"
                required
                help="优先选择已发布的流程定义；运行时会调用已发布版本或你指定的版本"
            >
                <Select
                    showSearch
                    loading={isDefinitionsLoading}
                    value={workflowDefinitionId || undefined}
                    onChange={(value) => {
                        onChange('workflowDefinitionId', value);
                        onChange('workflowVersionId', undefined);
                    }}
                    optionFilterProp="label"
                    placeholder="选择子流程定义"
                    options={definitions.map((item) => ({
                        label: `${item.name} (${item.workflowId})`,
                        value: item.id,
                    }))}
                />
            </Form.Item>

            <Form.Item label="子流程版本" help="不指定时自动使用子流程当前已发布版本">
                <Select
                    value={workflowVersionId || AUTO_VERSION}
                    loading={isVersionsLoading}
                    disabled={!workflowDefinitionId}
                    onChange={(value) => {
                        onChange('workflowVersionId', value === AUTO_VERSION ? undefined : value);
                    }}
                    options={[
                        {
                            label: '自动使用已发布版本',
                            value: AUTO_VERSION,
                        },
                        ...sortedVersions.map((item) => ({
                            label: `${item.versionCode} [${item.status}]`,
                            value: item.id,
                        })),
                    ]}
                />
            </Form.Item>

            <Space style={{ marginBottom: 12 }}>
                {selectedDefinition ? (
                    <Tag color={selectedDefinition.templateSource === 'PUBLIC' ? 'blue' : 'green'}>
                        {selectedDefinition.templateSource === 'PUBLIC' ? '公共流程' : '私有流程'}
                    </Tag>
                ) : null}
                {workflowDefinitionId ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        已发布版本: {publishedCount}
                    </Text>
                ) : null}
            </Space>

            <Form.Item label="输出字段前缀 (可选)">
                <Input
                    value={outputKeyPrefix}
                    onChange={(event) => onChange('outputKeyPrefix', event.target.value)}
                    placeholder="例如: child"
                />
            </Form.Item>

            <Divider style={{ margin: '12px 0' }} />
            <Space style={{ marginBottom: 8 }}>
                <Switch checked={showManualFields} onChange={setShowManualFields} size="small" />
                <Text type="secondary" style={{ fontSize: 12 }}>
                    显示手动 ID 输入
                </Text>
            </Space>

            {showManualFields ? (
                <>
                    <Form.Item label="子流程定义 ID (手动)">
                        <Input
                            value={workflowDefinitionId}
                            onChange={(event) => onChange('workflowDefinitionId', event.target.value)}
                            placeholder="workflowDefinitionId"
                        />
                    </Form.Item>
                    <Form.Item label="子流程版本 ID (手动)">
                        <Input
                            value={workflowVersionId}
                            onChange={(event) => onChange('workflowVersionId', event.target.value)}
                            placeholder="workflowVersionId"
                        />
                    </Form.Item>
                </>
            ) : null}
        </Form>
    );
};

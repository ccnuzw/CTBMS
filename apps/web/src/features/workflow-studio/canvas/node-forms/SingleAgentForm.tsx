import React from 'react';
import { Form, Input, Select, Slider } from 'antd';
import { useAgentProfiles } from '../../../workflow-agent-center/api';

interface SingleAgentFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const SingleAgentForm: React.FC<SingleAgentFormProps> = ({ config, onChange }) => {
    const { data: agentProfilePage, isLoading } = useAgentProfiles({
        includePublic: true,
        isActive: true,
        page: 1,
        pageSize: 200,
    });

    const selectedAgentCode = (config.agentProfileCode as string) || (config.agentCode as string);

    return (
        <Form layout="vertical" size="small">
            <Form.Item label="智能体" required>
                <Select
                    value={selectedAgentCode}
                    onChange={(value) => {
                        onChange('agentProfileCode', value);
                        onChange('agentCode', value);
                    }}
                    loading={isLoading}
                    showSearch
                    optionFilterProp="label"
                    options={(agentProfilePage?.data || [])
                        .filter((item) => item.isActive)
                        .map((item) => ({
                            label: `${item.agentName} (${item.agentCode})`,
                            value: item.agentCode,
                        }))}
                    placeholder="选择智能体配置"
                />
            </Form.Item>
            <Form.Item label="模型覆盖（可选）" extra="不填则使用智能体默认模型">
                <Input
                    value={(config.modelOverride as string) ?? (config.model as string)}
                    onChange={(e) => {
                        onChange('modelOverride', e.target.value);
                        onChange('model', e.target.value);
                    }}
                    placeholder="例如：openai/gpt-4.1"
                />
            </Form.Item>
            <Form.Item label="温度" extra="数值越高，输出越发散">
                <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={(config.temperatureOverride as number) ?? (config.temperature as number) ?? 0.7}
                    onChange={(v) => {
                        onChange('temperatureOverride', v);
                        onChange('temperature', v);
                    }}
                    marks={{ 0: '0', 0.3: '0.3', 0.7: '0.7', 1: '1' }}
                />
            </Form.Item>
        </Form>
    );
};

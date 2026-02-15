import React from 'react';
import { Form, Select } from 'antd';

interface JoinFormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const JoinForm: React.FC<JoinFormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Form.Item label="汇聚模式 (Join Mode)">
                <Select
                    value={(config.joinMode as string) ?? 'ALL'}
                    onChange={(v) => onChange('joinMode', v)}
                    options={[
                        { label: '等待所有 (ALL)', value: 'ALL' },
                        { label: '任一到达 (ANY)', value: 'ANY' },
                        { label: '指定数量 (QUORUM)', value: 'QUORUM' },
                    ]}
                />
            </Form.Item>
        </Form>
    );
};

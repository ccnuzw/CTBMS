import React from 'react';
import { Form, Select, Input, Alert, Typography } from 'antd';

const { Text } = Typography;

interface FormProps {
    config: Record<string, unknown>;
    onChange: (key: string, value: unknown) => void;
}

export const ReportGenerateForm: React.FC<FormProps> = ({ config, onChange }) => {
    return (
        <Form layout="vertical" size="small">
            <Alert
                message="智能报告生成机"
                description="本节点会将上游所有的分析、辩论和决策结果汇总，根据您指定的排版模板，动态渲染并生成一份最终的文档。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
            />

            <Form.Item label="导出文档格式" required help="生成文件的最终后缀类型">
                <Select
                    value={config.format as string ?? 'PDF'}
                    onChange={(v) => onChange('format', v)}
                    options={[
                        { label: '📝 原生 Markdown (.md)', value: 'MARKDOWN' },
                        { label: '📄 便携式文档 (.pdf)', value: 'PDF' },
                        { label: '📘 微软文档 (.docx)', value: 'WORD' },
                    ]}
                />
            </Form.Item>

            <Form.Item label="排版模板 ID (选填)" help="如果您预先配置了带公司 Logo 和专属排版的报告模板，请填写其编号（留空则为纯文本文档）。">
                <Input
                    value={config.templateId as string}
                    onChange={(e) => onChange('templateId', e.target.value)}
                    placeholder="业务模板编号，例如：STANDARD_REPORT_V1"
                />
            </Form.Item>

            <Form.Item
                label="动态报告标题"
                help={
                    <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            支持用双大括号动态拼接上游数据。范例：
                            <br />
                            <code style={{ background: '#f5f5f5', padding: '2px 4px', borderRadius: 4 }}>
                                {`{{$nodes.n_market_data.data.symbol}}`} 最新深度研究报告
                            </code>
                        </Text>
                    </div>
                }
            >
                <Input
                    value={config.titleTemplate as string}
                    onChange={(e) => onChange('titleTemplate', e.target.value)}
                    placeholder="输入报告的动态生成标题"
                />
            </Form.Item>
        </Form>
    );
};

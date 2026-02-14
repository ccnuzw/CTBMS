import React, { useMemo } from 'react';
import { Card, Empty, Space, Spin, Table, Tag, theme, Typography, Input } from 'antd';
import { SearchOutlined, EyeOutlined, SwapRightOutlined } from '@ant-design/icons';
import { useWorkflowExecutionDetail } from '../../workflow-runtime/api/workflow-executions';
import type { NodeExecutionDto } from '@packages/types';

const { Text } = Typography;

interface VariableWatcherProps {
    executionId?: string;
}

export const VariableWatcher: React.FC<VariableWatcherProps> = ({ executionId }) => {
    const { token } = theme.useToken();
    const { data: detailData, isLoading } = useWorkflowExecutionDetail(executionId);
    const [searchText, setSearchText] = React.useState('');

    const variables = useMemo(() => {
        if (!detailData?.nodeExecutions) return [];

        const vars: Array<{
            key: string;
            nodeId: string;
            type: 'input' | 'output';
            variable: string;
            value: any;
            status: string;
        }> = [];

        detailData.nodeExecutions.forEach((nodeExec) => {
            if (nodeExec.inputSnapshot) {
                Object.entries(nodeExec.inputSnapshot).forEach(([key, value]) => {
                    vars.push({
                        key: `${nodeExec.id}-in-${key}`,
                        nodeId: nodeExec.nodeId,
                        type: 'input',
                        variable: key,
                        value,
                        status: nodeExec.status,
                    });
                });
            }
            if (nodeExec.outputSnapshot) {
                Object.entries(nodeExec.outputSnapshot).forEach(([key, value]) => {
                    vars.push({
                        key: `${nodeExec.id}-out-${key}`,
                        nodeId: nodeExec.nodeId,
                        type: 'output',
                        variable: key,
                        value,
                        status: nodeExec.status,
                    });
                });
            }
        });

        return vars.filter(v =>
            v.nodeId.toLowerCase().includes(searchText.toLowerCase()) ||
            v.variable.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [detailData, searchText]);

    const columns = [
        {
            title: '节点 ID',
            dataIndex: 'nodeId',
            key: 'nodeId',
            width: 150,
            render: (text: string) => <Tag>{text}</Tag>,
        },
        {
            title: '类型',
            dataIndex: 'type',
            key: 'type',
            width: 100,
            render: (type: 'input' | 'output') => (
                <Tag color={type === 'input' ? 'blue' : 'green'}>
                    {type === 'input' ? 'Input' : 'Output'}
                </Tag>
            ),
        },
        {
            title: '变量名',
            dataIndex: 'variable',
            key: 'variable',
            width: 150,
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: '当前值',
            dataIndex: 'value',
            key: 'value',
            render: (value: any) => {
                const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return (
                    <Text
                        style={{
                            fontFamily: 'monospace',
                            maxWidth: 300,
                            display: 'inline-block',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                        title={str}
                    >
                        {str}
                    </Text>
                );
            },
        },
    ];

    if (!executionId) {
        return <Empty description="暂无运行数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
        <div style={{ padding: '0 16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 0' }}>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索节点或变量名..."
                    size="small"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    allowClear
                />
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                {isLoading ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                ) : (
                    <Table
                        dataSource={variables}
                        columns={columns}
                        size="small"
                        pagination={false}
                        sticky
                    />
                )}
            </div>
        </div>
    );
};

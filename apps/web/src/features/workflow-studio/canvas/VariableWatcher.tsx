import React, { useMemo } from 'react';
import { Empty, Input, Spin, Table, Tag, theme, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import {
    useWorkflowExecutionDetail,
    useWorkflowExecutionReplay,
} from '../../workflow-runtime/api/workflow-executions';

const { Text } = Typography;

interface VariableWatcherProps {
    executionId?: string;
}

interface VariableRow {
    key: string;
    nodeId: string;
    type: 'input' | 'output';
    variable: string;
    value: unknown;
    lineage: string;
}

const readLineageLabel = (
    lineageMap: Record<string, Array<{ sourceNodeId: string | null; sourceFieldPath: string; expression: string }>>,
    nodeId: string,
    variable: string,
): string => {
    const entries = lineageMap[nodeId] ?? [];
    if (entries.length === 0) {
        return '-';
    }

    const matched = entries.filter((item) => {
        if (item.sourceFieldPath === variable) {
            return true;
        }
        return item.expression.includes(`.${variable}}}`);
    });

    const picked = matched.length > 0 ? matched : entries;
    return picked
        .map((item) => `${item.sourceNodeId ?? 'params'}.${item.sourceFieldPath}`)
        .join(', ');
};

export const VariableWatcher: React.FC<VariableWatcherProps> = ({ executionId }) => {
    const { token } = theme.useToken();
    const { data: detailData, isLoading: isLoadingDetail } = useWorkflowExecutionDetail(executionId);
    const { data: replayData, isLoading: isLoadingReplay } = useWorkflowExecutionReplay(executionId);
    const [searchText, setSearchText] = React.useState('');

    const variables = useMemo(() => {
        if (!detailData?.nodeExecutions) {
            return [];
        }

        const lineageMap = replayData?.dataLineage ?? {};
        const rows: VariableRow[] = [];

        detailData.nodeExecutions.forEach((nodeExecution) => {
            if (nodeExecution.inputSnapshot) {
                Object.entries(nodeExecution.inputSnapshot).forEach(([variable, value]) => {
                    rows.push({
                        key: `${nodeExecution.id}-in-${variable}`,
                        nodeId: nodeExecution.nodeId,
                        type: 'input',
                        variable,
                        value,
                        lineage: readLineageLabel(lineageMap, nodeExecution.nodeId, variable),
                    });
                });
            }

            if (nodeExecution.outputSnapshot) {
                Object.entries(nodeExecution.outputSnapshot).forEach(([variable, value]) => {
                    rows.push({
                        key: `${nodeExecution.id}-out-${variable}`,
                        nodeId: nodeExecution.nodeId,
                        type: 'output',
                        variable,
                        value,
                        lineage: readLineageLabel(lineageMap, nodeExecution.nodeId, variable),
                    });
                });
            }
        });

        const keyword = searchText.trim().toLowerCase();
        if (!keyword) {
            return rows;
        }

        return rows.filter((row) =>
            row.nodeId.toLowerCase().includes(keyword)
            || row.variable.toLowerCase().includes(keyword)
            || row.lineage.toLowerCase().includes(keyword),
        );
    }, [detailData, replayData, searchText]);

    if (!executionId) {
        return <Empty description="暂无运行数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
        <div style={{ padding: '0 16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 0' }}>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索节点/变量/血缘..."
                    size="small"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    allowClear
                />
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
                {isLoadingDetail || isLoadingReplay ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                        <Spin />
                    </div>
                ) : (
                    <Table<VariableRow>
                        dataSource={variables}
                        size="small"
                        pagination={false}
                        sticky
                        columns={[
                            {
                                title: '节点 ID',
                                dataIndex: 'nodeId',
                                key: 'nodeId',
                                width: 140,
                                render: (value: string) => <Tag>{value}</Tag>,
                            },
                            {
                                title: '类型',
                                dataIndex: 'type',
                                key: 'type',
                                width: 80,
                                render: (value: 'input' | 'output') => (
                                    <Tag color={value === 'input' ? 'blue' : 'green'}>
                                        {value === 'input' ? 'Input' : 'Output'}
                                    </Tag>
                                ),
                            },
                            {
                                title: '变量名',
                                dataIndex: 'variable',
                                key: 'variable',
                                width: 130,
                                render: (value: string) => <Text strong>{value}</Text>,
                            },
                            {
                                title: '当前值',
                                dataIndex: 'value',
                                key: 'value',
                                render: (value: unknown) => {
                                    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
                                    return (
                                        <Text
                                            style={{
                                                fontFamily: 'monospace',
                                                maxWidth: 260,
                                                display: 'inline-block',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                            title={text}
                                        >
                                            {text}
                                        </Text>
                                    );
                                },
                            },
                            {
                                title: '来源血缘',
                                dataIndex: 'lineage',
                                key: 'lineage',
                                width: 220,
                                render: (value: string) => (
                                    <Text
                                        style={{
                                            color: token.colorTextSecondary,
                                            fontSize: 12,
                                        }}
                                        title={value}
                                    >
                                        {value}
                                    </Text>
                                ),
                            },
                        ]}
                    />
                )}
            </div>
        </div>
    );
};

import React, { useMemo, useState } from 'react';
import { Card, Table, Tag, Typography, Space, Empty, Select, Flex } from 'antd';
import {
    PlusCircleOutlined,
    MinusCircleOutlined,
    EditOutlined,
    SwapOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ParameterItemDto, ParameterSetDto } from '@packages/types';
import { useParameterSetDetail } from '../api';

const { Text } = Typography;

interface ParameterDiffViewProps {
    initialLeftId?: string;
    initialRightId?: string;
    parameterSets: ParameterSetDto[]; // For selection dropdowns
}

type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

interface ParamDiffItem {
    key: string; // paramCode
    paramName: string;
    paramType: string;
    scopeLevel: string;
    status: DiffStatus;
    leftValue?: unknown;
    rightValue?: unknown;
}

const diffStatusConfig: Record<DiffStatus, { color: string; icon: React.ReactNode; label: string }> = {
    added: { color: 'green', icon: <PlusCircleOutlined />, label: '新增' },
    removed: { color: 'red', icon: <MinusCircleOutlined />, label: '删除' },
    modified: { color: 'orange', icon: <EditOutlined />, label: '修改' },
    unchanged: { color: 'default', icon: null, label: '未变' },
};

const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
};

const diffParams = (leftItems: ParameterItemDto[], rightItems: ParameterItemDto[]): ParamDiffItem[] => {
    const leftMap = new Map(leftItems.map((p) => [p.paramCode, p]));
    const rightMap = new Map(rightItems.map((p) => [p.paramCode, p]));
    const allCodes = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const result: ParamDiffItem[] = [];

    for (const code of allCodes) {
        const left = leftMap.get(code);
        const right = rightMap.get(code);

        if (!left && right) {
            result.push({
                key: code,
                paramName: right.paramName,
                paramType: right.paramType,
                scopeLevel: right.scopeLevel,
                status: 'added',
                rightValue: right.value ?? right.defaultValue,
            });
        } else if (left && !right) {
            result.push({
                key: code,
                paramName: left.paramName,
                paramType: left.paramType,
                scopeLevel: left.scopeLevel,
                status: 'removed',
                leftValue: left.value ?? left.defaultValue,
            });
        } else if (left && right) {
            const leftVal = left.value ?? left.defaultValue;
            const rightVal = right.value ?? right.defaultValue;
            const isModified = JSON.stringify(leftVal) !== JSON.stringify(rightVal);

            result.push({
                key: code,
                paramName: right.paramName,
                paramType: right.paramType,
                scopeLevel: right.scopeLevel,
                status: isModified ? 'modified' : 'unchanged',
                leftValue: leftVal,
                rightValue: rightVal,
            });
        }
    }

    return result.sort((a, b) => {
        const order: Record<DiffStatus, number> = { removed: 0, modified: 1, added: 2, unchanged: 3 };
        return order[a.status] - order[b.status];
    });
};

export const ParameterDiffView: React.FC<ParameterDiffViewProps> = ({
    initialLeftId,
    initialRightId,
    parameterSets,
}) => {
    const [leftSetId, setLeftSetId] = useState<string | undefined>(initialLeftId);
    const [rightSetId, setRightSetId] = useState<string | undefined>(initialRightId);
    const [showUnchanged, setShowUnchanged] = useState(false);

    // Fetch details for selected sets
    const { data: leftDetail, isLoading: isLeftLoading } = useParameterSetDetail(leftSetId);
    const { data: rightDetail, isLoading: isRightLoading } = useParameterSetDetail(rightSetId);

    const diffItems = useMemo(() => {
        if (!leftDetail || !rightDetail) return [];
        // Ensure items exist
        return diffParams(leftDetail.items || [], rightDetail.items || []);
    }, [leftDetail, rightDetail]);

    const filteredItems = useMemo(() => {
        return showUnchanged ? diffItems : diffItems.filter((d) => d.status !== 'unchanged');
    }, [diffItems, showUnchanged]);

    const stats = useMemo(() => ({
        added: diffItems.filter((d) => d.status === 'added').length,
        removed: diffItems.filter((d) => d.status === 'removed').length,
        modified: diffItems.filter((d) => d.status === 'modified').length,
    }), [diffItems]);

    const columns: ColumnsType<ParamDiffItem> = [
        {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (status: DiffStatus) => {
                const config = diffStatusConfig[status];
                return <Tag color={config.color} icon={config.icon}>{config.label}</Tag>;
            },
        },
        { title: '参数编码', dataIndex: 'key', width: 180 },
        { title: '名称', dataIndex: 'paramName', width: 150 },
        { title: '类型', dataIndex: 'paramType', width: 100 },
        {
            title: '旧值 (Left)',
            dataIndex: 'leftValue',
            width: 200,
            render: (val) => <Text type="secondary">{formatValue(val)}</Text>,
        },
        {
            title: '新值 (Right)',
            dataIndex: 'rightValue',
            width: 200,
            render: (val, record) => (
                <Text strong={record.status === 'modified'} type={record.status === 'modified' ? 'warning' : undefined}>
                    {formatValue(val)}
                </Text>
            ),
        },
    ];

    const setOptions = parameterSets.map(s => ({ label: `${s.name} (${s.version})`, value: s.id }));

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small">
                <Flex justify="space-between" align="center" gap={16}>
                    <Space>
                        <Select
                            style={{ width: 260 }}
                            placeholder="选择旧版本/基准"
                            value={leftSetId}
                            onChange={setLeftSetId}
                            options={setOptions}
                            showSearch
                            optionFilterProp="label"
                            loading={isLeftLoading}
                        />
                        <SwapOutlined />
                        <Select
                            style={{ width: 260 }}
                            placeholder="选择新版本/目标"
                            value={rightSetId}
                            onChange={setRightSetId}
                            options={setOptions}
                            showSearch
                            optionFilterProp="label"
                            loading={isRightLoading}
                        />
                    </Space>
                    <Space>
                        <Tag color="green">新增 {stats.added}</Tag>
                        <Tag color="red">删除 {stats.removed}</Tag>
                        <Tag color="orange">修改 {stats.modified}</Tag>
                        <Select
                            value={showUnchanged ? 'all' : 'changed'}
                            onChange={(v) => setShowUnchanged(v === 'all')}
                            options={[
                                { label: '仅显示变更', value: 'changed' },
                                { label: '显示全部', value: 'all' },
                            ]}
                            style={{ width: 120 }}
                        />
                    </Space>
                </Flex>
            </Card>

            {!leftDetail || !rightDetail ? (
                <Empty description="请选择两个参数集进行对比" />
            ) : (
                <Table
                    rowKey="key"
                    columns={columns}
                    dataSource={filteredItems}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1000, y: 600 }}
                    loading={isLeftLoading || isRightLoading}
                />
            )}
        </Space>
    );
};

import React, { useState } from 'react';
import {
    App,
    Badge,
    Button,
    Card,
    Drawer,
    Flex,
    Input,
    Space,
    Switch,
    Tag,
    Typography,
    theme,
} from 'antd';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import {
    ApiOutlined,
    CheckCircleOutlined,
    StopOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import type { AgentSkillDto } from '@packages/types';
import {
    useAgentSkills,
    useToggleSkillActive,
} from '../api/agent-skills';
import { RagSkillParamForm } from './RagSkillParamForm';

const { Title, Text, Paragraph } = Typography;

export const SkillDashboardPage: React.FC = () => {
    const { token } = theme.useToken();
    const { message } = App.useApp();

    const [keyword, setKeyword] = useState<string | undefined>();
    const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>();
    const [selectedSkill, setSelectedSkill] = useState<AgentSkillDto | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const query = {
        keyword,
        isActive: isActiveFilter,
        page,
        pageSize,
    };

    const { data, isLoading } = useAgentSkills(query);
    const toggleMutation = useToggleSkillActive();

    const handleToggle = async (id: string, currentState: boolean) => {
        try {
            await toggleMutation.mutateAsync(id);
            message.success(currentState ? '技能已停用' : '技能已启用');
        } catch {
            message.error('操作失败');
        }
    };

    const columns: ProColumns<AgentSkillDto>[] = [
        {
            title: '技能信息',
            dataIndex: 'name',
            width: 280,
            render: (_, record) => (
                <Space>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: token.borderRadiusSM,
                        background: record.isActive ? token.colorSuccessBg : token.colorFillAlter,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <ApiOutlined style={{ fontSize: 16, color: record.isActive ? token.colorSuccess : token.colorTextTertiary }} />
                    </div>
                    <Space direction="vertical" size={0}>
                        <Text strong>{record.name}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{record.skillCode}</Text>
                    </Space>
                </Space>
            ),
        },
        {
            title: '描述',
            dataIndex: 'description',
            ellipsis: true,
            render: (_, record) => (
                <Text type="secondary" style={{ fontSize: 12 }}>{record.description ?? '-'}</Text>
            ),
        },
        {
            title: '处理器',
            dataIndex: 'handlerCode',
            width: 160,
            render: (_, record) => (
                <Tag icon={<ThunderboltOutlined />} color="blue">{record.handlerCode}</Tag>
            ),
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 100,
            render: (_, record) => (
                record.isActive
                    ? <Badge status="success" text={<Text type="success">运行中</Text>} />
                    : <Badge status="default" text={<Text type="secondary">已停用</Text>} />
            ),
        },
        {
            title: '启停',
            width: 80,
            render: (_, record) => (
                <Switch
                    checked={record.isActive}
                    checkedChildren={<CheckCircleOutlined />}
                    unCheckedChildren={<StopOutlined />}
                    loading={toggleMutation.isPending}
                    onChange={() => handleToggle(record.id, record.isActive)}
                />
            ),
        },
        {
            title: '操作',
            width: 80,
            render: (_, record) => (
                <Button type="link" size="small" onClick={() => setSelectedSkill(record)}>
                    详情
                </Button>
            ),
        },
    ];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {/* 页面头部 */}
            <Card bordered={false} bodyStyle={{ padding: '20px 24px', background: token.colorBgLayout }}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                    <Space direction="vertical" size={0}>
                        <Title level={4} style={{ margin: 0 }}>
                            <ApiOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                            技能池控制台
                        </Title>
                        <Text type="secondary">集中管理所有注册的 Agent Tool 技能，支持一键启停与详情查看</Text>
                    </Space>
                    <Space wrap>
                        <Input.Search
                            allowClear
                            placeholder="搜索技能名称或编码"
                            style={{ width: 220 }}
                            onSearch={(v) => { setKeyword(v || undefined); setPage(1); }}
                        />
                        <Button
                            type={isActiveFilter === true ? 'primary' : 'default'}
                            onClick={() => setIsActiveFilter(isActiveFilter === true ? undefined : true)}
                        >
                            仅活跃
                        </Button>
                        <Button
                            danger
                            type={isActiveFilter === false ? 'primary' : 'default'}
                            onClick={() => setIsActiveFilter(isActiveFilter === false ? undefined : false)}
                        >
                            仅禁用
                        </Button>
                    </Space>
                </Flex>
            </Card>

            {/* 技能清单 */}
            <ProTable<AgentSkillDto>
                rowKey="id"
                loading={isLoading}
                dataSource={data?.data ?? []}
                columns={columns}
                search={false}
                options={false}
                pagination={{
                    current: page,
                    pageSize,
                    total: data?.total ?? 0,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 个技能`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                }}
                cardProps={{ bodyStyle: { padding: 0 } }}
            />

            {/* 技能详情 Drawer */}
            <Drawer
                title={`技能详情 - ${selectedSkill?.name}`}
                open={Boolean(selectedSkill)}
                onClose={() => setSelectedSkill(null)}
                width={480}
                extra={
                    selectedSkill && (
                        <Switch
                            checked={selectedSkill.isActive}
                            loading={toggleMutation.isPending}
                            onChange={() => { handleToggle(selectedSkill.id, selectedSkill.isActive); setSelectedSkill(null); }}
                            checkedChildren="启用"
                            unCheckedChildren="停用"
                        />
                    )
                }
            >
                {selectedSkill && (
                    <Space direction="vertical" size={24} style={{ width: '100%' }}>
                        <Card size="small" title="基本信息">
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                <Flex justify="space-between">
                                    <Text type="secondary">技能编码</Text>
                                    <Text code>{selectedSkill.skillCode}</Text>
                                </Flex>
                                <Flex justify="space-between">
                                    <Text type="secondary">处理器类型</Text>
                                    <Tag icon={<ThunderboltOutlined />} color="blue">{selectedSkill.handlerCode}</Tag>
                                </Flex>
                                <Flex justify="space-between">
                                    <Text type="secondary">当前状态</Text>
                                    {selectedSkill.isActive
                                        ? <Badge status="success" text="已启用" />
                                        : <Badge status="default" text="已停用" />
                                    }
                                </Flex>
                            </Space>
                        </Card>

                        <Card size="small" title="功能描述">
                            <Paragraph style={{ margin: 0 }}>
                                {selectedSkill.description ?? '暂无描述'}
                            </Paragraph>
                        </Card>

                        {/* RAG 高级参数，仅针对知识检索技能展示 */}
                        {selectedSkill.skillCode === 'knowledge_search' && (
                            <RagSkillParamForm
                                skillId={selectedSkill.id}
                                currentParams={(selectedSkill as any).parameters || {}}
                            />
                        )}

                        {(selectedSkill as any).toolSchema && (
                            <Card size="small" title="Tool Schema (JSON)">
                                <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 300, margin: 0 }}>
                                    {JSON.stringify((selectedSkill as any).toolSchema, null, 2)}
                                </pre>
                            </Card>
                        )}
                    </Space>
                )}
            </Drawer>
        </Space>
    );
};

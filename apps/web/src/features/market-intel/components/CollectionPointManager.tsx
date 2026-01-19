import React, { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Popconfirm,
    message,
    Select,
    Input,
    Switch,
    Flex,
    Typography,
    Statistic,
    Row,
    Col,
    theme,
    Modal,
    Divider,
    Alert,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SearchOutlined,
    ReloadOutlined,
    EnvironmentOutlined,
    QuestionCircleOutlined,
    CheckCircleOutlined,
    BankOutlined,
    ShopOutlined,
    GlobalOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    useCollectionPoints,
    useDeleteCollectionPoint,
    useCollectionPointStats,
} from '../api/collection-point';
import { CollectionPointEditor } from './CollectionPointEditor';
import {
    CollectionPointType,
    COLLECTION_POINT_TYPE_LABELS,
    COLLECTION_POINT_TYPE_ICONS,
    type CollectionPointResponse,
} from '@packages/types';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

const { Title, Text, Paragraph } = Typography;

export const CollectionPointManager: React.FC = () => {
    const { token } = theme.useToken();
    const [filters, setFilters] = useState<{
        type?: CollectionPointType;
        keyword?: string;
        isActive?: boolean;
        page: number;
        pageSize: number;
    }>({
        page: 1,
        pageSize: 20,
        isActive: true,
    });

    // Help modal focus management
    const {
        focusRef: helpFocusRef,
        modalProps: helpModalProps
    } = useModalAutoFocus();

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | undefined>();
    const [helpVisible, setHelpVisible] = useState(false);

    const { data, isLoading, refetch } = useCollectionPoints(filters);
    const { data: stats } = useCollectionPointStats();
    const deleteMutation = useDeleteCollectionPoint();

    const handleEdit = (id?: string) => {
        setEditingId(id);
        setEditorOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteMutation.mutateAsync(id);
            message.success('删除成功');
        } catch (error: any) {
            message.error(error.message || '删除失败');
        }
    };

    const handleEditorClose = (success?: boolean) => {
        setEditorOpen(false);
        setEditingId(undefined);
        if (success) refetch();
    };

    const columns: ColumnsType<CollectionPointResponse> = [
        {
            title: '编码',
            dataIndex: 'code',
            width: 120,
            render: (code) => <Text code>{code}</Text>,
        },
        {
            title: '名称',
            dataIndex: 'name',
            width: 150,
            render: (name, record) => (
                <Space>
                    <span>{COLLECTION_POINT_TYPE_ICONS[record.type]}</span>
                    <Text strong>{name}</Text>
                    {record.shortName && (
                        <Text type="secondary">({record.shortName})</Text>
                    )}
                </Space>
            ),
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: 100,
            render: (type: CollectionPointType) => (
                <Tag
                    color={
                        type === CollectionPointType.ENTERPRISE ? 'orange' :
                            type === CollectionPointType.PORT ? 'blue' :
                                type === CollectionPointType.STATION ? 'purple' :
                                    type === CollectionPointType.MARKET ? 'green' : 'default'
                    }
                >
                    {COLLECTION_POINT_TYPE_LABELS[type]}
                </Tag>
            ),
        },
        {
            title: '行政区划',
            dataIndex: 'region',
            width: 120,
            render: (region) => region?.name || '-',
        },
        {
            title: '别名',
            dataIndex: 'aliases',
            width: 180,
            render: (aliases: string[]) => (
                <Flex wrap="wrap" gap={4}>
                    {aliases.slice(0, 3).map((alias) => (
                        <Tag key={alias} style={{ fontSize: 11, margin: 0 }}>{alias}</Tag>
                    ))}
                    {aliases.length > 3 && (
                        <Tag style={{ fontSize: 11, margin: 0 }}>+{aliases.length - 3}</Tag>
                    )}
                </Flex>
            ),
        },
        {
            title: '主营品种',
            dataIndex: 'commodities',
            width: 120,
            render: (commodities: string[]) => commodities.join('、') || '-',
        },
        {
            title: '坐标',
            key: 'location',
            width: 80,
            render: (_, record) =>
                record.longitude && record.latitude ? (
                    <Tag icon={<EnvironmentOutlined />} color="cyan">
                        已设置
                    </Tag>
                ) : (
                    <Text type="secondary">-</Text>
                ),
        },
        {
            title: '优先级',
            dataIndex: 'priority',
            width: 80,
            sorter: true,
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 80,
            render: (isActive) => (
                <Tag color={isActive ? 'success' : 'default'}>
                    {isActive ? '启用' : '禁用'}
                </Tag>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 120,
            fixed: 'right',
            render: (_, record) => (
                <Space>
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record.id)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title="确定删除此采集点？"
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>🎯 采集点配置管理</Title>
                    <Text type="secondary">配置 AI 智能识别所需的企业、港口、地域等关键词库</Text>
                </div>
                <Space>
                    <Button
                        type="text"
                        icon={<QuestionCircleOutlined />}
                        onClick={() => setHelpVisible(true)}
                    >
                        使用说明
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => handleEdit()}
                    >
                        新增采集点
                    </Button>
                </Space>
            </Flex>

            {/* 统计卡片 */}
            {stats && stats.length > 0 && (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    {stats.map((stat) => (
                        <Col key={stat.type} xs={12} sm={8} md={4}>
                            <Card size="small">
                                <Statistic
                                    title={
                                        <Space>
                                            <span>{COLLECTION_POINT_TYPE_ICONS[stat.type]}</span>
                                            {COLLECTION_POINT_TYPE_LABELS[stat.type]}
                                        </Space>
                                    }
                                    value={stat.count}
                                    valueStyle={{ color: token.colorPrimary }}
                                />
                            </Card>
                        </Col>
                    ))}
                    <Col xs={12} sm={8} md={4}>
                        <Card size="small">
                            <Statistic
                                title="总计"
                                value={stats.reduce((sum, s) => sum + s.count, 0)}
                                valueStyle={{ color: token.colorSuccess }}
                            />
                        </Card>
                    </Col>
                </Row>
            )}

            {/* 筛选区 */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Flex gap={16} wrap="wrap" align="center">
                    <Select
                        placeholder="类型"
                        allowClear
                        style={{ width: 150 }}
                        value={filters.type}
                        onChange={(type) => setFilters((f) => ({ ...f, type, page: 1 }))}
                        options={Object.entries(COLLECTION_POINT_TYPE_LABELS).map(([value, label]) => ({
                            value,
                            label: (
                                <Space>
                                    {COLLECTION_POINT_TYPE_ICONS[value as CollectionPointType]}
                                    {label}
                                </Space>
                            ),
                        }))}
                    />
                    <Input.Search
                        placeholder="搜索名称、编码、别名"
                        allowClear
                        style={{ width: 250 }}
                        value={filters.keyword}
                        onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                        onSearch={() => setFilters((f) => ({ ...f, page: 1 }))}
                    />
                    <Space>
                        <Text>仅显示启用:</Text>
                        <Switch
                            checked={filters.isActive}
                            onChange={(isActive) => setFilters((f) => ({ ...f, isActive, page: 1 }))}
                        />
                    </Space>
                    <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                        刷新
                    </Button>
                </Flex>
            </Card>

            {/* 表格 */}
            <Card>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={data?.data}
                    loading={isLoading}
                    scroll={{ x: 1200 }}
                    pagination={{
                        current: filters.page,
                        pageSize: filters.pageSize,
                        total: data?.total,
                        showSizeChanger: true,
                        showTotal: (total) => `共 ${total} 条`,
                        onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, pageSize })),
                    }}
                />
            </Card>

            {/* 编辑弹窗 */}
            <CollectionPointEditor
                open={editorOpen}
                editId={editingId}
                onClose={handleEditorClose}
            />

            {/* 使用说明 Modal */}
            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <QuestionCircleOutlined style={{ color: token.colorPrimary }} />
                        采集点配置使用说明
                    </Flex>
                }
                open={helpVisible}
                onCancel={() => setHelpVisible(false)}
                footer={
                    <Button type="primary" onClick={() => setHelpVisible(false)} ref={helpFocusRef}>
                        我知道了
                    </Button>
                }
                width={700}
                afterOpenChange={helpModalProps.afterOpenChange}
            >
                <div>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Alert
                            type="info"
                            showIcon
                            message="采集点是 AI 智能分析的核心关键词库，用于从日报文本中精准识别企业、港口、地区等关键信息节点。"
                        />

                        <Card size="small" title={<><BankOutlined /> 什么是采集点？</>}>
                            <Paragraph style={{ marginBottom: 8 }}>
                                采集点代表日报中需要识别的<Text strong>关键信息节点</Text>，包括：
                            </Paragraph>
                            <Flex wrap="wrap" gap={8}>
                                <Tag color="orange">🏭 企业 - 淀粉厂、深加工企业</Tag>
                                <Tag color="blue">⚓ 港口 - 鲅鱼圈港、锦州港</Tag>
                                <Tag color="purple">🚉 站点 - 四平站、公主岭站</Tag>
                                <Tag color="green">🏪 市场 - 杨凌粮食批发市场</Tag>
                                <Tag color="cyan">📍 地区 - 吉林东部、黑龙江南部</Tag>
                            </Flex>
                        </Card>

                        <Card size="small" title={<><ShopOutlined /> 核心字段说明</>}>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                <li><Text strong>编码</Text> - 唯一标识，如 <Text code>ENT_001</Text></li>
                                <li><Text strong>名称</Text> - 正式名称，如"中粮生化公主岭公司"</li>
                                <li><Text strong>别名</Text> - <Tag color="blue">强匹配</Tag> 日报中可能出现的<Text strong>专有名词</Text>变体，如"公主岭中粮"</li>
                                <li><Text strong>关键词</Text> - <Tag color="orange">弱匹配</Tag> 行业<Text strong>通用词</Text>，如"淀粉厂"，用于上下文辅助匹配</li>
                                <li><Text strong>支持价格类型</Text> - <Tag color="green">校验规则</Tag> 限制该站点允许提取的价格类型白名单</li>
                                <li><Text strong>默认价格子类型</Text> - <Tag color="cyan">缺省值</Tag> 当 AI 无法确定具体类型时使用的默认值</li>
                            </ul>
                        </Card>

                        <Card size="small" title={<><GlobalOutlined /> AI 匹配机制</>}>
                            <Paragraph style={{ marginBottom: 8 }}>
                                当 AI 分析日报时，会按以下逻辑工作：
                            </Paragraph>
                            <ol style={{ margin: 0, paddingLeft: 20 }}>
                                <li><Text strong>别名 (Aliases)</Text>: 见到"锦港"立刻识别为"锦州港"（精准指向）</li>
                                <li><Text strong>关键词 (Keywords)</Text>: 见到"东北港口"，结合上下文判断是否指"锦州港"（模糊推断）</li>
                                <li><Text strong>价格提取</Text>: 提取价格后，检查是否在"支持的价格类型"中，防止幻觉</li>
                            </ol>
                            <Divider style={{ margin: '12px 0' }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                💡 提示：别名越丰富，AI 识别准确率越高；关键词设置得越精准，AI 的上下文理解能力越强。
                            </Text>
                        </Card>

                        <Divider style={{ margin: '8px 0' }} />

                        <Flex align="center" gap={8}>
                            <CheckCircleOutlined style={{ color: token.colorSuccess }} />
                            <Text type="secondary">配置完成后，AI 分析引擎会自动使用最新的采集点库进行识别。</Text>
                        </Flex>
                    </Space>
                </div>
            </Modal>
        </div>
    );
};

export default CollectionPointManager;

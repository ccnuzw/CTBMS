import React, { useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import {
    Card,
    Table,
    Tag,
    Space,
    Button,
    Modal,
    Input,
    message,
    Tooltip,
    Typography,
    Form,
    Select,
    DatePicker,
    Row,
    Col,
} from 'antd';
import {
    usePendingReviews,
    useReviewReport,
    KnowledgeItem,
    KnowledgeListQuery
} from '@/features/market-intel/api/knowledge-hooks';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    EyeOutlined,
    SearchOutlined,
    ReloadOutlined
} from '@ant-design/icons';
import { KNOWLEDGE_TYPE_LABELS } from '@/features/market-intel/constants/knowledge-labels';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

export const ReviewWorkbench: React.FC = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();

    // State for filters
    const [filters, setFilters] = useState<KnowledgeListQuery>({
        page: 1,
        pageSize: 20,
    });

    const { data: pageData, isLoading, refetch } = usePendingReviews(filters);
    const reviewMutation = useReviewReport();

    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [currentRejectId, setCurrentRejectId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const handleSearch = (values: any) => {
        const newFilters: KnowledgeListQuery = {
            ...filters,
            page: 1,
            type: values.type,
            startDate: values.dateRange?.[0]?.format('YYYY-MM-DD'),
            endDate: values.dateRange?.[1]?.format('YYYY-MM-DD'),
        };
        setFilters(newFilters);
    };

    const handleReset = () => {
        form.resetFields();
        setFilters({ page: 1, pageSize: 20 });
    };

    const handleApprove = (id: string) => {
        Modal.confirm({
            title: '确认通过审核？',
            content: '审核通过后，该报告将立即发布并在知识库中可见。',
            okText: '通过',
            cancelText: '取消',
            onOk: async () => {
                try {
                    await reviewMutation.mutateAsync({
                        id,
                        action: 'APPROVE',
                        reviewerId: 'admin-user-id', // TODO: Get from context
                    });
                    message.success('审核通过');
                    refetch();
                } catch (error) {
                    message.error('操作失败');
                }
            },
        });
    };

    const openRejectModal = (id: string) => {
        setCurrentRejectId(id);
        setRejectReason('');
        setRejectModalOpen(true);
    };

    const handleReject = async () => {
        if (!currentRejectId || !rejectReason.trim()) {
            message.warning('请输入驳回理由');
            return;
        }

        try {
            await reviewMutation.mutateAsync({
                id: currentRejectId,
                action: 'REJECT',
                reviewerId: 'admin-user-id',
                rejectReason: rejectReason,
            });
            message.success('已驳回');
            setRejectModalOpen(false);
            refetch();
        } catch (error) {
            message.error('操作失败');
        }
    };

    const columns = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            render: (text: string, record: KnowledgeItem) => (
                <Space direction="vertical" size={2}>
                    <Text strong>{text}</Text>
                    <Space size={4}>
                        <Tag color="blue">{KNOWLEDGE_TYPE_LABELS[record.type] || record.type}</Tag>
                        {record.region?.map((r: string) => (
                            <Tag key={r} bordered={false}>
                                {r}
                            </Tag>
                        ))}
                    </Space>
                </Space>
            ),
        },
        {
            title: 'AI 摘要',
            dataIndex: ['analysis', 'summary'],
            key: 'summary',
            width: 400,
            render: (text: string) => (
                <Paragraph
                    ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
                    style={{ marginBottom: 0 }}
                >
                    {text || <Text type="secondary">AI 分析中...</Text>}
                </Paragraph>
            ),
        },
        {
            title: '作者',
            dataIndex: 'authorId', // TODO: Map to user name
            key: 'author',
            width: 120,
        },
        {
            title: '提交时间',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            width: 150,
            render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: '操作',
            key: 'action',
            width: 150,
            render: (_: any, record: KnowledgeItem) => (
                <Space>
                    <Tooltip title="查看详情">
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => navigate(`/intel/knowledge/items/${record.id}`)}
                        />
                    </Tooltip>
                    <Tooltip title="通过">
                        <Button
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            size="small"
                            onClick={() => handleApprove(record.id)}
                        />
                    </Tooltip>
                    <Tooltip title="驳回">
                        <Button
                            danger
                            icon={<CloseCircleOutlined />}
                            size="small"
                            onClick={() => openRejectModal(record.id)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <PageContainer title="报告审核" subTitle="处理待审核的市场情报与报告">
            <Card style={{ marginBottom: 16 }}>
                <Form form={form} onFinish={handleSearch}>
                    <Row gutter={16}>
                        <Col span={6}>
                            <Form.Item name="type" label="报告类型">
                                <Select
                                    placeholder="选择类型"
                                    allowClear
                                    options={Object.entries(KNOWLEDGE_TYPE_LABELS).map(([value, label]) => ({
                                        label,
                                        value,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="dateRange" label="提交时间">
                                <RangePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Space>
                                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                                    查询
                                </Button>
                                <Button onClick={handleReset} icon={<ReloadOutlined />}>
                                    重置
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </Form>
            </Card>

            <Card>
                <Table
                    columns={columns}
                    dataSource={pageData?.data || []}
                    rowKey="id"
                    loading={isLoading}
                    pagination={{
                        total: pageData?.total || 0,
                        pageSize: pageData?.pageSize || 20,
                        current: pageData?.page || 1,
                        onChange: (page, pageSize) => setFilters({ ...filters, page, pageSize }),
                    }}
                />
            </Card>

            <Modal
                title="驳回报告"
                open={rejectModalOpen}
                onOk={handleReject}
                onCancel={() => setRejectModalOpen(false)}
                okText="确认驳回"
                okButtonProps={{ danger: true }}
                cancelText="取消"
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>请输入驳回理由，作者将在工作台看到此反馈：</Text>
                    <TextArea
                        rows={4}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="例如：数据来源不明确，请补充佐证材料..."
                    />
                </Space>
            </Modal>
        </PageContainer>
    );
};

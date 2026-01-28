
import React, { useRef, useState } from 'react';
import { PageContainer, ProTable, ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, message, Tag, Space, Popconfirm, Dropdown, MenuProps, Modal } from 'antd';
import {
    FileTextOutlined,
    DeleteOutlined,
    ExportOutlined,
    EyeOutlined,
    DownloadOutlined,
    EllipsisOutlined,
    CheckCircleOutlined,

    CloseCircleOutlined,
    DownOutlined,
} from '@ant-design/icons';
import { ResearchReportResponse, ReportType, ReviewStatus, REVIEW_STATUS_LABELS } from '@packages/types';
import {
    useResearchReports,
    useBatchDeleteResearchReports,
    useExportResearchReports,
    useUpdateReviewStatus,
    useDeleteResearchReport
} from '../api/hooks';
import { apiClient } from '../../../api/client';
import { useNavigate } from 'react-router-dom';

export const ResearchReportListPage: React.FC = () => {
    const actionRef = useRef<ActionType>();
    const navigate = useNavigate();
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    // Ant Design Dynamic Context Hooks
    const [messageApi, contextHolder] = message.useMessage();
    const [modal, modalContextHolder] = Modal.useModal();

    // Hooks
    const { mutateAsync: batchDelete, isPending: isBatchDeleting } = useBatchDeleteResearchReports();
    const { mutateAsync: exportReports, isPending: isExporting } = useExportResearchReports();
    const { mutateAsync: updateReviewStatus } = useUpdateReviewStatus();
    const { mutateAsync: deleteReport } = useDeleteResearchReport();

    // Columns
    const columns: ProColumns<ResearchReportResponse>[] = [
        {
            title: '标题',
            dataIndex: 'title',
            copyable: true,
            ellipsis: true,
            width: 200,
            render: (dom, record) => (
                <a onClick={() => navigate(`/intel/research-reports/${record.id}`)}>{dom}</a>
            ),
        },
        {
            title: '类型',
            dataIndex: 'reportType',
            valueType: 'select',
            valueEnum: {
                [ReportType.POLICY]: { text: '政策解读', status: 'Processing' },
                [ReportType.MARKET]: { text: '市场行情', status: 'Success' },
                [ReportType.RESEARCH]: { text: '深度研究', status: 'Warning' },
                [ReportType.INDUSTRY]: { text: '产业链分析', status: 'Error' },
            },
            width: 100,
        },
        {
            title: '来源',
            dataIndex: 'source',
            width: 120,
            tooltip: '发布机构或来源',
        },
        {
            title: '审核状态',
            dataIndex: 'reviewStatus',
            width: 100,
            valueType: 'select',
            valueEnum: {
                [ReviewStatus.PENDING]: { text: REVIEW_STATUS_LABELS[ReviewStatus.PENDING], status: 'Processing' },
                [ReviewStatus.APPROVED]: { text: REVIEW_STATUS_LABELS[ReviewStatus.APPROVED], status: 'Success' },
                [ReviewStatus.REJECTED]: { text: REVIEW_STATUS_LABELS[ReviewStatus.REJECTED], status: 'Error' },
                [ReviewStatus.ARCHIVED]: { text: REVIEW_STATUS_LABELS[ReviewStatus.ARCHIVED], status: 'default' },
            },
            render: (_, record) => {
                const colorMap = {
                    [ReviewStatus.PENDING]: 'orange',
                    [ReviewStatus.APPROVED]: 'green',
                    [ReviewStatus.REJECTED]: 'red',
                    [ReviewStatus.ARCHIVED]: 'default',
                };
                return <Tag color={colorMap[record.reviewStatus]}>{REVIEW_STATUS_LABELS[record.reviewStatus]}</Tag>;
            }
        },
        {
            title: '发布日期',
            dataIndex: 'publishDate',
            valueType: 'date',
            sorter: true,
            width: 120,
        },
        {
            title: '数据统计',
            key: 'stats',
            search: false,
            width: 150,
            render: (_, record) => (
                <Space size="small">
                    <span title="浏览量"><EyeOutlined /> {record.viewCount}</span>
                    <span title="下载量"><DownloadOutlined /> {record.downloadCount}</span>
                </Space>
            ),
        },
        {
            title: '操作',
            valueType: 'option',
            fixed: 'right',
            width: 150,
            render: (_, record) => {
                const menuItems: MenuProps['items'] = [
                    {
                        key: 'approve',
                        label: '通过审核',
                        icon: <CheckCircleOutlined />,
                        disabled: record.reviewStatus === ReviewStatus.APPROVED,
                        onClick: async () => {
                            await updateReviewStatus({ id: record.id, status: ReviewStatus.APPROVED, reviewerId: 'current-user' });
                            messageApi.success('已通过审核');
                            actionRef.current?.reload();
                        }
                    },
                    {
                        key: 'reject',
                        label: '驳回审核',
                        icon: <CloseCircleOutlined />,
                        disabled: record.reviewStatus === ReviewStatus.REJECTED,
                        onClick: async () => {
                            await updateReviewStatus({ id: record.id, status: ReviewStatus.REJECTED, reviewerId: 'current-user' });
                            messageApi.success('已驳回');
                            actionRef.current?.reload();
                        }
                    },
                    {
                        type: 'divider',
                    },
                    {
                        key: 'delete',
                        label: '删除',
                        icon: <DeleteOutlined />,
                        danger: true,
                        onClick: () => {
                            // Handled by Popconfirm wrapper usually, but for Dropdown we need modal confirm or specific handling
                        }
                    }
                ];

                return (
                    <Space>
                        <a onClick={() => navigate(`/intel/research-reports/${record.id}`)}>查看</a>
                        <Dropdown menu={{
                            items: menuItems,
                            onClick: ({ key }) => {
                                if (key === 'delete') {
                                    // Trigger delete confirm
                                    modal.confirm({
                                        title: '确认删除?',
                                        content: `确定要删除 "${record.title}" 吗?`,
                                        onOk: async () => {
                                            await deleteReport(record.id);
                                            messageApi.success('删除成功');
                                            actionRef.current?.reload();
                                        }
                                    });
                                }
                            }
                        }}>
                            <a onClick={e => e.preventDefault()}><EllipsisOutlined /></a>
                        </Dropdown>
                    </Space>
                );
            },
        },
    ];

    // Batch Handlers
    const handleBatchDelete = async () => {
        if (!selectedRowKeys.length) return;
        try {
            await batchDelete(selectedRowKeys as string[]);
            messageApi.success(`成功删除 ${selectedRowKeys.length} 条研报`);
            setSelectedRowKeys([]);
            actionRef.current?.reload();
        } catch (error) {
            messageApi.error('批量删除失败');
        }
    };

    const handleBatchExport = async () => {
        try {
            // If items selected, export specific ids. Else export with current query (requires access to form values, or just pass nothing to export all/filtered)
            // ProTable request sends params. Ideally we pass current search params.
            // For simplicity v1: Export selected or Export All (Recent 1000)

            await exportReports({
                ids: selectedRowKeys.length > 0 ? selectedRowKeys as string[] : undefined
                // query: formRef.current?.getFieldsValue() // If we want to support filtered export
            });
            messageApi.success('导出成功');
        } catch (error) {
            messageApi.error('导出失败');
        }
    };

    // Need to use request prop to fetch data
    // But we have useResearchReports hook which returns data directly?
    // ProTable `request` expects return { data, success, total }
    // Our hook useResearchReports usually wraps useQuery.
    // We can wrap our API call in `request`.


    return (
        <PageContainer
            header={{
                title: '研究报告管理',
                breadcrumb: {},
            }}
        >
            {contextHolder}
            {modalContextHolder}
            <ProTable<ResearchReportResponse>
                headerTitle="研报列表"
                actionRef={actionRef}
                rowKey="id"
                search={{
                    labelWidth: 120,
                }}
                toolBarRender={() => [
                    <Button
                        key="export"
                        icon={<ExportOutlined />}
                        onClick={handleBatchExport}
                        loading={isExporting}
                    >
                        导出
                    </Button>,
                    <Dropdown.Button
                        key="create"
                        type="primary"
                        icon={<DownOutlined />}
                        menu={{
                            items: [
                                {
                                    key: 'manual',
                                    label: '手工新建研报',
                                    icon: <FileTextOutlined />,
                                    onClick: () => navigate('/intel/research-reports/create'),
                                },
                            ],
                        }}
                        onClick={() => navigate('/intel/entry')}
                    >
                        智能采集新建
                    </Dropdown.Button>,
                ]}
                rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                }}
                tableAlertOptionRender={() => (
                    <Space size={16}>
                        <a onClick={handleBatchDelete} style={{ color: 'red' }}>
                            批量删除 ({selectedRowKeys.length})
                        </a>
                        <a onClick={() => setSelectedRowKeys([])}>取消选择</a>
                    </Space>
                )}
                request={async (params, sort, filter) => {
                    const { current, pageSize, ...searchParams } = params;

                    // Construct query params
                    const queryParams = new URLSearchParams();
                    queryParams.append('page', String(current || 1));
                    queryParams.append('pageSize', String(pageSize || 20));

                    Object.entries(searchParams).forEach(([key, value]) => {
                        if (value) queryParams.append(key, String(value));
                    });

                    // Handle filters
                    if (filter.reportType) {
                        queryParams.append('reportType', filter.reportType.join(','));
                    }
                    if (filter.reviewStatus) {
                        queryParams.append('reviewStatus', filter.reviewStatus.join(','));
                    }

                    // Add sort
                    // Backend might expect `sortBy` and `sortOrder`
                    // ProTable sort format: { field: "ascend" | "descend" }
                    // Let's assume backend supports `orderBy`

                    try {
                        const res = await apiClient.get<any>(`/market-intel/research-reports?${queryParams.toString()}`);
                        return {
                            data: res.data.data,
                            success: true,
                            total: res.data.total,
                        };
                    } catch (error) {
                        return {
                            data: [],
                            success: false,
                            total: 0,
                        };
                    }
                }}
                columns={columns}
            />
        </PageContainer>
    );
};

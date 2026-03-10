import React, { useState } from 'react';
import { Alert, Button, Col, Input, Modal, Row, Space, Table, Tag, Typography } from 'antd';
import { useUsersPaged, useUsers } from '../../../../users/api/users';
import { OrgDeptTreeSelect } from '../../../../organization/components/OrgDeptTreeSelect';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Text } = Typography;

interface UserPickerProps {
    value?: string[];
    onChange?: (ids: string[]) => void;
}

const UserPicker: React.FC<UserPickerProps> = ({ value = [], onChange }) => {
    const [open, setOpen] = useState(false);
    const [scopeIds, setScopeIds] = useState<string[]>([]);
    const [keyword, setKeyword] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [cache, setCache] = useState(
        new Map<
            string,
            {
                id: string;
                name: string;
                username?: string;
                departmentName?: string | null;
                organizationName?: string | null;
            }
        >(),
    );
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const orgIds = React.useMemo(
        () => scopeIds.filter((id) => id.startsWith('org-')).map((id) => id.slice(4)),
        [scopeIds],
    );
    const deptIds = React.useMemo(
        () => scopeIds.filter((id) => id.startsWith('dept-')).map((id) => id.slice(5)),
        [scopeIds],
    );

    const shouldQuery = Boolean(keyword.trim() || orgIds.length || deptIds.length);
    const { data, isLoading } = useUsersPaged(
        {
            page,
            pageSize,
            status: 'ACTIVE',
            organizationIds: orgIds.length ? orgIds : undefined,
            departmentIds: deptIds.length ? deptIds : undefined,
        },
        { enabled: open && shouldQuery },
    );

    // [FIX] ID回显问题：当组件挂载且有初始值时，请求这些用户的详情
    const { data: initialUsers } = useUsers(
        { ids: value },
        {
            enabled: value.length > 0 && Array.from(value).some((id) => !cache.has(id)),
        },
    );

    // 将初始用户数据写入缓存
    React.useEffect(() => {
        if (!initialUsers?.length) return;
        setCache((prev) => {
            const next = new Map(prev);
            initialUsers.forEach((user) => {
                if (!next.has(user.id)) {
                    next.set(user.id, {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        departmentName: user.department?.name,
                        organizationName: user.organization?.name,
                    });
                }
            });
            return next;
        });
    }, [initialUsers]);

    React.useEffect(() => {
        if (!data?.data?.length) return;
        setCache((prev) => {
            const next = new Map(prev);
            data.data.forEach((user) => {
                next.set(user.id, {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    departmentName: user.department?.name,
                    organizationName: user.organization?.name,
                });
            });
            return next;
        });
    }, [data]);

    const selectedIds = value || [];
    const updateSelected = (ids: string[]) => {
        onChange?.(ids);
    };

    const pageIds = (data?.data || []).map((user) => user.id);
    const handleSelectPage = () => {
        const next = Array.from(new Set([...selectedIds, ...pageIds]));
        updateSelected(next);
    };
    const handleUnselectPage = () => {
        const next = selectedIds.filter((id) => !pageIds.includes(id));
        updateSelected(next);
    };

    const selectedSummary = selectedIds.map((id) => cache.get(id) || { id, name: id });

    const columns = [
        {
            title: '姓名',
            dataIndex: 'name',
            render: (_: string, record: Record<string, any>) => (
                <Space direction="vertical" size={0}>
                    <span>{record.name}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.username}
                    </Text>
                </Space>
            ),
        },
        {
            title: '组织',
            dataIndex: 'organization',
            width: 160,
            render: (_: any, record: Record<string, any>) => record.organization?.name || '--',
        },
        {
            title: '部门',
            dataIndex: 'department',
            width: 160,
            render: (_: any, record: Record<string, any>) => record.department?.name || '--',
        },
    ];

    return (
        <div>
            <Space wrap>
                <Button type="primary" onClick={() => setOpen(true)}>
                    选择人员
                </Button>
                <Text type="secondary">已选 {selectedIds.length} 人</Text>
                {selectedIds.length > 0 && (
                    <Button onClick={() => updateSelected([])} size="small">
                        清空
                    </Button>
                )}
            </Space>
            {selectedIds.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <Space wrap size={[4, 8]}>
                        {selectedSummary.slice(0, 6).map((item) => (
                            <Tag key={item.id}>{item.name}</Tag>
                        ))}
                        {selectedSummary.length > 6 && <Tag>+{selectedSummary.length - 6}</Tag>}
                    </Space>
                </div>
            )}
            <Modal
                title="选择人员"
                open={open}
                onCancel={() => setOpen(false)}
                onOk={() => setOpen(false)}
                width={900}
                destroyOnClose
                {...modalProps}
            >
                <div ref={containerRef}>
                    <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col flex="300px">
                            <OrgDeptTreeSelect
                                mode="both"
                                multiple
                                returnRawValue
                                showUserCount
                                placeholder="按组织/部门筛选"
                                value={scopeIds}
                                onChange={(ids) => {
                                    setScopeIds(ids);
                                    setPage(1);
                                }}
                                style={{ width: '100%' }}
                            />
                        </Col>
                        <Col flex="220px">
                            <Input
                                allowClear
                                placeholder="姓名/账号/手机号/邮箱"
                                value={keyword}
                                onChange={(e) => {
                                    setKeyword(e.target.value);
                                    setPage(1);
                                }}
                                {...autoFocusFieldProps}
                            />
                        </Col>
                        <Col flex="none">
                            <Space>
                                <Button onClick={handleSelectPage} disabled={!pageIds.length}>
                                    全选当前页
                                </Button>
                                <Button onClick={handleUnselectPage} disabled={!pageIds.length}>
                                    取消当前页
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                    {!shouldQuery && (
                        <Alert
                            type="info"
                            showIcon
                            message="请先选择组织/部门或输入关键词后加载人员"
                            style={{ marginBottom: 12 }}
                        />
                    )}
                    <Table
                        rowKey="id"
                        loading={shouldQuery && isLoading}
                        dataSource={shouldQuery ? data?.data || [] : []}
                        columns={columns}
                        pagination={
                            shouldQuery
                                ? {
                                    current: data?.page || page,
                                    pageSize: data?.pageSize || pageSize,
                                    total: data?.total || 0,
                                    showSizeChanger: true,
                                    onChange: (nextPage, nextSize) => {
                                        setPage(nextPage);
                                        setPageSize(nextSize);
                                    },
                                }
                                : false
                        }
                        rowSelection={{
                            selectedRowKeys: selectedIds,
                            preserveSelectedRowKeys: true,
                            onChange: (keys) => updateSelected(keys as string[]),
                        }}
                    />
                </div>
            </Modal>
        </div>
    );
};

export default UserPicker;

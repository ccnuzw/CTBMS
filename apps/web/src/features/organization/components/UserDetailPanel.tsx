import React, { useState, useEffect, useMemo } from 'react';
import {
    Flex,
    Button,
    Avatar,
    Tag,
    theme,
    Spin,
    Empty,
    Descriptions,
    App,
    Popconfirm,
    Input,
    Select,
    DatePicker,
    Divider,
    Modal,
    TreeSelect,
} from 'antd';
import {
    EditOutlined,
    SaveOutlined,
    CloseOutlined,
    UserOutlined,
    MailOutlined,
    PhoneOutlined,
    CheckCircleOutlined,
    SafetyCertificateOutlined,
    SwapOutlined,
    GlobalOutlined,
    ClusterOutlined,
    ShopOutlined,
    HomeOutlined,
    TeamOutlined,
    BankOutlined,
} from '@ant-design/icons';
import { useUser, useUpdateUser, useDeleteUser, UserWithRelations } from '../../users/api/users';
import { useOrganizationTree } from '../api/organizations';
import { useDepartmentTree } from '../api/departments';
import { useDepartments } from '../api/departments';
import { UpdateUserDto, UserStatus, Gender, OrganizationType } from '@packages/types';
import dayjs from 'dayjs';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

interface UserDetailPanelProps {
    userId: string | null;
    onUserDeleted?: () => void;
}

// 用户状态配置
const USER_STATUS_CONFIG: Record<UserStatus, { color: string; label: string }> = {
    ACTIVE: { color: 'success', label: '在职' },
    PROBATION: { color: 'warning', label: '试用期' },
    RESIGNED: { color: 'default', label: '离职' },
    SUSPENDED: { color: 'error', label: '停职' },
};

// 性别选项
const GENDER_OPTIONS = [
    { value: 'MALE', label: '男' },
    { value: 'FEMALE', label: '女' },
    { value: 'OTHER', label: '其他' },
];

// 状态选项
const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: '在职' },
    { value: 'PROBATION', label: '试用期' },
    { value: 'RESIGNED', label: '离职' },
    { value: 'SUSPENDED', label: '停职' },
];

export const UserDetailPanel: React.FC<UserDetailPanelProps> = ({
    userId,
    onUserDeleted,
}) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();

    // 状态
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<Partial<UpdateUserDto>>({});
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [transferOrgId, setTransferOrgId] = useState<string | null>(null);
    const [transferDeptId, setTransferDeptId] = useState<string | null>(null);

    // 获取数据
    const { data: user, isLoading, refetch } = useUser(userId || '', !!userId);
    const { data: orgTree } = useOrganizationTree();
    const { data: deptTree } = useDepartmentTree(transferOrgId || '', !!transferOrgId);
    const { data: allDepartments } = useDepartments(); // 获取所有部门用于显示层级
    const updateMutation = useUpdateUser();
    const deleteMutation = useDeleteUser();

    // 自动聚焦 hook
    const { focusRef, modalProps: transferModalProps } = useModalAutoFocus();

    // 当选中用户变化时，重置编辑状态
    useEffect(() => {
        setIsEditing(false);
        setEditData({});
    }, [userId]);

    // 开始编辑
    const handleStartEdit = () => {
        if (user) {
            setEditData({
                name: user.name,
                gender: user.gender as Gender | undefined,
                phone: user.phone || undefined,
                position: user.position || undefined,
                employeeNo: user.employeeNo || undefined,
                status: user.status as UserStatus,
            });
            setIsEditing(true);
        }
    };

    // 取消编辑
    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditData({});
    };

    // 保存更改
    const handleSave = async () => {
        if (!userId) return;

        try {
            await updateMutation.mutateAsync({ id: userId, data: editData });
            message.success('保存成功');
            setIsEditing(false);
            refetch();
        } catch (error) {
            message.error((error as Error).message || '保存失败');
        }
    };

    // 切换用户状态（停用/启用）
    const handleToggleStatus = async () => {
        if (!userId || !user) return;

        const isSuspended = user.status === 'SUSPENDED';
        const newStatus: UserStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';
        const actionText = isSuspended ? '启用' : '停用';

        try {
            await updateMutation.mutateAsync({
                id: userId,
                data: { status: newStatus },
            });
            message.success(`用户已${actionText}`);
            refetch();
        } catch (error) {
            message.error((error as Error).message || '操作失败');
        }
    };

    // 打开调岗弹窗
    const handleOpenTransfer = () => {
        if (user) {
            setTransferOrgId(user.organizationId || null);
            setTransferDeptId(user.departmentId || null);
            setTransferModalOpen(true);
        }
    };

    // 提交调岗
    const handleTransfer = async () => {
        if (!userId) return;

        try {
            await updateMutation.mutateAsync({
                id: userId,
                data: {
                    organizationId: transferOrgId || undefined,
                    departmentId: transferDeptId || undefined,
                },
            });
            message.success('调岗成功');
            setTransferModalOpen(false);
            refetch();
        } catch (error) {
            message.error((error as Error).message || '调岗失败');
        }
    };

    // 获取组织类型图标
    const getOrgIcon = (type: string) => {
        switch (type as OrganizationType) {
            case 'HEADQUARTERS': return <GlobalOutlined style={{ color: '#f5222d' }} />;
            case 'REGION': return <ClusterOutlined style={{ color: '#fa8c16' }} />;
            case 'BRANCH': return <ShopOutlined style={{ color: '#1890ff' }} />;
            case 'SUBSIDIARY': return <HomeOutlined style={{ color: '#52c41a' }} />;
            default: return <BankOutlined />;
        }
    };

    // 构建组织树选择数据
    const orgTreeData = useMemo(() => {
        if (!orgTree) return [];

        const buildNode = (org: any): any => ({
            value: org.id,
            title: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {getOrgIcon(org.type)}
                    <span>{org.name}</span>
                </span>
            ),
            children: org.children?.map(buildNode),
        });

        return orgTree.map(buildNode);
    }, [orgTree]);

    // 构建部门树选择数据
    const deptTreeData = useMemo(() => {
        if (!deptTree) return [];

        const buildNode = (dept: any): any => ({
            value: dept.id,
            title: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <TeamOutlined style={{ color: '#722ed1' }} />
                    <span>{dept.name}</span>
                </span>
            ),
            children: dept.children?.map(buildNode),
        });

        return deptTree.map(buildNode);
    }, [deptTree]);

    // 构建部门Map用于查找父级
    const deptMap = useMemo(() => {
        if (!allDepartments) return new Map<string, any>();
        return new Map(allDepartments.map(dept => [dept.id, dept]));
    }, [allDepartments]);

    // 获取完整部门路径文本
    const getDeptPathText = (user: UserWithRelations) => {
        if (!user.departmentId) return user.department?.name || '';

        const deptNames: string[] = [];
        let currentDeptId: string | null = user.departmentId;

        while (currentDeptId && deptMap.has(currentDeptId)) {
            const dept = deptMap.get(currentDeptId);
            deptNames.unshift(dept.name);
            currentDeptId = dept.parentId || null;
        }

        if (deptNames.length > 0) return deptNames.join(' - ');
        return user.department?.name || '';
    };

    // 无选中用户
    if (!userId) {
        return (
            <Flex
                justify="center"
                align="center"
                style={{
                    height: '100%',
                    background: token.colorBgContainer,
                }}
            >
                <Empty description="请选择一个用户查看详情" />
            </Flex>
        );
    }

    // 加载中
    if (isLoading) {
        return (
            <Flex
                justify="center"
                align="center"
                style={{
                    height: '100%',
                    background: token.colorBgContainer,
                }}
            >
                <Spin size="large" />
            </Flex>
        );
    }

    // 无数据
    if (!user) {
        return (
            <Flex
                justify="center"
                align="center"
                style={{
                    height: '100%',
                    background: token.colorBgContainer,
                }}
            >
                <Empty description="用户不存在" />
            </Flex>
        );
    }

    const statusConfig = USER_STATUS_CONFIG[user.status as UserStatus] || USER_STATUS_CONFIG.ACTIVE;

    return (
        <Flex
            vertical
            style={{
                height: '100%',
                background: token.colorBgContainer,
                overflow: 'hidden',
            }}
        >
            {/* 顶部工具栏 */}
            <Flex
                justify="space-between"
                align="center"
                style={{
                    padding: '12px 24px',
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgContainer,
                    flexShrink: 0,
                    zIndex: 10,
                }}
            >
                {/* 面包屑 */}
                <Flex gap={4} style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    <span>{user.organization?.name || '未分配'}</span>
                    <span>›</span>
                    <span style={{ color: token.colorText, fontWeight: 500 }}>
                        {getDeptPathText(user) || user.organization?.name || '详情'}
                    </span>
                </Flex>

                {/* 操作按钮 */}
                <Flex gap={8}>
                    {isEditing ? (
                        <>
                            <Button icon={<CloseOutlined />} onClick={handleCancelEdit}>
                                取消
                            </Button>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={updateMutation.isPending}
                                onClick={handleSave}
                            >
                                保存
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button icon={<EditOutlined />} onClick={handleStartEdit}>
                                编辑
                            </Button>
                            <Button icon={<SwapOutlined />} onClick={handleOpenTransfer}>
                                调岗
                            </Button>
                        </>
                    )}
                </Flex>
            </Flex>

            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {/* 用户头部信息 */}
                <Flex gap={20} style={{ padding: '32px 28px 16px' }} align="center">
                    <Avatar
                        size={64}
                        src={user.avatar}
                        icon={<UserOutlined />}
                        style={{
                            backgroundColor: user.avatar ? undefined : token.colorPrimary,
                            flexShrink: 0,
                            boxShadow: `0 2px 8px ${token.colorPrimaryBg}`,
                        }}
                    >
                        {!user.avatar && user.name?.slice(0, 2)}
                    </Avatar>

                    <Flex vertical justify="center" style={{ minWidth: 0 }}>
                        <h2
                            style={{
                                margin: 0,
                                fontSize: 24,
                                fontWeight: 700,
                                color: token.colorText,
                            }}
                        >
                            {user.name}
                        </h2>
                        <Flex gap={8} style={{ marginTop: 8 }} align="center">
                            <span style={{ fontSize: 14, color: token.colorTextSecondary }}>
                                {user.position || '未设置职位'}
                            </span>
                            <Tag
                                icon={<CheckCircleOutlined />}
                                color={statusConfig.color}
                                style={{ margin: 0 }}
                                bordered={false}
                            >
                                {statusConfig.label}
                            </Tag>
                        </Flex>
                    </Flex>
                </Flex>

                <Divider style={{ margin: '12px 24px' }} />

                {/* 详细信息 */}
                <div style={{ padding: '0 24px 24px' }}>
                    {/* 个人信息 (合并基本与联系) */}
                    <SectionTitle>个人信息</SectionTitle>
                    <InfoGrid>
                        <InfoItem
                            label="姓名"
                            value={user.name}
                            isEditing={isEditing}
                            editValue={editData.name}
                            onChange={(v) => setEditData((prev) => ({ ...prev, name: v }))}
                        />
                        <InfoItem
                            label="工号"
                            value={user.employeeNo}
                            isEditing={isEditing}
                            editValue={editData.employeeNo ?? undefined}
                            onChange={(v) => setEditData((prev) => ({ ...prev, employeeNo: v }))}
                        />
                        <InfoItem
                            label="性别"
                            value={GENDER_OPTIONS.find((o) => o.value === user.gender)?.label}
                            isEditing={isEditing}
                            editValue={editData.gender ?? undefined}
                            type="select"
                            options={GENDER_OPTIONS}
                            onChange={(v) => setEditData((prev) => ({ ...prev, gender: v as Gender }))}
                        />
                        <InfoItem
                            label="职位"
                            value={user.position}
                            isEditing={isEditing}
                            editValue={editData.position ?? undefined}
                            onChange={(v) => setEditData((prev) => ({ ...prev, position: v }))}
                        />
                        <InfoItem
                            label="电话号码"
                            value={user.phone}
                            isEditing={isEditing}
                            editValue={editData.phone ?? undefined}
                            onChange={(v) => setEditData((prev) => ({ ...prev, phone: v }))}
                            icon={<PhoneOutlined />}
                        />
                        <InfoItem
                            label="邮箱地址"
                            value={user.email}
                            icon={<MailOutlined />}
                        />
                    </InfoGrid>

                    {/* 系统信息 */}
                    <SectionTitle>系统信息</SectionTitle>
                    <InfoGrid>
                        <InfoItem
                            label="用户角色"
                            value={user.roles?.map((r) => r.role.name).join(', ') || '无'}
                        />
                        <InfoItem
                            label="账号状态"
                            value={statusConfig.label}
                            isEditing={isEditing}
                            editValue={editData.status}
                            type="select"
                            options={STATUS_OPTIONS}
                            onChange={(v) => setEditData((prev) => ({ ...prev, status: v as UserStatus }))}
                        />
                        <InfoItem
                            label="入职日期"
                            value={user.hireDate ? dayjs(user.hireDate).format('YYYY-MM-DD') : '未设置'}
                        />
                        <InfoItem
                            label="最后更新"
                            value={user.updatedAt ? dayjs(user.updatedAt).format('YYYY-MM-DD HH:mm') : '-'}
                        />
                    </InfoGrid>

                    {/* 底部操作 */}
                    <Divider style={{ margin: '24px 0 16px' }} />
                    <Flex justify="flex-end" gap={12}>
                        <Popconfirm
                            title={`确定要${user.status === 'SUSPENDED' ? '启用' : '停用'}该用户吗？`}
                            description={user.status === 'SUSPENDED' ? '启用后用户将恢复正常权限' : '停用后用户将无法登录系统'}
                            onConfirm={handleToggleStatus}
                            okText="确定"
                            cancelText="取消"
                        >
                            <Button
                                danger={user.status !== 'SUSPENDED'}
                                type={user.status === 'SUSPENDED' ? 'primary' : 'default'}
                            >
                                {user.status === 'SUSPENDED' ? '启用用户' : '停用用户'}
                            </Button>
                        </Popconfirm>
                    </Flex>
                </div>
            </div>

            {/* 调岗弹窗 */}
            <Modal
                title={`调岗 - ${user?.name}`}
                open={transferModalOpen}
                onCancel={() => setTransferModalOpen(false)}
                onOk={handleTransfer}
                okText="确认调岗"
                cancelText="取消"
                confirmLoading={updateMutation.isPending}
                {...transferModalProps}
            >
                <div style={{ marginBottom: 16 }}>
                    <div style={{
                        padding: '8px 12px',
                        background: token.colorInfoBg,
                        borderRadius: 6,
                        marginBottom: 16,
                        fontSize: 13
                    }}>
                        ℹ️ 当前: <strong>{user?.organization?.name || '未分配'}</strong>
                        {user?.departmentId && ` / ${getDeptPathText(user)}`}
                    </div>
                </div>
                <Flex vertical gap={16}>
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>选择新公司</div>
                        <TreeSelect
                            ref={focusRef}
                            style={{ width: '100%' }}
                            placeholder="请选择公司"
                            value={transferOrgId}
                            onChange={(value) => {
                                setTransferOrgId(value);
                                setTransferDeptId(null); // 清空部门选择
                            }}
                            allowClear
                            showSearch
                            treeNodeFilterProp="name"
                            treeData={orgTreeData}
                            treeDefaultExpandAll
                        />
                    </div>
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>选择新部门</div>
                        <TreeSelect
                            style={{ width: '100%' }}
                            placeholder={transferOrgId ? "请选择部门（可选）" : "请先选择公司"}
                            value={transferDeptId}
                            onChange={setTransferDeptId}
                            disabled={!transferOrgId}
                            allowClear
                            showSearch
                            treeNodeFilterProp="name"
                            treeData={deptTreeData}
                            treeDefaultExpandAll
                        />
                    </div>
                </Flex>
            </Modal>
        </Flex>
    );
};

// 分区标题
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token } = theme.useToken();
    return (
        <h3
            style={{
                fontSize: 14,
                fontWeight: 600,
                color: token.colorText,
                marginTop: 24,
                marginBottom: 12,
                paddingLeft: 10,
                borderLeft: `3px solid ${token.colorPrimary}`,
            }}
        >
            {children}
        </h3>
    );
};

// 信息网格
const InfoGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
        style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '8px 24px',
        }}
    >
        {children}
    </div>
);

// 信息项
interface InfoItemProps {
    label: string;
    value?: string | null;
    icon?: React.ReactNode;
    isEditing?: boolean;
    editValue?: string;
    type?: 'text' | 'select';
    options?: { value: string; label: string }[];
    onChange?: (value: string) => void;
}

const InfoItem: React.FC<InfoItemProps> = ({
    label,
    value,
    icon,
    isEditing,
    editValue,
    type = 'text',
    options,
    onChange,
}) => {
    const { token } = theme.useToken();

    return (
        <div style={{ padding: '6px 0', borderBottom: `1px solid ${token.colorSplit}` }}>
            <div
                style={{
                    fontSize: 12,
                    color: token.colorTextSecondary,
                    marginBottom: 4,
                }}
            >
                {label}
            </div>

            {isEditing && onChange ? (
                type === 'select' && options ? (
                    <Select
                        value={editValue}
                        onChange={onChange}
                        options={options}
                        style={{ width: '100%' }}
                        size="large"
                    />
                ) : (
                    <Input
                        value={editValue}
                        onChange={(e) => onChange(e.target.value)}
                        size="large"
                    />
                )
            ) : (
                <div style={{
                    fontSize: 14,
                    color: token.colorText,
                    fontWeight: 500,
                    minHeight: 24,
                    display: 'flex',
                    alignItems: 'center',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                }}>
                    {icon && <span style={{ marginRight: 8, color: token.colorTextTertiary, flexShrink: 0 }}>{icon}</span>}
                    {value || <span style={{ color: token.colorTextQuaternary }}>-</span>}
                </div>
            )}
        </div>
    );
};

export default UserDetailPanel;

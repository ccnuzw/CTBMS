import React, { useMemo } from 'react';
import {
    ModalForm,
    ProFormText,
    ProFormSelect,
    ProFormDatePicker,
} from '@ant-design/pro-components';
import { App, theme, Row, Col, Divider, Typography } from 'antd';
import {
    UserOutlined,
    MailOutlined,
    PhoneOutlined,
    IdcardOutlined,
    CalendarOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { CreateUserDto, UpdateUserDto } from '@packages/types';
import { useCreateUser, useUpdateUser, UserWithRelations } from '../api/users';
import { useRoles } from '../api/roles';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';
import { useDictionary } from '@/hooks/useDictionaries';

const { Text } = Typography;

// ==================== 常量导出 ====================

/** 性别选项 */
export const GENDER_OPTIONS = [
    { value: 'MALE', label: '男' },
    { value: 'FEMALE', label: '女' },
    { value: 'OTHER', label: '其他' },
] as const;

/** 用户状态选项 */
export const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: '在职' },
    { value: 'PROBATION', label: '试用期' },
    { value: 'RESIGNED', label: '离职' },
    { value: 'SUSPENDED', label: '停职' },
] as const;

/** 用户状态配置 (用于显示) */
export const USER_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    ACTIVE: { color: 'success', label: '在职' },
    PROBATION: { color: 'warning', label: '试用期' },
    RESIGNED: { color: 'default', label: '离职' },
    SUSPENDED: { color: 'error', label: '停职' },
};

// ==================== 组件类型 ====================

export interface UserFormModalProps {
    /** 是否显示弹窗 */
    open: boolean;
    /** 显示状态变更回调 */
    onOpenChange: (open: boolean) => void;
    /** 编辑的用户数据 (新建时为 undefined) */
    user?: UserWithRelations;
    /** 提交成功回调 */
    onSuccess?: () => void;
    /** 预设的组织ID (组织管理场景) */
    organizationId?: string;
    /** 预设的部门ID (组织管理场景) */
    departmentId?: string;
    /** 自定义标题 */
    title?: string;
    /** 提示信息 (例如"新用户将被添加到: XXX") */
    hint?: React.ReactNode;
}

// ==================== 分区标题组件 ====================

interface SectionHeaderProps {
    icon: React.ReactNode;
    title: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title }) => {
    const { token } = theme.useToken();
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
                paddingBottom: 8,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            <span style={{ color: token.colorPrimary, fontSize: 16 }}>{icon}</span>
            <Text strong style={{ fontSize: 14, color: token.colorText }}>
                {title}
            </Text>
        </div>
    );
};

// ==================== 组件实现 ====================

/**
 * 统一的用户表单弹窗组件
 * 用于用户管理和组织管理中的用户创建/编辑
 */
export const UserFormModal: React.FC<UserFormModalProps> = ({
    open,
    onOpenChange,
    user,
    onSuccess,
    organizationId,
    departmentId,
    title,
    hint,
}) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const { data: genderDict } = useDictionary('GENDER');
    const { data: userStatusDict } = useDictionary('USER_STATUS');

    const genderOptions = useMemo(() => {
        const items = (genderDict || []).filter((item) => item.isActive);
        if (!items.length) return [...GENDER_OPTIONS];
        return items.map((item) => ({ value: item.code, label: item.label }));
    }, [genderDict]);

    const statusOptions = useMemo(() => {
        const items = (userStatusDict || []).filter((item) => item.isActive);
        if (!items.length) return [...STATUS_OPTIONS];
        return items.map((item) => ({ value: item.code, label: item.label }));
    }, [userStatusDict]);

    const isEdit = !!user;
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    // 获取角色列表
    const { data: roles } = useRoles();
    const createUserMutation = useCreateUser();
    const updateUserMutation = useUpdateUser();

    // 角色选项
    const roleOptions = useMemo(() => {
        return roles?.map((r) => ({ label: r.name, value: r.id })) || [];
    }, [roles]);

    // 初始值
    const initialValues = useMemo(() => {
        if (user) {
            return {
                ...user,
                birthday: user.birthday ? dayjs(user.birthday) : undefined,
                hireDate: user.hireDate ? dayjs(user.hireDate) : undefined,
                roleIds: user.roles?.map((r) => r.role.id) || [],
            };
        }
        return { status: 'ACTIVE' };
    }, [user]);

    // 表单提交
    const handleFinish = async (values: CreateUserDto | UpdateUserDto) => {
        try {
            if (isEdit && user) {
                await updateUserMutation.mutateAsync({
                    id: user.id,
                    data: values as UpdateUserDto,
                });
                message.success('用户更新成功');
            } else {
                // 新建时附加组织/部门信息
                const createData: CreateUserDto = {
                    ...(values as CreateUserDto),
                    organizationId: organizationId || undefined,
                    departmentId: departmentId || undefined,
                };
                await createUserMutation.mutateAsync(createData);
                message.success('用户创建成功');
            }
            onOpenChange(false);
            onSuccess?.();
            return true;
        } catch (error) {
            message.error((error as Error).message || '操作失败');
            return false;
        }
    };

    // 动态标题
    const modalTitle = title || (isEdit ? '编辑用户' : '新建用户');

    return (
        <ModalForm<CreateUserDto>
            title={modalTitle}
            open={open}
            onOpenChange={onOpenChange}
            onFinish={handleFinish}
            initialValues={initialValues}
            grid
            rowProps={{ gutter: [16, 0] }}
            modalProps={{
                destroyOnClose: true,
                focusTriggerAfterClose: false,
                ...modalProps,
            }}
            width={680}
            layout="vertical"
        >
            <div ref={containerRef} style={{ display: 'contents' }}>
                {/* 提示信息 */}
                {hint && (
                    <Col span={24}>
                        <div
                            style={{
                                padding: '12px 16px',
                                background: `linear-gradient(135deg, ${token.colorInfoBg} 0%, ${token.colorBgElevated} 100%)`,
                                borderRadius: token.borderRadiusLG,
                                marginBottom: 20,
                                fontSize: 13,
                                border: `1px solid ${token.colorInfoBorder}`,
                            }}
                        >
                            {hint}
                        </div>
                    </Col>
                )}

                {/* ===== 账号信息 ===== */}
                <Col span={24}>
                    <SectionHeader icon={<UserOutlined />} title="账号信息" />
                </Col>

                <ProFormText
                    name="username"
                    label="用户名"
                    placeholder="用于系统登录"
                    rules={[
                        { required: true, message: '请输入用户名' },
                        { pattern: /^[a-zA-Z0-9_]+$/, message: '仅支持字母、数字和下划线' },
                    ]}
                    disabled={isEdit}
                    colProps={{ xs: 24, sm: 12 }}
                    fieldProps={{
                        prefix: <UserOutlined style={{ color: token.colorTextQuaternary }} />,
                        ...(isEdit ? {} : autoFocusFieldProps),
                    }}
                />
                <ProFormText
                    name="name"
                    label="姓名"
                    placeholder="请输入真实姓名"
                    rules={[{ required: true, message: '请输入姓名' }]}
                    colProps={{ xs: 24, sm: 12 }}
                    fieldProps={isEdit ? autoFocusFieldProps : undefined}
                />
                <ProFormText
                    name="email"
                    label="邮箱"
                    placeholder="user@example.com"
                    rules={[
                        { required: true, message: '请输入邮箱' },
                        { type: 'email', message: '邮箱格式不正确' },
                    ]}
                    disabled={isEdit}
                    colProps={{ xs: 24, sm: 12 }}
                    fieldProps={{
                        prefix: <MailOutlined style={{ color: token.colorTextQuaternary }} />,
                    }}
                />
                <ProFormText
                    name="phone"
                    label="电话"
                    placeholder="请输入手机号码"
                    colProps={{ xs: 24, sm: 12 }}
                    fieldProps={{
                        prefix: <PhoneOutlined style={{ color: token.colorTextQuaternary }} />,
                    }}
                />

                <Col span={24}>
                    <Divider style={{ margin: '8px 0 20px' }} />
                </Col>

                {/* ===== 个人信息 ===== */}
                <Col span={24}>
                    <SectionHeader icon={<IdcardOutlined />} title="个人信息" />
                </Col>

                <ProFormSelect
                    name="gender"
                    label="性别"
                    options={genderOptions}
                    colProps={{ xs: 24, sm: 8 }}
                    fieldProps={{ allowClear: true }}
                />
                <ProFormDatePicker
                    name="birthday"
                    label="生日"
                    colProps={{ xs: 24, sm: 8 }}
                    fieldProps={{ style: { width: '100%' } }}
                />
                <ProFormText
                    name="employeeNo"
                    label="工号"
                    placeholder="如: EMP-001"
                    colProps={{ xs: 24, sm: 8 }}
                />

                <Col span={24}>
                    <Divider style={{ margin: '8px 0 20px' }} />
                </Col>

                {/* ===== 职位信息 ===== */}
                <Col span={24}>
                    <SectionHeader icon={<CalendarOutlined />} title="职位信息" />
                </Col>

                <ProFormText
                    name="position"
                    label="职位"
                    placeholder="如: 高级开发工程师"
                    colProps={{ xs: 24, sm: 8 }}
                />
                <ProFormDatePicker
                    name="hireDate"
                    label="入职日期"
                    colProps={{ xs: 24, sm: 8 }}
                    fieldProps={{ style: { width: '100%' } }}
                />
                <ProFormSelect
                    name="status"
                    label="状态"
                    options={
                        isEdit
                            ? statusOptions
                            : statusOptions.filter((opt) => opt.value === 'ACTIVE' || opt.value === 'PROBATION')
                    }
                    colProps={{ xs: 24, sm: 8 }}
                />

                <Col span={24}>
                    <Divider style={{ margin: '8px 0 20px' }} />
                </Col>

                {/* ===== 权限设置 ===== */}
                <Col span={24}>
                    <SectionHeader icon={<SafetyCertificateOutlined />} title="权限设置" />
                </Col>

                <ProFormSelect
                    name="roleIds"
                    label="分配角色"
                    mode="multiple"
                    options={roleOptions}
                    placeholder="选择角色（可多选）"
                    colProps={{ span: 24 }}
                    fieldProps={{
                        maxTagCount: 'responsive',
                    }}
                />
            </div>
        </ModalForm>
    );
};

export default UserFormModal;

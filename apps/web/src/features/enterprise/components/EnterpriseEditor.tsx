import React, { useEffect } from 'react';
import {
    Drawer,
    Form,
    Input,
    Select,
    InputNumber,
    Button,
    Space,
    Divider,
    Spin,
    theme,
    App,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    EnterpriseType,
    ContactRole,
    CreateEnterpriseDto,
    UpdateEnterpriseDto,
} from '@packages/types';
import {
    useEnterprise,
    useCreateEnterprise,
    useUpdateEnterprise,
    useEnterprises,
} from '../api';

const { TextArea } = Input;
const { useToken } = theme;

// 企业类型选项
const ENTERPRISE_TYPE_OPTIONS = [
    { label: '供应商', value: EnterpriseType.SUPPLIER },
    { label: '客户', value: EnterpriseType.CUSTOMER },
    { label: '物流商', value: EnterpriseType.LOGISTICS },
    { label: '集团', value: EnterpriseType.GROUP },
];

// 联系人角色选项
const CONTACT_ROLE_OPTIONS = [
    { label: '采购决策线', value: ContactRole.PROCUREMENT },
    { label: '执行运营线', value: ContactRole.EXECUTION },
    { label: '财务结算线', value: ContactRole.FINANCE },
    { label: '高层管理线', value: ContactRole.MANAGEMENT },
];

interface EnterpriseEditorProps {
    open: boolean;
    enterpriseId: string | null;
    onClose: () => void;
}

export const EnterpriseEditor: React.FC<EnterpriseEditorProps> = ({
    open,
    enterpriseId,
    onClose,
}) => {
    const { token } = useToken();
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const isEdit = !!enterpriseId;

    // 获取企业详情（编辑模式）
    const { data: enterprise, isLoading: loadingEnterprise } = useEnterprise(
        enterpriseId,
        isEdit && open
    );

    // 获取可选的父级企业（集团）
    const { data: parentOptions } = useEnterprises({ type: EnterpriseType.GROUP, pageSize: 100 });

    // Mutations
    const createMutation = useCreateEnterprise();
    const updateMutation = useUpdateEnterprise();

    // 填充表单数据（编辑模式）
    useEffect(() => {
        if (isEdit && enterprise) {
            form.setFieldsValue({
                name: enterprise.name,
                shortName: enterprise.shortName,
                taxId: enterprise.taxId,
                types: enterprise.types,
                parentId: enterprise.parentId,
                province: enterprise.province,
                city: enterprise.city,
                address: enterprise.address,
                longitude: enterprise.longitude,
                latitude: enterprise.latitude,
                description: enterprise.description,
                riskScore: enterprise.riskScore,
                contacts: enterprise.contacts?.map((c) => ({
                    name: c.name,
                    title: c.title,
                    role: c.role,
                    phone: c.phone,
                    email: c.email,
                    notes: c.notes,
                })),
                bankAccounts: enterprise.bankAccounts?.map((b) => ({
                    bankName: b.bankName,
                    accountNumber: b.accountNumber,
                    accountName: b.accountName,
                    branch: b.branch,
                    isDefault: b.isDefault,
                    isWhitelisted: b.isWhitelisted,
                })),
            });
        } else if (!isEdit && open) {
            form.resetFields();
        }
    }, [enterprise, isEdit, open, form]);

    // 提交表单
    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            if (isEdit && enterpriseId) {
                await updateMutation.mutateAsync({
                    id: enterpriseId,
                    data: values as UpdateEnterpriseDto,
                });
                message.success('企业信息已更新');
            } else {
                await createMutation.mutateAsync(values as CreateEnterpriseDto);
                message.success('企业已创建');
            }

            onClose();
        } catch (error) {
            // 表单验证失败或 API 错误
            if (error instanceof Error) {
                message.error(error.message);
            }
        }
    };

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    // 只在编辑模式且正在加载时显示 loading
    const showLoading = isEdit && loadingEnterprise;

    return (
        <Drawer
            title={isEdit ? '编辑客商信息' : '新增客商'}
            open={open}
            onClose={onClose}
            width={640}
            destroyOnClose
            extra={
                <Space>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={handleSubmit} loading={isSubmitting}>
                        {isEdit ? '保存' : '创建'}
                    </Button>
                </Space>
            }
        >
            {showLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                    <Spin size="large" />
                </div>
            ) : (
                <Form form={form} layout="vertical" initialValues={{ riskScore: 80, types: [] }}>
                    {/* 基本信息 */}
                    <Divider orientation="left">基本信息</Divider>

                    <Form.Item
                        name="name"
                        label="企业全称"
                        rules={[{ required: true, message: '请输入企业全称' }]}
                    >
                        <Input placeholder="请输入企业全称" />
                    </Form.Item>

                    <Form.Item name="shortName" label="简称">
                        <Input placeholder="请输入简称（可选）" />
                    </Form.Item>

                    <Form.Item
                        name="taxId"
                        label="统一社会信用代码"
                        rules={[
                            { required: true, message: '请输入税号' },
                            { len: 18, message: '税号应为18位' },
                        ]}
                    >
                        <Input placeholder="请输入18位统一社会信用代码" disabled={isEdit} />
                    </Form.Item>

                    <Form.Item
                        name="types"
                        label="业务身份"
                        rules={[{ required: true, message: '请选择至少一种业务身份' }]}
                    >
                        <Select
                            mode="multiple"
                            placeholder="请选择业务身份（可多选）"
                            options={ENTERPRISE_TYPE_OPTIONS}
                        />
                    </Form.Item>

                    <Form.Item name="parentId" label="所属集团">
                        <Select
                            placeholder="请选择所属集团（可选）"
                            allowClear
                            options={
                                parentOptions?.data
                                    ?.filter((e) => e.id !== enterpriseId)
                                    .map((e) => ({
                                        label: e.name,
                                        value: e.id,
                                    })) ?? []
                            }
                        />
                    </Form.Item>

                    <Form.Item name="riskScore" label="信用评分">
                        <InputNumber min={0} max={100} style={{ width: '100%' }} />
                    </Form.Item>

                    {/* 地址信息 */}
                    <Divider orientation="left">地址信息</Divider>

                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="province" style={{ width: '33%' }}>
                            <Input placeholder="省份" />
                        </Form.Item>
                        <Form.Item name="city" style={{ width: '33%' }}>
                            <Input placeholder="城市" />
                        </Form.Item>
                        <Form.Item name="address" style={{ width: '34%' }}>
                            <Input placeholder="详细地址" />
                        </Form.Item>
                    </Space.Compact>

                    <Space style={{ width: '100%' }}>
                        <Form.Item name="longitude" label="经度" style={{ marginBottom: token.marginSM }}>
                            <InputNumber
                                min={-180}
                                max={180}
                                step={0.000001}
                                placeholder="如: 104.065735"
                                style={{ width: 160 }}
                            />
                        </Form.Item>
                        <Form.Item name="latitude" label="纬度" style={{ marginBottom: token.marginSM }}>
                            <InputNumber
                                min={-90}
                                max={90}
                                step={0.000001}
                                placeholder="如: 30.657441"
                                style={{ width: 160 }}
                            />
                        </Form.Item>
                    </Space>

                    <Form.Item name="description" label="企业描述">
                        <TextArea rows={3} placeholder="请输入企业描述（可选）" />
                    </Form.Item>

                    {/* 联系人列表 */}
                    <Divider orientation="left">联系人</Divider>

                    <Form.List name="contacts">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <div
                                        key={key}
                                        style={{
                                            background: token.colorBgLayout,
                                            padding: token.paddingSM,
                                            borderRadius: token.borderRadius,
                                            marginBottom: token.marginSM,
                                        }}
                                    >
                                        <Space align="baseline" style={{ width: '100%', justifyContent: 'space-between' }}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'name']}
                                                rules={[{ required: true, message: '请输入姓名' }]}
                                                style={{ marginBottom: token.marginXS }}
                                            >
                                                <Input placeholder="姓名" style={{ width: 100 }} />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'role']}
                                                rules={[{ required: true, message: '请选择角色' }]}
                                                style={{ marginBottom: token.marginXS }}
                                            >
                                                <Select
                                                    placeholder="角色"
                                                    options={CONTACT_ROLE_OPTIONS}
                                                    style={{ width: 120 }}
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'phone']}
                                                rules={[{ required: true, message: '请输入电话' }]}
                                                style={{ marginBottom: token.marginXS }}
                                            >
                                                <Input placeholder="电话" style={{ width: 130 }} />
                                            </Form.Item>

                                            <Button
                                                type="text"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() => remove(name)}
                                            />
                                        </Space>

                                        <Space>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'title']}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="职位" style={{ width: 100 }} />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'email']}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="邮箱" style={{ width: 160 }} />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'notes']}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="备注标签" style={{ width: 100 }} />
                                            </Form.Item>
                                        </Space>
                                    </div>
                                ))}

                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                    添加联系人
                                </Button>
                            </>
                        )}
                    </Form.List>

                    {/* 银行账户列表 */}
                    <Divider orientation="left" style={{ marginTop: token.marginLG }}>
                        银行账户
                    </Divider>

                    <Form.List name="bankAccounts">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <div
                                        key={key}
                                        style={{
                                            background: token.colorBgLayout,
                                            padding: token.paddingSM,
                                            borderRadius: token.borderRadius,
                                            marginBottom: token.marginSM,
                                        }}
                                    >
                                        <Space align="baseline" style={{ width: '100%', justifyContent: 'space-between' }}>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'bankName']}
                                                rules={[{ required: true, message: '请输入开户行' }]}
                                                style={{ marginBottom: token.marginXS }}
                                            >
                                                <Input placeholder="开户行" style={{ width: 150 }} />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'accountName']}
                                                rules={[{ required: true, message: '请输入户名' }]}
                                                style={{ marginBottom: token.marginXS }}
                                            >
                                                <Input placeholder="户名" style={{ width: 150 }} />
                                            </Form.Item>

                                            <Button
                                                type="text"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={() => remove(name)}
                                            />
                                        </Space>

                                        <Form.Item
                                            {...restField}
                                            name={[name, 'accountNumber']}
                                            rules={[{ required: true, message: '请输入账号' }]}
                                            style={{ marginBottom: token.marginXS }}
                                        >
                                            <Input placeholder="银行账号" />
                                        </Form.Item>

                                        <Space>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'branch']}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Input placeholder="支行（可选）" style={{ width: 150 }} />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'isDefault']}
                                                valuePropName="checked"
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Select
                                                    placeholder="默认账户"
                                                    options={[
                                                        { label: '默认', value: true },
                                                        { label: '非默认', value: false },
                                                    ]}
                                                    style={{ width: 100 }}
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                {...restField}
                                                name={[name, 'isWhitelisted']}
                                                valuePropName="checked"
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Select
                                                    placeholder="白名单"
                                                    options={[
                                                        { label: '已验证', value: true },
                                                        { label: '未验证', value: false },
                                                    ]}
                                                    style={{ width: 100 }}
                                                />
                                            </Form.Item>
                                        </Space>
                                    </div>
                                ))}

                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                    添加银行账户
                                </Button>
                            </>
                        )}
                    </Form.List>
                </Form>
            )}
        </Drawer>
    );
};

export default EnterpriseEditor;

import React, { useEffect, useState, useMemo } from 'react';
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
    Tag,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
    EnterpriseType,
    ContactRole,
    CreateEnterpriseDto,
    UpdateEnterpriseDto,
    TagScope,
    TaggableEntityType,
    TagResponse,
} from '@packages/types';
import {
    useEnterprise,
    useCreateEnterprise,
    useUpdateEnterprise,
    useEnterprises,
} from '../api';
import { useGlobalTags, useSyncTags } from '../../tags/api/tags';
import { useDictionaries } from '@/hooks/useDictionaries';

const { TextArea } = Input;
const { useToken } = theme;

// 企业类型选项
const ENTERPRISE_TYPE_OPTIONS_FALLBACK = [
    { label: '供应商', value: EnterpriseType.SUPPLIER },
    { label: '客户', value: EnterpriseType.CUSTOMER },
    { label: '物流商', value: EnterpriseType.LOGISTICS },
    { label: '集团', value: EnterpriseType.GROUP },
];

// 联系人角色选项
const CONTACT_ROLE_OPTIONS_FALLBACK = [
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
    const { data: dictionaries } = useDictionaries(['ENTERPRISE_TYPE', 'CONTACT_ROLE']);

    const enterpriseTypeOptions = useMemo(() => {
        const items = dictionaries?.ENTERPRISE_TYPE?.filter((item) => item.isActive) || [];
        if (!items.length) return ENTERPRISE_TYPE_OPTIONS_FALLBACK;
        return items.map((item) => ({ label: item.label, value: item.code as EnterpriseType }));
    }, [dictionaries]);

    const contactRoleOptions = useMemo(() => {
        const items = dictionaries?.CONTACT_ROLE?.filter((item) => item.isActive) || [];
        if (!items.length) return CONTACT_ROLE_OPTIONS_FALLBACK;
        return items.map((item) => ({ label: item.label, value: item.code as ContactRole }));
    }, [dictionaries]);

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
    const syncTagsMutation = useSyncTags();

    // 标签相关
    const [selectedTypes, setSelectedTypes] = useState<EnterpriseType[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

    // 根据业务身份类型获取对应的标签作用域
    const tagScopes = useMemo(() => {
        const scopes: TagScope[] = [];
        if (selectedTypes.includes(EnterpriseType.CUSTOMER)) scopes.push(TagScope.CUSTOMER);
        if (selectedTypes.includes(EnterpriseType.SUPPLIER)) scopes.push(TagScope.SUPPLIER);
        if (selectedTypes.includes(EnterpriseType.LOGISTICS)) scopes.push(TagScope.LOGISTICS);
        return scopes;
    }, [selectedTypes]);

    // 获取所有可能的标签（合并多个作用域）
    const { data: customerTags } = useGlobalTags({ scope: TagScope.CUSTOMER });
    const { data: supplierTags } = useGlobalTags({ scope: TagScope.SUPPLIER });
    const { data: logisticsTags } = useGlobalTags({ scope: TagScope.LOGISTICS });
    const { data: globalTags } = useGlobalTags({ scope: TagScope.GLOBAL });

    // 合并可用标签
    const availableTags = useMemo(() => {
        const tags: TagResponse[] = [...(globalTags || [])];
        if (selectedTypes.includes(EnterpriseType.CUSTOMER)) tags.push(...(customerTags || []));
        if (selectedTypes.includes(EnterpriseType.SUPPLIER)) tags.push(...(supplierTags || []));
        if (selectedTypes.includes(EnterpriseType.LOGISTICS)) tags.push(...(logisticsTags || []));
        // 去重
        const uniqueTags = tags.filter((tag, index, self) =>
            self.findIndex(t => t.id === tag.id) === index
        );
        return uniqueTags;
    }, [selectedTypes, customerTags, supplierTags, logisticsTags, globalTags]);

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
            setSelectedTypes(enterprise.types || []);
            // 设置已选标签
            if ((enterprise as any).tags) {
                setSelectedTagIds((enterprise as any).tags.map((t: any) => t.id));
            }
        } else if (!isEdit && open) {
            form.resetFields();
            setSelectedTypes([]);
            setSelectedTagIds([]);
        }
    }, [enterprise, isEdit, open, form]);

    // 提交表单
    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            let savedEnterpriseId = enterpriseId || '';

            if (isEdit && enterpriseId) {
                await updateMutation.mutateAsync({
                    id: enterpriseId,
                    data: values as UpdateEnterpriseDto,
                });
                message.success('企业信息已更新');
            } else {
                const result = await createMutation.mutateAsync(values as CreateEnterpriseDto);
                savedEnterpriseId = result.id;
                message.success('企业已创建');
            }

            // 保存标签关联（编辑模式始终同步，新建模式有选择才同步）
            if (savedEnterpriseId && (isEdit || selectedTagIds.length > 0)) {
                // 根据企业类型确定 entityType
                const types = values.types as EnterpriseType[];
                // 优先使用第一个非 GROUP 的类型作为 entityType
                let entityType: TaggableEntityType = TaggableEntityType.CUSTOMER;
                if (types.includes(EnterpriseType.CUSTOMER)) {
                    entityType = TaggableEntityType.CUSTOMER;
                } else if (types.includes(EnterpriseType.SUPPLIER)) {
                    entityType = TaggableEntityType.SUPPLIER;
                } else if (types.includes(EnterpriseType.LOGISTICS)) {
                    entityType = TaggableEntityType.LOGISTICS;
                }

                await syncTagsMutation.mutateAsync({
                    entityType,
                    entityId: savedEnterpriseId,
                    tagIds: selectedTagIds,
                });
            }

            onClose();
        } catch (error) {
            // 表单验证失败或 API 错误
            if (error instanceof Error) {
                message.error(error.message);
            }
        }
    };

    const isSubmitting = createMutation.isPending || updateMutation.isPending || syncTagsMutation.isPending;

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
                            options={enterpriseTypeOptions}
                            onChange={(values) => setSelectedTypes(values)}
                        />
                    </Form.Item>

                    {/* 业务标签 - 仅在选择业务身份后显示 */}
                    {selectedTypes.length > 0 && selectedTypes.some(t => t !== EnterpriseType.GROUP) && (
                        <Form.Item label="业务标签">
                            <Select
                                mode="multiple"
                                placeholder="选择标签（可选）"
                                value={selectedTagIds}
                                onChange={setSelectedTagIds}
                                optionLabelProp="label"
                                tagRender={(props) => {
                                    const tag = availableTags.find(t => t.id === props.value);
                                    return (
                                        <Tag
                                            closable={props.closable}
                                            onClose={props.onClose}
                                            color={tag?.color || 'default'}
                                            style={{ marginRight: 3 }}
                                        >
                                            {props.label}
                                        </Tag>
                                    );
                                }}
                            >
                                {availableTags.map((tag) => (
                                    <Select.Option key={tag.id} value={tag.id} label={tag.name}>
                                        <Space>
                                            <Tag color={tag.color || 'default'}>{tag.name}</Tag>
                                            {tag.description && (
                                                <span style={{ color: '#999', fontSize: 12 }}>{tag.description}</span>
                                            )}
                                        </Space>
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                    )}

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
                                                    options={contactRoleOptions}
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

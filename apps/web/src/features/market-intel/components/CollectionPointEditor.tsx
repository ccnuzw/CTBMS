import React, { useEffect, useMemo } from 'react';
import {
    Modal,
    Form,
    Input,
    Select,
    InputNumber,
    Switch,
    Row,
    Col,
    Divider,
    App,
    Space,
    Typography,
    Cascader,
} from 'antd';
import {
    SettingOutlined,
    RobotOutlined,
    MinusCircleOutlined,
    PlusOutlined,
    ShopOutlined,
    EnvironmentOutlined,
    TagsOutlined,
} from '@ant-design/icons';
import {
    useCollectionPoint,
    useCreateCollectionPoint,
    useUpdateCollectionPoint,
} from '../api/collection-point';
import {
    CollectionPointType,
    COLLECTION_POINT_TYPE_LABELS,
    COLLECTION_POINT_TYPE_ICONS,
    type CreateCollectionPointDto,
} from '@packages/types';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';
import { useRegionTree } from '../api/region';
import { useDictionary } from '@/hooks/useDictionaries';

const { Text } = Typography;
const { TextArea } = Input;

interface CollectionPointEditorProps {
    open: boolean;
    editId?: string;
    onClose: (success?: boolean) => void;
}

export const CollectionPointEditor: React.FC<CollectionPointEditorProps> = ({
    open,
    editId,
    onClose,
}) => {
    const [form] = Form.useForm();
    const isEdit = !!editId;
    const { message } = App.useApp();
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const { data: editData, isLoading: loadingData } = useCollectionPoint(editId);
    const createMutation = useCreateCollectionPoint();
    const updateMutation = useUpdateCollectionPoint();
    const { data: regionTree } = useRegionTree();

    const { data: priceSubTypeDict } = useDictionary('PRICE_SUB_TYPE');
    const priceSubTypeOptions = useMemo(() => {
        const items = (priceSubTypeDict || []).filter((item) => item.isActive);
        if (!items.length) {
            return [
                { value: 'LISTED', label: '挂牌价' },
                { value: 'TRANSACTION', label: '成交价' },
                { value: 'ARRIVAL', label: '到港价' },
                { value: 'FOB', label: '平舱价' },
                { value: 'STATION_ORIGIN', label: '站台价-产区' },
                { value: 'STATION_DEST', label: '站台价-销区' },
                { value: 'PURCHASE', label: '收购价' },
                { value: 'WHOLESALE', label: '批发价' },
            ];
        }
        return items.map((item) => ({ value: item.code, label: item.label }));
    }, [priceSubTypeDict]);

    // Watch type field to conditionally show region selector
    const selectedType = Form.useWatch('type', form);

    // Convert region tree to Cascader options
    const regionOptions = useMemo(() => {
        if (!regionTree) return [];
        const convertNode = (node: any): any => ({
            value: node.code,
            label: node.name,
            children: node.children?.map(convertNode),
        });
        return regionTree.map(convertNode);
    }, [regionTree]);

    useEffect(() => {
        if (open && editData) {
            form.setFieldsValue(editData);
        } else if (open && !editId) {
            form.resetFields();
            form.setFieldsValue({ isActive: true, priority: 0 });
        }
    }, [open, editData, editId, form]);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            // 只选取 UpdateCollectionPointSchema 允许的字段
            // 过滤掉 API 返回的额外字段（如 id、region、enterprise、createdAt、updatedAt 等）
            const allowedFields = [
                'code',
                'name',
                'shortName',
                'aliases',
                'type',
                'regionCode',
                'address',
                'longitude',
                'latitude',
                'latitude',
                'commodities', // Backend will derive this from configs if present
                'priceSubTypes', // Backend will derive this from configs if present
                'defaultSubType',
                'commodityConfigs',
                'enterpriseId',
                'priority',
                'isActive',
                'description',
                // AI Config
                'matchRegionCodes',
                'isDataSource',
            ];
            const filteredValues = Object.fromEntries(
                Object.entries(values)
                    .filter(([key]) => allowedFields.includes(key))
                    .map(([key, value]) => [key, value === null ? undefined : value]) // 将 null 转为 undefined
                    .filter(([, value]) => value !== undefined) // 移除 undefined 字段，保持 payload 干净
            );

            filteredValues.priority = Number(filteredValues.priority);

            if (isEdit) {
                await updateMutation.mutateAsync({ id: editId, dto: filteredValues });
                message.success('更新成功');
            } else {
                await createMutation.mutateAsync(filteredValues as CreateCollectionPointDto);
                message.success('创建成功');
            }
            onClose(true);
        } catch (error: any) {
            if (error.message) {
                message.error(error.message);
            }
        }
    };

    const isPending = createMutation.isPending || updateMutation.isPending;

    return (
        <Modal
            title={isEdit ? '编辑采集点' : '新增采集点'}
            open={open}
            onCancel={() => onClose()}
            onOk={handleSubmit}
            confirmLoading={isPending}
            width={700}
            destroyOnClose
            afterOpenChange={modalProps.afterOpenChange}
        >
            <div ref={containerRef}>
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ isActive: true, isDataSource: true, priority: 0 }}
                >
                    {/* 基本信息 */}
                    <Divider orientation="left">
                        <Space>
                            <ShopOutlined />
                            <Text strong>基本信息</Text>
                        </Space>
                    </Divider>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="code"
                                label="编码"
                                rules={[
                                    { required: true, message: '请输入编码' },
                                    { pattern: /^[A-Z0-9_]+$/, message: '仅支持大写字母、数字、下划线' },
                                ]}
                            >
                                <Input
                                    placeholder="如 JINZHOU_PORT"
                                    disabled={isEdit}
                                    {...(!isEdit ? autoFocusFieldProps : {})}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                name="name"
                                label="名称"
                                rules={[{ required: true, message: '请输入名称' }]}
                            >
                                <Input placeholder="如 锦州港" {...(isEdit ? autoFocusFieldProps : {})} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="shortName" label="简称">
                                <Input placeholder="如 锦州" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="type"
                                label="类型"
                                rules={[{ required: true, message: '请选择类型' }]}
                            >
                                <Select
                                    placeholder="选择类型"
                                    options={Object.entries(COLLECTION_POINT_TYPE_LABELS).map(
                                        ([value, label]) => ({
                                            value,
                                            label: (
                                                <Space>
                                                    {COLLECTION_POINT_TYPE_ICONS[value as CollectionPointType]}
                                                    {label}
                                                </Space>
                                            ),
                                        })
                                    )}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={16}>
                            <Form.Item
                                name="aliases"
                                label="别名（用于 AI 匹配）"
                                tooltip="多个别名用于提高 AI 识别准确率"
                            >
                                <Select
                                    mode="tags"
                                    placeholder="输入别名后按回车添加"
                                    tokenSeparators={[',']}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* 地理信息 */}
                    <Divider orientation="left">
                        <Space>
                            <EnvironmentOutlined />
                            <Text strong>地理信息</Text>
                        </Space>
                    </Divider>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="address" label="详细地址">
                                <Input placeholder="省/市/区 + 详细地址" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="longitude" label="经度">
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={-180}
                                    max={180}
                                    precision={6}
                                    placeholder="经度"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="latitude" label="纬度">
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={-90}
                                    max={90}
                                    precision={6}
                                    placeholder="纬度"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* 行政区划关联 - 所有类型都可设置，REGION 类型必填 */}
                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="regionCode"
                                label="关联行政区划"
                                tooltip={selectedType === 'REGION'
                                    ? "地域类型必须关联标准行政区划"
                                    : "可选：关联所在的省/市/区县，用于数据聚合和未来地图展示"}
                                rules={selectedType === 'REGION'
                                    ? [{ required: true, message: '地域类型必须关联行政区划' }]
                                    : []}
                                getValueProps={(value) => {
                                    // 将单个 regionCode 转换为完整路径用于显示
                                    if (!value || !regionTree) return { value: undefined };
                                    const findPath = (nodes: any[], target: string, path: string[] = []): string[] | null => {
                                        for (const node of nodes) {
                                            const currentPath = [...path, node.code];
                                            if (node.code === target) return currentPath;
                                            if (node.children) {
                                                const found = findPath(node.children, target, currentPath);
                                                if (found) return found;
                                            }
                                        }
                                        return null;
                                    };
                                    return { value: findPath(regionTree, value) || [value] };
                                }}
                                getValueFromEvent={(value) => {
                                    // 取最后一级的 code 作为表单值
                                    return value && value.length > 0 ? value[value.length - 1] : undefined;
                                }}
                            >
                                <Cascader
                                    options={regionOptions}
                                    placeholder="选择省/市/区县"
                                    allowClear
                                    showSearch={{
                                        filter: (inputValue, path) =>
                                            path.some((option) =>
                                                (option.label as string)
                                                    .toLowerCase()
                                                    .includes(inputValue.toLowerCase())
                                            ),
                                    }}
                                    changeOnSelect
                                    displayRender={(labels) => labels.join(' / ')}
                                    onChange={(_value, selectedOptions) => {
                                        // 仅 REGION 类型自动填充名称
                                        if (selectedType === 'REGION' && selectedOptions && selectedOptions.length > 0) {
                                            const lastOption = selectedOptions[selectedOptions.length - 1];
                                            const regionName = (lastOption?.label as string) || '';
                                            // 去掉"省/市/区/县"等后缀作为简称
                                            const shortName = regionName.replace(/(省|市|区|县|自治区|自治州)$/, '');
                                            form.setFieldValue('name', regionName);
                                            form.setFieldValue('shortName', shortName);
                                        }
                                    }}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* 业务属性 */}
                    <Divider orientation="left">
                        <Space>
                            <TagsOutlined />
                            <Text strong>业务属性 (品种与价格)</Text>
                        </Space>
                    </Divider>

                    <Form.List name="commodityConfigs">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <React.Fragment key={key}>
                                        <Row gutter={16} align="bottom">
                                            <Col span={6}>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'name']}
                                                    label="品种名称"
                                                    rules={[{ required: true, message: '请选择品种' }]}
                                                >
                                                    <Select
                                                        placeholder="选择品种"
                                                        options={[
                                                            { value: 'CORN', label: '玉米' },
                                                            { value: 'SOYBEAN', label: '大豆' },
                                                            { value: 'WHEAT', label: '小麦' },
                                                            { value: 'RICE', label: '稻谷' },
                                                            { value: 'SORGHUM', label: '高粱' },
                                                            { value: 'BARLEY', label: '大麦' },
                                                        ]}
                                                    />
                                                </Form.Item>
                                            </Col>
                                            <Col span={10}>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'allowedSubTypes']}
                                                    label="允许的价格类型"
                                                    rules={[{ required: true, message: '至少选一种' }]}
                                                >
                                                    <Select
                                                        mode="multiple"
                                                        placeholder="支持的价格类型"
                                                        options={priceSubTypeOptions}
                                                    />
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item
                                                    shouldUpdate={(prev, curr) =>
                                                        prev.commodityConfigs?.[name]?.allowedSubTypes !==
                                                        curr.commodityConfigs?.[name]?.allowedSubTypes
                                                    }
                                                >
                                                    {({ getFieldValue }) => {
                                                        const allowed = getFieldValue(['commodityConfigs', name, 'allowedSubTypes']) || [];
                                                        return (
                                                            <Form.Item
                                                                {...restField}
                                                                name={[name, 'defaultSubType']}
                                                                label="默认类型"
                                                                rules={[
                                                                    { required: true, message: '必填' },
                                                                    {
                                                                        validator: async (_, value) => {
                                                                            if (value && !allowed.includes(value)) {
                                                                                return Promise.reject(new Error('无效默认值'));
                                                                            }
                                                                        }
                                                                    }
                                                                ]}
                                                            >
                                                                <Select
                                                                    placeholder="默认类型"
                                                                    options={priceSubTypeOptions.filter(o => allowed.includes(o.value))}
                                                                />
                                                            </Form.Item>
                                                        );
                                                    }}
                                                </Form.Item>
                                            </Col>
                                            <Col span={2}>
                                                <Form.Item label=" ">
                                                    <MinusCircleOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                        <Divider style={{ margin: '0 0 16px 0' }} dashed />
                                    </React.Fragment>
                                ))}
                                <Form.Item>
                                    <button
                                        type="button"
                                        onClick={() => add()}
                                        style={{
                                            width: '100%',
                                            border: '1px dashed #d9d9d9',
                                            backgroundColor: 'transparent',
                                            cursor: 'pointer',
                                            padding: '8px 0',
                                            borderRadius: '6px',
                                        }}
                                    >
                                        <PlusOutlined /> 添加经营品种
                                    </button>
                                </Form.Item>
                            </>
                        )}
                    </Form.List>

                    {/* AI 智能提取配置 */}
                    <Divider orientation="left">
                        <Space>
                            <RobotOutlined />
                            <Text strong>AI 智能提取配置</Text>
                        </Space>
                    </Divider>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item
                                name="isDataSource"
                                label="作为数据源"
                                valuePropName="checked"
                                tooltip="是否作为可信的价格/信息数据来源"
                            >
                                <Switch checkedChildren="是" unCheckedChildren="否" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* 控制 */}
                    <Divider orientation="left">
                        <Space>
                            <SettingOutlined />
                            <Text strong>控制</Text>
                        </Space>
                    </Divider>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                name="priority"
                                label="匹配优先级"
                                tooltip="数值越大，匹配优先级越高"
                            >
                                <InputNumber style={{ width: '100%' }} min={0} max={100} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="isActive" label="启用状态" valuePropName="checked">
                                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="description" label="备注">
                        <TextArea rows={2} placeholder="可选备注信息" />
                    </Form.Item>
                </Form >
            </div >
        </Modal >
    );
};

export default CollectionPointEditor;

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
    Flex,
    Button,
    theme,
    TimePicker,
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
    CollectionPointFrequencyType,
    COLLECTION_POINT_FREQUENCY_LABELS,
    type CreateCollectionPointDto,
} from '@packages/types';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';
import { useRegionTree } from '../api/region';
import { useDictionary } from '@/hooks/useDictionaries';
import dayjs from 'dayjs';

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
    const { token } = theme.useToken();
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const { data: editData, isLoading: loadingData } = useCollectionPoint(editId);
    const createMutation = useCreateCollectionPoint();
    const updateMutation = useUpdateCollectionPoint();
    const { data: regionTree } = useRegionTree();

    const { data: priceSubTypeDict } = useDictionary('PRICE_SUB_TYPE');
    const priceSubTypeOptions = useMemo(() => {
        const items = (priceSubTypeDict || []).filter((item) => item.isActive);
        if (!items.length) {
            // Fallback: 与字典 PRICE_SUB_TYPE 保持一致
            return [
                { value: 'LISTED', label: '挂牌价' },
                { value: 'TRANSACTION', label: '成交价' },
                { value: 'ARRIVAL', label: '到港价' },
                { value: 'FOB', label: '平舱价' },
                { value: 'STATION', label: '站台价' },
                { value: 'PURCHASE', label: '收购价' },
                { value: 'WHOLESALE', label: '批发价' },
                { value: 'OTHER', label: '其他' },
            ];
        }
        return items.map((item) => ({ value: item.code, label: item.label }));
    }, [priceSubTypeDict]);

    // Watch type field to conditionally show region selector
    const selectedType = Form.useWatch('type', form);
    const frequencyType = Form.useWatch('frequencyType', form);

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
            const minute = editData.dispatchAtMinute ?? 540;
            form.setFieldsValue({
                ...editData,
                dispatchTime: dayjs().hour(Math.floor(minute / 60)).minute(minute % 60),
            });
        } else if (open && !editId) {
            form.resetFields();
            form.setFieldsValue({
                isActive: true,
                priority: 0,
                frequencyType: CollectionPointFrequencyType.DAILY,
                dispatchTime: dayjs().hour(9).minute(0),
            });
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
                'frequencyType',
                'weekdays',
                'monthDays',
                'dispatchAtMinute',
                'shiftConfig',
                // AI Config
                'matchRegionCodes',
                'isDataSource',
            ];
            const dispatchTime = values.dispatchTime as dayjs.Dayjs | undefined;
            const dispatchAtMinute = dispatchTime ? dispatchTime.hour() * 60 + dispatchTime.minute() : undefined;
            const filteredValues = Object.fromEntries(
                Object.entries(values)
                    .filter(([key]) => allowedFields.includes(key))
                    .map(([key, value]) => [key, value === null ? undefined : value]) // 将 null 转为 undefined
                    .filter(([, value]) => value !== undefined) // 移除 undefined 字段，保持 payload 干净
            );

            filteredValues.priority = Number(filteredValues.priority);
            if (dispatchAtMinute !== undefined) {
                filteredValues.dispatchAtMinute = dispatchAtMinute;
            }

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
                    initialValues={{ isActive: true, isDataSource: true, priority: 0, frequencyType: CollectionPointFrequencyType.DAILY }}
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

                    {/* 采集频率 */}
                    <Divider orientation="left">
                        <Space>
                            <SettingOutlined />
                            <Text strong>采集频率</Text>
                        </Space>
                    </Divider>

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="frequencyType" label="频率类型">
                                <Select
                                    options={Object.entries(COLLECTION_POINT_FREQUENCY_LABELS).map(([value, label]) => ({
                                        value,
                                        label,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="dispatchTime" label="下发时间">
                                <TimePicker format="HH:mm" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="shiftConfig" label="班次配置">
                                <Input placeholder="可选，JSON/文本" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {frequencyType === CollectionPointFrequencyType.WEEKLY && (
                        <Form.Item name="weekdays" label="每周">
                            <Select
                                mode="multiple"
                                placeholder="选择周几"
                                options={[
                                    { value: 1, label: '周一' },
                                    { value: 2, label: '周二' },
                                    { value: 3, label: '周三' },
                                    { value: 4, label: '周四' },
                                    { value: 5, label: '周五' },
                                    { value: 6, label: '周六' },
                                    { value: 7, label: '周日' },
                                ]}
                            />
                        </Form.Item>
                    )}

                    {frequencyType === CollectionPointFrequencyType.MONTHLY && (
                        <Form.Item name="monthDays" label="每月">
                            <Select
                                mode="multiple"
                                placeholder="选择日期"
                                options={[
                                    ...Array.from({ length: 31 }, (_, index) => ({
                                        value: index + 1,
                                        label: `${index + 1}日`,
                                    })),
                                    { value: 0, label: '月末' },
                                ]}
                            />
                        </Form.Item>
                    )}

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
                            <Flex vertical gap={12}>
                                {fields.map(({ key, name, ...restField }) => (
                                    <div
                                        key={key}
                                        style={{
                                            background: token.colorBgContainer,
                                            border: `1px solid ${token.colorBorderSecondary}`,
                                            borderRadius: token.borderRadiusLG,
                                            padding: '16px',
                                            position: 'relative',
                                        }}
                                    >
                                        {/* 删除按钮 - 扩大点击区域 */}
                                        <div
                                            onClick={() => remove(name)}
                                            style={{
                                                position: 'absolute',
                                                top: 4,
                                                right: 4,
                                                width: 32,
                                                height: 32,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                borderRadius: '50%',
                                                transition: 'background-color 0.2s',
                                                zIndex: 10,
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = token.colorErrorBg;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }}
                                        >
                                            <MinusCircleOutlined
                                                style={{
                                                    color: token.colorError,
                                                    fontSize: 18,
                                                }}
                                            />
                                        </div>
                                        <Row gutter={16}>
                                            <Col xs={24} sm={8}>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'name']}
                                                    label="品种"
                                                    rules={[{ required: true, message: '请选择' }]}
                                                    style={{ marginBottom: 0 }}
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
                                            <Col xs={24} sm={10}>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'allowedSubTypes']}
                                                    label="允许的价格类型"
                                                    rules={[{ required: true, message: '至少选一种' }]}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Select
                                                        mode="multiple"
                                                        placeholder="可多选"
                                                        options={priceSubTypeOptions}
                                                        maxTagCount="responsive"
                                                    />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={6}>
                                                <Form.Item
                                                    shouldUpdate={(prev, curr) =>
                                                        prev.commodityConfigs?.[name]?.allowedSubTypes !==
                                                        curr.commodityConfigs?.[name]?.allowedSubTypes
                                                    }
                                                    style={{ marginBottom: 0 }}
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
                                                                                return Promise.reject(new Error('无效'));
                                                                            }
                                                                        }
                                                                    }
                                                                ]}
                                                                style={{ marginBottom: 0 }}
                                                            >
                                                                <Select
                                                                    placeholder="选择"
                                                                    options={priceSubTypeOptions.filter(o => allowed.includes(o.value))}
                                                                />
                                                            </Form.Item>
                                                        );
                                                    }}
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </div>
                                ))}
                                <Button
                                    type="dashed"
                                    onClick={() => add({ name: '', allowedSubTypes: [], defaultSubType: '' })}
                                    block
                                    icon={<PlusOutlined />}
                                >
                                    添加经营品种
                                </Button>
                            </Flex>
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
                </Form>
            </div>
        </Modal>
    );
};

export default CollectionPointEditor;

import React, { useEffect } from 'react';
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
    message,
    Space,
    Typography,
} from 'antd';
import {
    ShopOutlined,
    EnvironmentOutlined,
    TagsOutlined,
    SettingOutlined,
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

    const { data: editData, isLoading: loadingData } = useCollectionPoint(editId);
    const createMutation = useCreateCollectionPoint();
    const updateMutation = useUpdateCollectionPoint();

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

            if (isEdit) {
                await updateMutation.mutateAsync({ id: editId, dto: values });
                message.success('更新成功');
            } else {
                await createMutation.mutateAsync(values as CreateCollectionPointDto);
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
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{ isActive: true, priority: 0 }}
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
                            <Input placeholder="如 JINZHOU_PORT" disabled={isEdit} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item
                            name="name"
                            label="名称"
                            rules={[{ required: true, message: '请输入名称' }]}
                        >
                            <Input placeholder="如 锦州港" />
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

                {/* 业务属性 */}
                <Divider orientation="left">
                    <Space>
                        <TagsOutlined />
                        <Text strong>业务属性</Text>
                    </Space>
                </Divider>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="commodities"
                            label="主营品种"
                            tooltip="该采集点主要涉及的品种"
                        >
                            <Select
                                mode="tags"
                                placeholder="如：玉米、大豆"
                                options={[
                                    { value: '玉米', label: '玉米' },
                                    { value: '大豆', label: '大豆' },
                                    { value: '小麦', label: '小麦' },
                                    { value: '稻谷', label: '稻谷' },
                                    { value: '高粱', label: '高粱' },
                                    { value: '豆粕', label: '豆粕' },
                                ]}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="defaultSubType"
                            label="默认价格子类型"
                            tooltip="该采集点的价格默认分类"
                        >
                            <Select
                                allowClear
                                placeholder="选择默认价格子类型"
                                options={[
                                    { value: 'LISTED', label: '挂牌价' },
                                    { value: 'TRANSACTION', label: '成交价' },
                                    { value: 'ARRIVAL', label: '到港价' },
                                    { value: 'FOB', label: '平舱价' },
                                    { value: 'STATION_ORIGIN', label: '站台价-产区' },
                                    { value: 'STATION_DEST', label: '站台价-销区' },
                                    { value: 'PURCHASE', label: '收购价' },
                                    { value: 'WHOLESALE', label: '批发价' },
                                ]}
                            />
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
        </Modal>
    );
};

export default CollectionPointEditor;

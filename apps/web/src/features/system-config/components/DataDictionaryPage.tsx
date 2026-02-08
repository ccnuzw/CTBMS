import { useEffect, useMemo, useState } from 'react';
import {
    App,
    Button,
    Card,
    Col,
    Empty,
    Flex,
    Input,
    Popconfirm,
    Radio,
    Row,
    Space,
    Switch,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    PageContainer,
    ProColumns,
    ProFormDigit,
    ProFormSelect,
    ProFormSwitch,
    ProFormText,
    ProFormTextArea,
    ProTable,
    ModalForm,
} from '@ant-design/pro-components';
import {
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    LockOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import {
    useDictionaryDomains,
    useDictionaryItems,
    useCreateDictionaryDomain,
    useUpdateDictionaryDomain,
    useDeleteDictionaryDomain,
    useCreateDictionaryItem,
    useUpdateDictionaryItem,
    useDeleteDictionaryItem,
} from '../api';
import {
    CreateDictionaryDomainDTO,
    CreateDictionaryItemDTO,
    DictionaryDomainModel,
    DictionaryItemModel,
    UpdateDictionaryDomainDTO,
    UpdateDictionaryItemDTO,
} from '../types';
import { DOMAIN_CATEGORIES, DOMAIN_CATEGORY_OPTIONS, DomainCategory } from '@/constants';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Text, Paragraph } = Typography;

type DictionaryDomainWithCount = DictionaryDomainModel & {
    _count?: { items: number };
    category?: string | null;
    usageHint?: string | null;
    usageLocations?: string[];
    isSystemDomain?: boolean;
};

const formatMetaText = (meta: unknown) => {
    if (meta === null || meta === undefined) return '';
    try {
        return JSON.stringify(meta, null, 2);
    } catch {
        return String(meta);
    }
};

const parseMetaInput = (input?: string) => {
    if (!input || !input.trim()) return null;
    return JSON.parse(input) as unknown;
};

export const DataDictionaryPage = () => {
    const { message } = App.useApp();
    const [selectedDomainCode, setSelectedDomainCode] = useState<string | null>(null);
    const [includeInactiveDomains, setIncludeInactiveDomains] = useState(true);
    const [includeInactiveItems, setIncludeInactiveItems] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState<string>('');
    const [searchText, setSearchText] = useState('');

    const [domainModalOpen, setDomainModalOpen] = useState(false);
    const [editingDomain, setEditingDomain] = useState<DictionaryDomainWithCount | null>(null);

    const [itemModalOpen, setItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<DictionaryItemModel | null>(null);
    const {
        containerRef: domainContainerRef,
        autoFocusFieldProps: domainAutoFocusFieldProps,
        modalProps: domainModalProps,
    } = useModalAutoFocus();
    const {
        containerRef: itemContainerRef,
        autoFocusFieldProps: itemAutoFocusFieldProps,
        modalProps: itemModalProps,
    } = useModalAutoFocus();


    const {
        data: domains,
        isLoading: domainLoading,
        refetch: refetchDomains,
    } = useDictionaryDomains(includeInactiveDomains);
    const {
        data: items,
        isLoading: itemLoading,
        refetch: refetchItems,
    } = useDictionaryItems(selectedDomainCode || undefined, includeInactiveItems);

    const createDomainMutation = useCreateDictionaryDomain();
    const updateDomainMutation = useUpdateDictionaryDomain();
    const deleteDomainMutation = useDeleteDictionaryDomain();

    const createItemMutation = useCreateDictionaryItem();
    const updateItemMutation = useUpdateDictionaryItem();
    const deleteItemMutation = useDeleteDictionaryItem();

    // 过滤后的字典域列表
    const filteredDomains = useMemo(() => {
        if (!domains) return [];
        return domains.filter((d: DictionaryDomainWithCount) => {
            const matchCategory = !categoryFilter || d.category === categoryFilter;
            const matchSearch =
                !searchText ||
                d.code.toLowerCase().includes(searchText.toLowerCase()) ||
                d.name.toLowerCase().includes(searchText.toLowerCase());
            return matchCategory && matchSearch;
        });
    }, [domains, categoryFilter, searchText]);

    useEffect(() => {
        if (!domains || domains.length === 0) return;
        if (!selectedDomainCode || !domains.find((domain) => domain.code === selectedDomainCode)) {
            setSelectedDomainCode(domains[0].code);
        }
    }, [domains, selectedDomainCode]);

    const selectedDomain = useMemo(
        () =>
            (domains?.find((domain) => domain.code === selectedDomainCode) as DictionaryDomainWithCount) ||
            null,
        [domains, selectedDomainCode],
    );

    const parentOptions = useMemo(() => {
        if (!items) return [];
        return items
            .filter((item) => item.code !== editingItem?.code)
            .map((item) => ({
                label: `${item.label} (${item.code})`,
                value: item.code,
            }));
    }, [items, editingItem?.code]);

    const handleDomainSubmit = async (values: CreateDictionaryDomainDTO) => {
        try {
            if (editingDomain) {
                const payload: UpdateDictionaryDomainDTO = {
                    name: values.name,
                    description: values.description ?? null,
                    category: values.category ?? null,
                    usageHint: values.usageHint ?? null,
                    usageLocations: values.usageLocations ?? [],
                    isSystemDomain: values.isSystemDomain,
                    isActive: values.isActive,
                };
                await updateDomainMutation.mutateAsync({ code: editingDomain.code, data: payload });
                message.success('字典域已更新');
            } else {
                await createDomainMutation.mutateAsync(values);
                message.success('字典域已创建');
            }
            setDomainModalOpen(false);
            setEditingDomain(null);
            refetchDomains();
            return true;
        } catch {
            message.error('字典域操作失败');
            return false;
        }
    };

    const handleItemSubmit = async (values: CreateDictionaryItemDTO & { metaText?: string }) => {
        if (!selectedDomainCode) {
            message.warning('请先选择字典域');
            return false;
        }

        let metaValue: unknown | null = null;
        try {
            metaValue = parseMetaInput(values.metaText);
        } catch {
            message.error('meta JSON 格式错误');
            return false;
        }

        const payloadBase: CreateDictionaryItemDTO = {
            code: values.code,
            label: values.label,
            sortOrder: values.sortOrder,
            isActive: values.isActive,
            parentCode: values.parentCode ?? null,
            meta: metaValue,
        };

        try {
            if (editingItem) {
                const payload: UpdateDictionaryItemDTO = {
                    label: payloadBase.label,
                    sortOrder: payloadBase.sortOrder,
                    isActive: payloadBase.isActive,
                    parentCode: payloadBase.parentCode,
                    meta: payloadBase.meta,
                };
                await updateItemMutation.mutateAsync({
                    domainCode: selectedDomainCode,
                    code: editingItem.code,
                    data: payload,
                });
                message.success('字典项已更新');
            } else {
                await createItemMutation.mutateAsync({
                    domainCode: selectedDomainCode,
                    data: payloadBase,
                });
                message.success('字典项已创建');
            }
            setItemModalOpen(false);
            setEditingItem(null);
            refetchItems();
            refetchDomains();
            return true;
        } catch {
            message.error('字典项操作失败');
            return false;
        }
    };

    // 导出功能
    const handleExport = () => {
        if (!domains) return;
        const exportData = domains.map((d: DictionaryDomainWithCount) => ({
            code: d.code,
            name: d.name,
            description: d.description,
            category: d.category,
            usageHint: d.usageHint,
            usageLocations: d.usageLocations,
            isSystemDomain: d.isSystemDomain,
            isActive: d.isActive,
        }));
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dictionary-domains-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success('导出成功');
    };

    // 直接删除字典项（后端会检查引用并返回错误）
    const handleDeleteItem = async (itemCode: string) => {
        if (!selectedDomainCode) return;
        try {
            await deleteItemMutation.mutateAsync({ domainCode: selectedDomainCode, code: itemCode });
            refetchItems();
            refetchDomains();
            message.success('字典项已删除');
        } catch (error: any) {
            // 后端返回的引用检查错误
            const errorMsg = error?.message || '删除失败';
            message.error(errorMsg);
        }
    };


    const getCategoryInfo = (category?: string | null) => {
        if (!category) return null;
        return DOMAIN_CATEGORIES[category as DomainCategory];
    };

    // 字典域卡片渲染
    const renderDomainCard = (domain: DictionaryDomainWithCount) => {
        const categoryInfo = getCategoryInfo(domain.category);
        const isSelected = domain.code === selectedDomainCode;

        return (
            <Card
                key={domain.code}
                size="small"
                hoverable
                onClick={() => setSelectedDomainCode(domain.code)}
                style={{
                    marginBottom: 8,
                    borderColor: isSelected ? '#1677ff' : undefined,
                    backgroundColor: isSelected ? 'rgba(22, 119, 255, 0.04)' : undefined,
                }}
                bodyStyle={{ padding: '12px' }}
            >
                <Flex justify="space-between" align="flex-start">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Flex align="center" gap={8}>
                            <Text strong style={{ fontSize: 14 }}>
                                {domain.name}
                            </Text>
                            {domain.isSystemDomain && (
                                <Tooltip title="系统域（不可删除）">
                                    <LockOutlined style={{ color: '#999', fontSize: 12 }} />
                                </Tooltip>
                            )}
                            {!domain.isActive && <Tag color="default">禁用</Tag>}
                        </Flex>

                        <Text type="secondary" style={{ fontSize: 12 }} copyable={{ text: domain.code }}>
                            {domain.code}
                        </Text>

                        {domain.usageHint && (
                            <Paragraph
                                type="secondary"
                                style={{ fontSize: 12, marginBottom: 4, marginTop: 4 }}
                                ellipsis={{ rows: 1 }}
                            >
                                {domain.usageHint}
                            </Paragraph>
                        )}

                        <Flex gap={4} wrap="wrap" style={{ marginTop: 4 }}>
                            {categoryInfo && (
                                <Tag color={categoryInfo.color} style={{ fontSize: 11, margin: 0 }}>
                                    {categoryInfo.icon} {categoryInfo.label}
                                </Tag>
                            )}
                            <Tag style={{ fontSize: 11, margin: 0 }}>{domain._count?.items ?? 0} 项</Tag>
                        </Flex>
                    </div>

                    <Space size={4}>
                        <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingDomain(domain);
                                setDomainModalOpen(true);
                            }}
                        />
                        {!domain.isSystemDomain && (
                            <Popconfirm
                                title="确认禁用该字典域？"
                                onConfirm={async (e) => {
                                    e?.stopPropagation();
                                    await deleteDomainMutation.mutateAsync(domain.code);
                                    if (domain.code === selectedDomainCode) {
                                        setSelectedDomainCode(null);
                                    }
                                }}
                            >
                                <Button
                                    size="small"
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </Popconfirm>
                        )}
                    </Space>
                </Flex>
            </Card>
        );
    };

    const itemColumns: ProColumns<DictionaryItemModel>[] = [
        {
            title: '编码',
            dataIndex: 'code',
            width: 140,
            copyable: true,
        },
        {
            title: '名称',
            dataIndex: 'label',
            width: 160,
        },
        {
            title: '父级',
            dataIndex: 'parentCode',
            width: 120,
            render: (_, record) => record.parentCode || '-',
        },
        {
            title: '排序',
            dataIndex: 'sortOrder',
            width: 80,
            render: (_, record) => record.sortOrder ?? 0,
        },
        {
            title: '扩展',
            dataIndex: 'meta',
            ellipsis: true,
            render: (_, record) => {
                if (!record.meta) return '-';
                const meta = record.meta as Record<string, unknown>;

                // 颜色预览
                const colorValue = meta.color as string | undefined;
                const colorPreview = colorValue ? (
                    <Tag color={colorValue} style={{ marginRight: 4 }}>
                        {colorValue}
                    </Tag>
                ) : null;

                const text = formatMetaText(record.meta);
                return (
                    <Flex align="center" gap={4}>
                        {colorPreview}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {text.length > 60 ? `${text.slice(0, 60)}...` : text}
                        </Text>
                    </Flex>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'isActive',
            width: 90,
            render: (_, record) => (
                <Switch
                    checked={record.isActive}
                    size="small"
                    onChange={async (checked) => {
                        if (!selectedDomainCode) return;
                        await updateItemMutation.mutateAsync({
                            domainCode: selectedDomainCode,
                            code: record.code,
                            data: { isActive: checked },
                        });
                        refetchItems();
                        refetchDomains();
                    }}
                />
            ),
        },
        {
            title: '操作',
            valueType: 'option',
            width: 120,
            render: (_, record) => (
                <Space size={4}>
                    <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => {
                            setEditingItem(record);
                            setItemModalOpen(true);
                        }}
                    />
                    <Popconfirm
                        title="确认删除该字典项？"
                        description="删除后无法恢复，如有业务数据引用将阻止删除"
                        onConfirm={() => handleDeleteItem(record.code)}
                        okText="确认删除"
                        cancelText="取消"
                    >
                        <Tooltip title="删除字典项">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <PageContainer
            header={{
                title: '数据字典管理',
                breadcrumb: {},
                extra: [
                    <Button key="export" icon={<DownloadOutlined />} onClick={handleExport}>
                        导出
                    </Button>,
                    <Button key="import" icon={<UploadOutlined />} disabled>
                        导入
                    </Button>,
                ],
            }}
        >
            <Row gutter={16}>
                <Col span={9}>
                    <Card
                        title="字典域"
                        extra={
                            <Space>
                                <Switch
                                    checked={includeInactiveDomains}
                                    onChange={setIncludeInactiveDomains}
                                    size="small"
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    含禁用
                                </Text>
                                <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchDomains()} />
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={() => {
                                        setEditingDomain(null);
                                        setDomainModalOpen(true);
                                    }}
                                >
                                    新建
                                </Button>
                            </Space>
                        }
                    >
                        {/* 分类筛选 */}
                        <Flex vertical gap={12} style={{ marginBottom: 12 }}>
                            <Radio.Group
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                optionType="button"
                                size="small"
                            >
                                <Radio.Button value="">全部</Radio.Button>
                                {DOMAIN_CATEGORY_OPTIONS.map((opt) => (
                                    <Radio.Button key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </Radio.Button>
                                ))}
                            </Radio.Group>

                            <Input
                                placeholder="搜索域名或编码..."
                                prefix={<SearchOutlined />}
                                allowClear
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                            />
                        </Flex>

                        {/* 字典域列表 */}
                        <div style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
                            {domainLoading ? (
                                <Card loading />
                            ) : filteredDomains.length === 0 ? (
                                <Empty description="暂无数据" />
                            ) : (
                                filteredDomains.map((d) => renderDomainCard(d as DictionaryDomainWithCount))
                            )}
                        </div>
                    </Card>
                </Col>

                <Col span={15}>
                    <Card
                        title={
                            <Space>
                                <span>字典项</span>
                                {selectedDomain && (
                                    <Tag color="blue">
                                        {selectedDomain.name} ({selectedDomain.code})
                                    </Tag>
                                )}
                            </Space>
                        }
                        extra={
                            <Space>
                                <Switch
                                    checked={includeInactiveItems}
                                    onChange={setIncludeInactiveItems}
                                    size="small"
                                    disabled={!selectedDomain}
                                />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    含禁用
                                </Text>
                                <Button
                                    size="small"
                                    icon={<ReloadOutlined />}
                                    onClick={() => refetchItems()}
                                    disabled={!selectedDomain}
                                />
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    disabled={!selectedDomain}
                                    onClick={() => {
                                        setEditingItem(null);
                                        setItemModalOpen(true);
                                    }}
                                >
                                    新建
                                </Button>
                            </Space>
                        }
                    >
                        {/* 使用位置展示 */}
                        {selectedDomain?.usageLocations && selectedDomain.usageLocations.length > 0 && (
                            <Flex gap={4} wrap="wrap" style={{ marginBottom: 12 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    使用位置：
                                </Text>
                                {selectedDomain.usageLocations.map((loc: string) => (
                                    <Tag key={loc} style={{ fontSize: 11 }}>
                                        {loc}
                                    </Tag>
                                ))}
                            </Flex>
                        )}

                        {selectedDomain ? (
                            <ProTable<DictionaryItemModel>
                                rowKey="code"
                                search={false}
                                options={false}
                                loading={itemLoading}
                                dataSource={items || []}
                                columns={itemColumns}
                                pagination={{ pageSize: 20 }}
                            />
                        ) : (
                            <Flex align="center" justify="center" style={{ height: 240 }}>
                                <Text type="secondary">请先选择左侧字典域</Text>
                            </Flex>
                        )}
                    </Card>
                </Col>
            </Row>

            {/* 字典域编辑弹窗 */}
            <ModalForm<CreateDictionaryDomainDTO>
                title={editingDomain ? '编辑字典域' : '新建字典域'}
                open={domainModalOpen}
                onOpenChange={(open) => {
                    setDomainModalOpen(open);
                    if (!open) setEditingDomain(null);
                }}
                onFinish={handleDomainSubmit}
                initialValues={
                    editingDomain || { isActive: true, isSystemDomain: false, usageLocations: [] }
                }
                modalProps={{ destroyOnClose: true, ...domainModalProps }}
            >
                <div ref={domainContainerRef}>
                    <ProFormText
                        name="code"
                        label="编码"
                        rules={[{ required: true, message: '请输入编码' }]}
                        fieldProps={{
                            disabled: Boolean(editingDomain),
                            ...(editingDomain ? {} : domainAutoFocusFieldProps),
                        }}
                    />
                    <ProFormText
                        name="name"
                        label="名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                        fieldProps={editingDomain ? domainAutoFocusFieldProps : undefined}
                    />
                    <ProFormSelect
                        name="category"
                        label="分类"
                        options={DOMAIN_CATEGORY_OPTIONS}
                        placeholder="选择分类"
                    />
                    <ProFormText name="usageHint" label="用途说明" placeholder="简短描述该字典域的用途" />
                    <ProFormSelect
                        name="usageLocations"
                        label="使用位置"
                        mode="tags"
                        placeholder="输入后回车添加"
                    />
                    <ProFormTextArea name="description" label="详细描述" fieldProps={{ rows: 2 }} />
                    <ProFormSwitch name="isSystemDomain" label="系统域（不可删除）" />
                    <ProFormSwitch name="isActive" label="启用" />
                </div>
            </ModalForm>

            {/* 字典项编辑弹窗 */}
            <ModalForm<CreateDictionaryItemDTO & { metaText?: string }>
                title={editingItem ? '编辑字典项' : '新建字典项'}
                open={itemModalOpen}
                onOpenChange={(open) => {
                    setItemModalOpen(open);
                    if (!open) setEditingItem(null);
                }}
                onFinish={handleItemSubmit}
                initialValues={
                    editingItem
                        ? {
                            ...editingItem,
                            metaText: formatMetaText(editingItem.meta),
                        }
                        : { isActive: true, sortOrder: 0 }
                }
                modalProps={{ destroyOnClose: true, ...itemModalProps }}
            >
                <div ref={itemContainerRef}>
                    <ProFormText
                        name="code"
                        label="编码"
                        rules={[{ required: true, message: '请输入编码' }]}
                        fieldProps={{
                            disabled: Boolean(editingItem),
                            ...(editingItem ? {} : itemAutoFocusFieldProps),
                        }}
                    />
                    <ProFormText
                        name="label"
                        label="名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                        fieldProps={editingItem ? itemAutoFocusFieldProps : undefined}
                    />
                    <ProFormSelect
                        name="parentCode"
                        label="父级编码"
                        options={parentOptions}
                        allowClear
                        placeholder="可选"
                    />
                    <ProFormDigit name="sortOrder" label="排序" fieldProps={{ min: 0 }} />
                    <ProFormSwitch name="isActive" label="启用" />
                    <ProFormTextArea
                        name="metaText"
                        label="扩展属性 (JSON)"
                        fieldProps={{ rows: 4 }}
                        placeholder='例如：{"color":"blue","icon":"StarOutlined"}'
                    />
                </div>
            </ModalForm>
        </PageContainer>
    );
};

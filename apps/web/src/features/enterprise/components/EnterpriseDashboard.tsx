import React, { useState, useMemo } from 'react';
import {
    Input,
    Select,
    Space,
    Button,
    Segmented,
    theme,
    Row,
    Col,
    Badge,
    Grid,
    Flex,
} from 'antd';
import {
    SearchOutlined,
    PlusOutlined,
    TableOutlined,
    AppstoreOutlined,
    GlobalOutlined,
    FilterOutlined,
} from '@ant-design/icons';
import { EnterpriseType, EnterpriseResponse, EnterpriseQueryParams } from '@packages/types';
import { useEnterprises } from '../api';
import { EnterpriseTable } from './EnterpriseTable';
import { EnterpriseCardGrid } from './EnterpriseCardGrid';
import { Enterprise360 } from './Enterprise360';
import { EnterpriseEditor } from './EnterpriseEditor';
import { GeoMap } from './GeoMap';

const { useToken } = theme;

// 企业类型中文映射
const ENTERPRISE_TYPE_OPTIONS = [
    { label: '全部类型', value: '' },
    { label: '供应商', value: EnterpriseType.SUPPLIER },
    { label: '客户', value: EnterpriseType.CUSTOMER },
    { label: '物流商', value: EnterpriseType.LOGISTICS },
    { label: '集团', value: EnterpriseType.GROUP },
];

export const EnterpriseDashboard: React.FC = () => {
    const { token } = useToken();
    const screens = Grid.useBreakpoint();

    // 筛选状态
    const [searchText, setSearchText] = useState('');
    const [typeFilter, setTypeFilter] = useState<EnterpriseType | ''>('');
    const [rootOnly, setRootOnly] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    // 视图状态
    const [viewMode, setViewMode] = useState<'table' | 'card' | 'map'>('table');
    const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // 构建查询参数
    const queryParams: Partial<EnterpriseQueryParams> = useMemo(() => ({
        search: searchText || undefined,
        type: typeFilter || undefined,
        rootOnly: rootOnly,
        page,
        pageSize: viewMode === 'map' ? 1000 : pageSize, // 地图模式下加载更多数据
    }), [searchText, typeFilter, rootOnly, page, pageSize, viewMode]);

    // 获取数据
    const { data: listData, isLoading } = useEnterprises(queryParams);

    // 处理选择企业
    const handleSelectEnterprise = (ent: EnterpriseResponse | string | null) => {
        if (typeof ent === 'string' || ent === null) {
            setSelectedEnterpriseId(ent);
        } else {
            setSelectedEnterpriseId(ent.id);
        }
    };

    // 处理新增
    const handleAdd = () => {
        setEditingId(null);
        setEditorOpen(true);
    };

    // 处理编辑
    const handleEdit = (id: string) => {
        setEditingId(id);
        setEditorOpen(true);
    };

    // 处理编辑器关闭
    const handleEditorClose = () => {
        setEditorOpen(false);
        setEditingId(null);
    };

    return (
        <Row style={{ height: 'calc(100vh - 112px)', overflow: 'hidden' }}>
            {/* 主内容区 */}
            <Col
                xs={24}
                md={selectedEnterpriseId ? 14 : 24}
                lg={selectedEnterpriseId ? 15 : 24}
                xl={selectedEnterpriseId ? 16 : 24}
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
                {/* 工具栏 */}
                <div
                    style={{
                        padding: token.padding,
                        background: token.colorBgContainer,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Flex justify="space-between" align="center" wrap="wrap" gap={token.marginSM}>
                        {/* 左侧筛选区 */}
                        <Space wrap size="small">
                            <Input
                                placeholder="搜索企业名称、税号..."
                                prefix={<SearchOutlined />}
                                value={searchText}
                                onChange={(e) => {
                                    setSearchText(e.target.value);
                                    setPage(1);
                                }}
                                style={{ width: screens.md ? 260 : 200 }}
                                allowClear
                            />

                            <Select
                                value={typeFilter}
                                onChange={(v) => {
                                    setTypeFilter(v);
                                    setPage(1);
                                }}
                                options={ENTERPRISE_TYPE_OPTIONS}
                                style={{ width: 120 }}
                                suffixIcon={<FilterOutlined />}
                            />

                            <Button
                                type={rootOnly ? 'primary' : 'default'}
                                ghost={rootOnly}
                                onClick={() => setRootOnly(!rootOnly)}
                                size="middle"
                            >
                                {rootOnly ? '仅顶级' : '全部层级'}
                            </Button>

                            <Button
                                type={typeFilter === EnterpriseType.GROUP ? 'primary' : 'default'}
                                ghost={typeFilter === EnterpriseType.GROUP}
                                onClick={() => {
                                    setTypeFilter(
                                        typeFilter === EnterpriseType.GROUP ? '' : EnterpriseType.GROUP
                                    );
                                    setPage(1);
                                }}
                                size="middle"
                            >
                                仅集团
                            </Button>
                        </Space>

                        {/* 右侧操作区 */}
                        <Space>
                            <span style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM, marginRight: token.marginXS }}>
                                共 <Badge count={listData?.total ?? 0} showZero color={token.colorPrimary} /> 条记录
                            </span>
                            {(searchText || typeFilter) && (
                                <span style={{ color: token.colorTextDescription, fontSize: token.fontSizeSM, marginRight: token.marginXS }}>
                                    当前已筛选
                                </span>
                            )}

                            <Segmented
                                value={viewMode}
                                onChange={(v) => setViewMode(v as 'table' | 'card' | 'map')}
                                options={[
                                    { value: 'table', icon: <TableOutlined />, label: '列表' },
                                    { value: 'card', icon: <AppstoreOutlined />, label: '卡片' },
                                    { value: 'map', icon: <GlobalOutlined />, label: '地图' },
                                ]}
                            />

                            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                                新增客商
                            </Button>
                        </Space>
                    </Flex>


                </div>

                {/* 内容区 */}
                <div style={{ flex: 1, overflow: 'auto', background: token.colorBgLayout, padding: viewMode === 'map' ? token.padding : 0 }}>
                    {viewMode === 'table' ? (
                        <EnterpriseTable
                            data={listData?.data ?? []}
                            loading={isLoading}
                            total={listData?.total ?? 0}
                            page={page}
                            pageSize={pageSize}
                            onPageChange={(p, ps) => {
                                setPage(p);
                                setPageSize(ps);
                            }}
                            onSelect={handleSelectEnterprise}
                            selectedId={selectedEnterpriseId}
                            onEdit={handleEdit}
                            hideAddress={!!selectedEnterpriseId}
                        />
                    ) : viewMode === 'card' ? (
                        <EnterpriseCardGrid
                            data={listData?.data ?? []}
                            loading={isLoading}
                            total={listData?.total ?? 0}
                            page={page}
                            pageSize={pageSize}
                            onPageChange={(p, ps) => {
                                setPage(p);
                                setPageSize(ps);
                            }}
                            onSelect={handleSelectEnterprise}
                            selectedId={selectedEnterpriseId}
                        />
                    ) : (
                        <GeoMap
                            enterprises={listData?.data ?? []}
                            onSelectEnterprise={(ent) => handleSelectEnterprise(ent.id)}
                        />
                    )}
                </div>
            </Col>

            {/* 右侧详情面板 */}
            {selectedEnterpriseId && (
                <Col
                    xs={24}
                    md={10}
                    lg={9}
                    xl={8}
                    style={{
                        height: '100%',
                        borderLeft: `1px solid ${token.colorBorderSecondary}`,
                    }}
                >
                    <Enterprise360
                        enterpriseId={selectedEnterpriseId}
                        onClose={() => setSelectedEnterpriseId(null)}
                        onEdit={() => handleEdit(selectedEnterpriseId)}
                    />
                </Col>
            )}

            {/* 编辑器抽屉 */}
            <EnterpriseEditor
                open={editorOpen}
                enterpriseId={editingId}
                onClose={handleEditorClose}
            />
        </Row>
    );
};

export default EnterpriseDashboard;

import React, { useState, useMemo, useEffect } from 'react';
import {
    Tree,
    Input,
    Button,
    theme,
    Flex,
    Spin,
    Empty,
    Tooltip,
    message,
    Modal,
    Switch,
    App,
} from 'antd';
import {
    BankOutlined,
    ApartmentOutlined,
    SearchOutlined,
    TeamOutlined,
    GlobalOutlined,
    HomeOutlined,
    ShopOutlined,
    ClusterOutlined,
    UserAddOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { DataNode } from 'antd/es/tree';
import { OrganizationTreeNode, DepartmentTreeNode, OrganizationType } from '@packages/types';
import {
    useOrganizationTree,
    useCreateOrganization,
} from '../api/organizations';
import {
    useDepartments,
    useCreateDepartment,
} from '../api/departments';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';
import {
    ModalForm,
    ProFormText,
    ProFormTextArea,
    ProFormDigit,
    ProFormSelect,
    ProFormTreeSelect,
} from '@ant-design/pro-components';
import type { CreateOrganizationDto, CreateDepartmentDto } from '@packages/types';
import { DeptFormFields } from './DeptFormFields';
import { useDictionary } from '@/hooks/useDictionaries';

// 节点类型
export type TreeNodeType = 'org' | 'dept';

// 选中节点信息
export interface SelectedNode {
    id: string;
    type: TreeNodeType;
    name: string;
    orgId?: string; // 如果是部门，记录所属组织ID
}

interface OrgDeptTreeProps {
    onSelect?: (node: SelectedNode | null) => void;
    selectedNode?: SelectedNode | null;
    showAllLevels?: boolean;
    onShowAllLevelsChange?: (value: boolean) => void;
}

// 组织类型选项
const ORG_TYPE_OPTIONS_FALLBACK = [
    { value: 'HEADQUARTERS', label: '总部' },
    { value: 'REGION', label: '大区/分公司' },
    { value: 'BRANCH', label: '经营部/办事处' },
    { value: 'SUBSIDIARY', label: '子公司' },
];

// 组织类型对应的图标
const getOrgIcon = (type: OrganizationType, token: any) => {
    const iconStyle = { fontSize: 16 };
    switch (type) {
        case 'HEADQUARTERS':
            return <GlobalOutlined style={{ ...iconStyle, color: token.colorError }} />;
        case 'REGION':
            return <ClusterOutlined style={{ ...iconStyle, color: token.colorWarning }} />;
        case 'BRANCH':
            return <ShopOutlined style={{ ...iconStyle, color: token.colorPrimary }} />;
        case 'SUBSIDIARY':
            return <HomeOutlined style={{ ...iconStyle, color: token.colorSuccess }} />;
        default:
            return <BankOutlined style={{ ...iconStyle, color: token.colorPrimary }} />;
    }
};

// 部门图标
const getDeptIcon = (token: any) => (
    <TeamOutlined style={{ fontSize: 14, color: token.colorTextSecondary }} />
);

export const OrgDeptTree: React.FC<OrgDeptTreeProps> = ({
    onSelect,
    selectedNode,
    showAllLevels,
    onShowAllLevelsChange,
}) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const { data: orgTypeDict } = useDictionary('ORGANIZATION_TYPE');

    const orgTypeOptions = useMemo(() => {
        const items = (orgTypeDict || []).filter((item) => item.isActive);
        if (!items.length) return ORG_TYPE_OPTIONS_FALLBACK;
        return items.map((item) => ({ value: item.code, label: item.label }));
    }, [orgTypeDict]);

    // 状态
    const [searchValue, setSearchValue] = useState('');
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [hasInitialExpand, setHasInitialExpand] = useState(false);
    const [orgModalOpen, setOrgModalOpen] = useState(false);
    const [deptModalOpen, setDeptModalOpen] = useState(false);

    // 自动聚焦 hook
    const {
        containerRef: orgContainerRef,
        autoFocusFieldProps: orgAutoFocusProps,
        modalProps: orgModalAutoFocusProps
    } = useModalAutoFocus();

    const {
        containerRef: deptContainerRef,
        autoFocusFieldProps: deptAutoFocusProps,
        modalProps: deptModalAutoFocusProps
    } = useModalAutoFocus();

    // 数据获取
    const { data: orgTree, isLoading: orgLoading } = useOrganizationTree();
    // 获取所有部门（用于构建混合树）
    const { data: allDepartments, isLoading: deptLoading } = useDepartments();

    // Mutations
    const createOrgMutation = useCreateOrganization();
    const createDeptMutation = useCreateDepartment();

    // 按组织分组的部门
    const deptsByOrg = useMemo(() => {
        if (!allDepartments) return new Map<string, any[]>();
        const map = new Map<string, any[]>();
        allDepartments.forEach((dept) => {
            const orgId = dept.organizationId;
            if (!map.has(orgId)) {
                map.set(orgId, []);
            }
            map.get(orgId)!.push(dept);
        });
        return map;
    }, [allDepartments]);

    // 构建混合树数据（组织 + 部门）
    const treeData = useMemo(() => {
        if (!orgTree) return [];

        const buildDeptNodes = (orgId: string): DataNode[] => {
            const depts = deptsByOrg.get(orgId) || [];
            // 只获取顶级部门
            const topDepts = depts.filter((d) => !d.parentId);

            const buildDeptTree = (dept: any): DataNode => {
                const childDepts = depts.filter((d) => d.parentId === dept.id);
                return {
                    key: `dept-${dept.id}`,
                    title: dept.name,
                    icon: getDeptIcon(token),
                    children: childDepts.length > 0 ? childDepts.map(buildDeptTree) : undefined,
                };
            };

            return topDepts.map(buildDeptTree);
        };

        const buildOrgNode = (org: OrganizationTreeNode): DataNode => {
            const orgKey = `org-${org.id}`;
            const children: DataNode[] = [];

            // 添加子组织
            if (org.children && org.children.length > 0) {
                children.push(...org.children.map(buildOrgNode));
            }

            // 添加该组织的部门
            const deptNodes = buildDeptNodes(org.id);
            if (deptNodes.length > 0) {
                children.push(...deptNodes);
            }

            return {
                key: orgKey,
                title: org.name,
                icon: getOrgIcon(org.type as OrganizationType, token),
                children: children.length > 0 ? children : undefined,
            };
        };

        return orgTree.map(buildOrgNode);
    }, [orgTree, deptsByOrg, token]);

    // 默认展开二级节点
    useEffect(() => {
        if (orgTree && orgTree.length > 0 && !hasInitialExpand) {
            const defaultExpandKeys: React.Key[] = [];
            // 展开所有一级节点
            orgTree.forEach((org) => {
                defaultExpandKeys.push(`org-${org.id}`);
                // 展开二级节点（子组织）
                org.children?.forEach((child) => {
                    defaultExpandKeys.push(`org-${child.id}`);
                });
            });
            setExpandedKeys(defaultExpandKeys);
            setHasInitialExpand(true);
        }
    }, [orgTree, hasInitialExpand]);

    // 搜索过滤
    const filteredTreeData = useMemo(() => {
        if (!searchValue) return treeData;

        const filterTree = (nodes: DataNode[]): DataNode[] => {
            return nodes
                .map((node) => {
                    const title = node.title as string;
                    const matchesSearch = title.toLowerCase().includes(searchValue.toLowerCase());
                    const filteredChildren = node.children ? filterTree(node.children) : [];

                    if (matchesSearch || filteredChildren.length > 0) {
                        return {
                            ...node,
                            children: filteredChildren.length > 0 ? filteredChildren : node.children,
                        };
                    }
                    return null;
                })
                .filter(Boolean) as DataNode[];
        };

        return filterTree(treeData);
    }, [treeData, searchValue]);

    // 处理节点选择 - 始终触发选择和展开/收缩
    const handleSelect = (selectedKeys: React.Key[], info: any) => {
        const key = info.node.key as string;
        // 只在第一个 '-' 处分割，保留完整的 UUID
        const dashIndex = key.indexOf('-');
        const type = key.substring(0, dashIndex) as TreeNodeType;
        const id = key.substring(dashIndex + 1);

        // 点击时切换展开/收缩
        if (expandedKeys.includes(key)) {
            setExpandedKeys(expandedKeys.filter((k) => k !== key));
        } else {
            setExpandedKeys([...expandedKeys, key]);
        }

        // 始终触发选择
        if (type === 'org') {
            const findOrg = (nodes: OrganizationTreeNode[]): OrganizationTreeNode | null => {
                for (const node of nodes) {
                    if (node.id === id) return node;
                    if (node.children) {
                        const found = findOrg(node.children);
                        if (found) return found;
                    }
                }
                return null;
            };
            const org = orgTree ? findOrg(orgTree) : null;
            if (org) {
                onSelect?.({ id, type: 'org', name: org.name });
            }
        } else if (type === 'dept') {
            const dept = allDepartments?.find((d) => d.id === id);
            if (dept) {
                onSelect?.({ id, type: 'dept', name: dept.name, orgId: dept.organizationId });
            }
        }
    };

    // 处理展开（通过箭头图标展开）
    const handleExpand = (newExpandedKeys: React.Key[]) => {
        setExpandedKeys(newExpandedKeys);
    };

    // 创建组织
    const handleCreateOrg = async (values: CreateOrganizationDto) => {
        try {
            await createOrgMutation.mutateAsync(values);
            message.success('组织创建成功');
            setOrgModalOpen(false);
            return true;
        } catch (error) {
            message.error((error as Error).message || '创建失败');
            return false;
        }
    };

    // 创建部门
    const handleCreateDept = async (values: CreateDepartmentDto) => {
        try {
            await createDeptMutation.mutateAsync(values);
            message.success('部门创建成功');
            setDeptModalOpen(false);
            return true;
        } catch (error) {
            message.error((error as Error).message || '创建失败');
            return false;
        }
    };

    // 构建组织选择树
    const orgSelectTreeData = useMemo(() => {
        if (!orgTree) return [];

        const buildSelectNode = (org: OrganizationTreeNode): { value: string; title: string; children?: any[] } => ({
            value: org.id,
            title: org.name,
            children: org.children?.map(buildSelectNode),
        });

        return orgTree.map(buildSelectNode);
    }, [orgTree]);

    // 获取当前选中组织ID（用于新增部门时）
    const selectedOrgId = selectedNode?.type === 'org' ? selectedNode.id : selectedNode?.orgId;

    // 构建部门选择树 (Flat Mode)
    const deptSelectData = useMemo(() => {
        if (!selectedOrgId || !allDepartments) return [];
        return allDepartments
            .filter((d) => d.organizationId === selectedOrgId)
            .map((d) => ({
                id: d.id,
                pId: d.parentId,
                value: d.id,
                title: d.name,
                label: d.name,
            }));
    }, [allDepartments, selectedOrgId]);

    const isLoading = orgLoading;

    return (
        <Flex
            vertical
            style={{
                height: '100%',
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
                overflow: 'hidden',
            }}
        >
            {/* 头部 */}
            <Flex
                vertical
                gap={12}
                style={{
                    padding: 16,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Flex justify="space-between" align="center">
                    <span
                        style={{
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            color: token.colorTextSecondary,
                        }}
                    >
                        组织架构
                    </span>
                </Flex>
                <Input
                    placeholder="搜索组织或部门..."
                    prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    allowClear
                />
                {/* 显示所有层级员工开关 - 仅在提供了回调时显示 */}
                {onShowAllLevelsChange && (
                    <Flex justify="space-between" align="center">
                        <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                            包含下级员工
                        </span>
                        <Switch
                            size="small"
                            checked={!!showAllLevels}
                            onChange={onShowAllLevelsChange}
                        />
                    </Flex>
                )}
            </Flex>

            {/* 树形结构 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
                {isLoading ? (
                    <Flex justify="center" align="center" style={{ height: 200 }}>
                        <Spin />
                    </Flex>
                ) : filteredTreeData.length === 0 ? (
                    <Empty description="暂无组织数据" style={{ marginTop: 40 }} />
                ) : (
                    <Tree
                        showIcon
                        blockNode
                        treeData={filteredTreeData}
                        expandedKeys={expandedKeys}
                        onExpand={handleExpand}
                        onSelect={handleSelect}
                        selectedKeys={selectedNode ? [`${selectedNode.type}-${selectedNode.id}`] : []}
                        style={{ padding: '0 8px' }}
                    />
                )}
            </div>

            {/* 底部按钮 */}
            <Flex
                gap={8}
                style={{
                    padding: 16,
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Button
                    block
                    icon={<BankOutlined />}
                    onClick={() => setOrgModalOpen(true)}
                    disabled={selectedNode?.type === 'dept'}
                    title={selectedNode?.type === 'dept' ? '部门下不能新增公司' : '新增公司/子组织'}
                >
                    新增公司
                </Button>
                <Button
                    block
                    icon={<ApartmentOutlined />}
                    onClick={() => setDeptModalOpen(true)}
                    disabled={!selectedOrgId}
                    title={!selectedOrgId ? '请先选择一个组织' : '新增部门'}
                >
                    新增部门
                </Button>
            </Flex>

            {/* 新增组织弹窗 */}
            <ModalForm<CreateOrganizationDto>
                title={selectedNode?.type === 'org'
                    ? `新增子组织 - ${selectedNode.name}下`
                    : '新增公司/组织'}
                open={orgModalOpen}
                onOpenChange={setOrgModalOpen}
                onFinish={handleCreateOrg}
                modalProps={{ destroyOnClose: true, ...orgModalAutoFocusProps }}
                width={500}
                initialValues={selectedNode?.type === 'org' ? { parentId: selectedNode.id } : {}}
            >
                <div ref={orgContainerRef}>
                    {selectedNode?.type === 'org' && (
                        <div style={{
                            padding: '8px 12px',
                            background: token.colorInfoBg,
                            borderRadius: 6,
                            marginBottom: 16,
                            fontSize: 13
                        }}>
                            ℹ️ 新组织将创建为 <strong>{selectedNode.name}</strong> 的子组织
                        </div>
                    )}
                    <ProFormText
                        name="name"
                        label="组织名称"
                        placeholder="请输入组织名称"
                        rules={[{ required: true, message: '请输入组织名称' }]}
                        fieldProps={orgAutoFocusProps as any}
                    />
                    <ProFormText
                        name="code"
                        label="组织代码"
                        placeholder="如：HQ, REGION_EAST"
                        rules={[{ required: true, message: '请输入组织代码' }]}
                    />
                    <ProFormSelect
                        name="type"
                        label="组织类型"
                        options={orgTypeOptions}
                        initialValue="BRANCH"
                        rules={[{ required: true }]}
                    />
                    {/* 只有未选中组织时才显示上级组织选择 */}
                    {!selectedNode?.type && (
                        <ProFormTreeSelect
                            name="parentId"
                            label="上级组织"
                            placeholder="留空则为顶级组织"
                            fieldProps={{
                                treeData: orgSelectTreeData,
                                allowClear: true,
                                showSearch: true,
                                treeNodeFilterProp: 'title',
                            }}
                        />
                    )}
                    <ProFormTextArea name="description" label="描述" placeholder="可选" />
                    <ProFormDigit name="sortOrder" label="排序" initialValue={0} min={0} />
                </div>
            </ModalForm>

            {/* 新增部门弹窗 */}
            <ModalForm<CreateDepartmentDto>
                title={`新增部门 - ${selectedNode?.name || ''}`}
                open={deptModalOpen}
                onOpenChange={setDeptModalOpen}
                onFinish={handleCreateDept}
                modalProps={{ destroyOnClose: true, ...deptModalAutoFocusProps }}
                width={500}
                initialValues={{
                    organizationId: selectedOrgId,
                    parentId: selectedNode?.type === 'dept' ? selectedNode.id : undefined,
                }}
            >
                <div ref={deptContainerRef}>
                    {selectedNode && (
                        <div style={{
                            padding: '8px 12px',
                            background: token.colorInfoBg,
                            borderRadius: 6,
                            marginBottom: 16,
                            fontSize: 13
                        }}>
                            ℹ️ 新部门将创建在 <strong>{selectedNode.name}</strong> 下
                        </div>
                    )}
                    <DeptFormFields
                        isEdit={false}
                        hideOrgSelect={true}
                        hideStatus={true}
                        useSimpleMode={true}
                        treeData={deptSelectData}
                        autoFocusFieldProps={deptAutoFocusProps}
                    />
                </div>
            </ModalForm>
        </Flex>
    );
};

export default OrgDeptTree;

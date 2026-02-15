import React, { useMemo } from 'react';
import { TreeSelect, theme, Space, Tag } from 'antd';
import {
  BankOutlined,
  TeamOutlined,
  GlobalOutlined,
  ClusterOutlined,
  ShopOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import type { DefaultOptionType } from 'antd/es/select';
import { OrganizationTreeNode, OrganizationType } from '@packages/types';
import { useOrganizationTree } from '../api/organizations';
import { useDepartments } from '../api/departments';

export type OrgDeptTreeSelectMode = 'org' | 'dept' | 'both';

export interface OrgDeptTreeSelectProps {
  mode: OrgDeptTreeSelectMode;
  multiple?: boolean;
  value?: string[];
  onChange?: (ids: string[]) => void;
  showUserCount?: boolean;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  allowClear?: boolean;
  returnRawValue?: boolean; // 新增属性
}

interface UserCountMap {
  orgs: Map<string, number>;
  depts: Map<string, number>;
}

/**
 * 组织/部门树选择器
 * 支持选择组织、部门或两者，可显示各节点下的用户数量
 */
export const OrgDeptTreeSelect: React.FC<OrgDeptTreeSelectProps> = ({
  mode,
  multiple = true,
  value,
  onChange,
  showUserCount = true,
  placeholder,
  disabled = false,
  style,
  allowClear = true,
  returnRawValue = false,
}) => {
  const { token } = theme.useToken();
  const { data: orgTree, isLoading: orgLoading } = useOrganizationTree();
  const { data: allDepartments, isLoading: deptLoading } = useDepartments();

  // 计算每个组织和部门的用户数量
  const userCountMap = useMemo((): UserCountMap => {
    const orgs = new Map<string, number>();
    const depts = new Map<string, number>();

    if (allDepartments) {
      allDepartments.forEach((dept) => {
        // 假设 _count 字段包含用户数量
        const count = (dept as any)._count?.users || 0;
        depts.set(dept.id, count);

        // 累加到组织
        const orgId = dept.organizationId;
        orgs.set(orgId, (orgs.get(orgId) || 0) + count);
      });
    }

    return { orgs, depts };
  }, [allDepartments]);

  // 按组织预计算部门层级，避免构树时重复 filter
  const deptTreeMetaByOrg = useMemo(() => {
    const byOrg = new Map<string, { roots: any[]; childrenByParent: Map<string, any[]> }>();
    if (!allDepartments) return byOrg;

    for (const dept of allDepartments) {
      if (!byOrg.has(dept.organizationId)) {
        byOrg.set(dept.organizationId, {
          roots: [],
          childrenByParent: new Map<string, any[]>(),
        });
      }

      const orgMeta = byOrg.get(dept.organizationId)!;
      if (!dept.parentId) {
        orgMeta.roots.push(dept);
        continue;
      }

      if (!orgMeta.childrenByParent.has(dept.parentId)) {
        orgMeta.childrenByParent.set(dept.parentId, []);
      }
      orgMeta.childrenByParent.get(dept.parentId)!.push(dept);
    }

    return byOrg;
  }, [allDepartments]);

  // 获取组织类型图标
  const getOrgIcon = (type: OrganizationType) => {
    const iconStyle = { fontSize: 14, marginRight: 4 };
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

  // 构建树形数据
  const treeData = useMemo(() => {
    if (!orgTree) return [];

    const buildDeptNodes = (orgId: string): DefaultOptionType[] => {
      if (mode === 'org') return [];

      const orgMeta = deptTreeMetaByOrg.get(orgId);
      if (!orgMeta) return [];

      const buildDeptTree = (dept: any): DefaultOptionType => {
        const childDepts = orgMeta.childrenByParent.get(dept.id) || [];
        const userCount = userCountMap.depts.get(dept.id) || 0;
        const title = (
          <Space size={4}>
            <TeamOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
            <span>{dept.name}</span>
            {showUserCount && userCount > 0 && (
              <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>
                {userCount}人
              </Tag>
            )}
          </Space>
        );

        return {
          value: `dept-${dept.id}`,
          title,
          label: title,
          children: childDepts.length > 0 ? childDepts.map(buildDeptTree) : undefined,
          // disabled: mode === 'org', // This condition is always false here because of early return
        };
      };

      return orgMeta.roots.map(buildDeptTree);
    };

    const buildOrgNode = (org: OrganizationTreeNode): DefaultOptionType => {
      const children: DefaultOptionType[] = [];

      // 添加子组织
      if (org.children && org.children.length > 0) {
        children.push(...org.children.map(buildOrgNode));
      }

      // 添加该组织的部门
      if (mode !== 'org') {
        const deptNodes = buildDeptNodes(org.id);
        if (deptNodes.length > 0) {
          children.push(...deptNodes);
        }
      }

      const userCount = userCountMap.orgs.get(org.id) || 0;
      const title = (
        <Space size={4}>
          {getOrgIcon(org.type as OrganizationType)}
          <span>{org.name}</span>
          {showUserCount && userCount > 0 && (
            <Tag color="green" style={{ marginLeft: 4, fontSize: 11 }}>
              {userCount}人
            </Tag>
          )}
        </Space>
      );

      return {
        value: `org-${org.id}`,
        title,
        label: title,
        children: children.length > 0 ? children : undefined,
        disabled: mode === 'dept',
      };
    };

    return orgTree.map(buildOrgNode);
  }, [orgTree, deptTreeMetaByOrg, userCountMap, mode, showUserCount, token]);

  // 处理值变化
  const handleChange = (newValue: string | string[]) => {
    if (!onChange) return;

    const values = Array.isArray(newValue) ? newValue : newValue ? [newValue] : [];

    if (returnRawValue) {
      onChange(values);
      return;
    }

    // 提取实际ID（去除 org- 或 dept- 前缀）
    const ids = values.map((v) => {
      if (v.startsWith('org-')) return v.substring(4);
      if (v.startsWith('dept-')) return v.substring(5);
      return v;
    });

    onChange(ids);
  };

  // 将外部值转换为内部格式
  const internalValue = useMemo(() => {
    if (!value || value.length === 0) return undefined;

    const orgIdSet = new Set<string>();
    const collectOrgIds = (nodes: OrganizationTreeNode[]) => {
      for (const node of nodes) {
        orgIdSet.add(node.id);
        if (node.children?.length) {
          collectOrgIds(node.children);
        }
      }
    };
    if (orgTree?.length) {
      collectOrgIds(orgTree);
    }

    const deptIdSet = new Set((allDepartments || []).map((d) => d.id));

    return value.map((id) => {
      // 如果已经是原始格式（带前缀），直接返回
      if (returnRawValue && (id.startsWith('org-') || id.startsWith('dept-'))) {
        return id;
      }

      if (orgIdSet.has(id)) return `org-${id}`;
      if (deptIdSet.has(id)) return `dept-${id}`;

      return id;
    });
  }, [value, orgTree, allDepartments, returnRawValue]);

  const defaultPlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    switch (mode) {
      case 'org':
        return '请选择组织';
      case 'dept':
        return '请选择部门';
      default:
        return '请选择组织或部门';
    }
  }, [mode, placeholder]);

  return (
    <TreeSelect
      treeData={treeData}
      value={multiple ? internalValue : internalValue?.[0]}
      onChange={handleChange}
      placeholder={defaultPlaceholder}
      loading={orgLoading || deptLoading}
      disabled={disabled}
      style={{ width: '100%', ...style }}
      allowClear={allowClear}
      showSearch
      treeNodeFilterProp="title"
      multiple={multiple}
      treeCheckable={multiple}
      showCheckedStrategy={TreeSelect.SHOW_PARENT}
      treeDefaultExpandAll={false}
      treeDefaultExpandedKeys={orgTree?.slice(0, 2).map((o) => `org-${o.id}`)}
      dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
    />
  );
};

export default OrgDeptTreeSelect;

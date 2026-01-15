import React from 'react';
import {
    ProFormText,
    ProFormSelect,
    ProFormDigit,
    ProFormTextArea,
    ProFormTreeSelect,
} from '@ant-design/pro-components';

interface DeptFormFieldsProps {
    isEdit: boolean;
    orgOptions?: { value: string; label: string }[];
    treeData?: any[];
    orgIdForTree?: string;
    autoFocusFieldProps?: any;
    /** 隐藏组织选择器（统一管理场景下组织已确定） */
    hideOrgSelect?: boolean;
    /** 隐藏状态选择器（新建时可省略） */
    hideStatus?: boolean;
    /** 使用 treeDataSimpleMode 模式（统一管理使用扁平数据） */
    useSimpleMode?: boolean;
}

export const DeptFormFields: React.FC<DeptFormFieldsProps> = ({
    isEdit,
    orgOptions = [],
    treeData = [],
    orgIdForTree,
    autoFocusFieldProps,
    hideOrgSelect = false,
    hideStatus = false,
    useSimpleMode = false,
}) => {
    return (
        <>
            <ProFormText
                name="name"
                label="部门名称"
                placeholder="请输入部门名称"
                rules={[{ required: true, message: '请输入部门名称' }]}
                fieldProps={autoFocusFieldProps}
            />
            <ProFormText
                name="code"
                label="部门编码"
                placeholder="如：HR, IT"
                rules={[{ required: true, message: '请输入部门编码' }]}
                disabled={isEdit}
            />
            {!hideOrgSelect && (
                <ProFormSelect
                    name="organizationId"
                    label="所属组织"
                    placeholder="请选择所属组织"
                    rules={[{ required: true, message: '请选择所属组织' }]}
                    disabled={isEdit}
                    options={orgOptions}
                />
            )}
            <ProFormTreeSelect
                name="parentId"
                label="上级部门"
                placeholder="请选择上级部门（可选）"
                disabled={!hideOrgSelect && !orgIdForTree}
                fieldProps={{
                    treeData,
                    treeDataSimpleMode: useSimpleMode,
                    treeDefaultExpandAll: true,
                    allowClear: true,
                    showSearch: true,
                    treeNodeFilterProp: 'title',
                }}
            />
            <ProFormDigit
                name="sortOrder"
                label="排序"
                placeholder="请输入排序号"
                initialValue={0}
                min={0}
            />
            {!hideStatus && (
                <ProFormSelect
                    name="status"
                    label="状态"
                    options={[
                        { value: 'ACTIVE', label: '启用' },
                        { value: 'INACTIVE', label: '禁用' },
                    ]}
                />
            )}
            <ProFormTextArea name="description" label="描述" placeholder="可选" />
        </>
    );
};

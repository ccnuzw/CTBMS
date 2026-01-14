import React from 'react';
import {
    ProFormText,
    ProFormSelect,
    ProFormDigit,
    ProFormTextArea,
    ProFormTreeSelect,
} from '@ant-design/pro-components';
import { Form } from 'antd';

interface DeptFormFieldsProps {
    isEdit: boolean;
    orgOptions: { value: string; label: string }[];
    treeData: any[];
    orgIdForTree?: string;
    autoFocusFieldProps?: any;
    // For handling form references if needed, though mostly context is sufficient
}

export const DeptFormFields: React.FC<DeptFormFieldsProps> = ({
    isEdit,
    orgOptions,
    treeData,
    orgIdForTree,
    autoFocusFieldProps,
}) => {
    return (
        <>
            <ProFormText
                name="name"
                label="部门名称"
                placeholder="请输入名称"
                rules={[{ required: true, message: '请输入名称' }]}
                fieldProps={autoFocusFieldProps}
            />
            <ProFormText
                name="code"
                label="部门编码"
                placeholder="请输入编码"
                rules={[{ required: true, message: '请输入编码' }]}
                disabled={isEdit}
            />
            <ProFormSelect
                name="organizationId"
                label="所属组织"
                placeholder="请选择所属组织"
                rules={[{ required: true, message: '请选择所属组织' }]}
                disabled={isEdit}
                options={orgOptions}
            />
            <ProFormTreeSelect
                name="parentId"
                label="上级部门"
                placeholder="请选择上级部门（可选）"
                disabled={!orgIdForTree}
                fieldProps={{
                    treeData,
                    treeDefaultExpandAll: true,
                    allowClear: true,
                    showSearch: true,
                    treeNodeFilterProp: 'title',
                }}
            />
            <ProFormDigit name="sortOrder" label="排序" placeholder="请输入排序号" />
            <ProFormSelect
                name="status"
                label="状态"
                options={[
                    { value: 'ACTIVE', label: '启用' },
                    { value: 'INACTIVE', label: '禁用' },
                ]}
            />
            <ProFormTextArea name="description" label="描述" placeholder="请输入描述" />
        </>
    );
};

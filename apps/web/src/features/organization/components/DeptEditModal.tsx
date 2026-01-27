import React, { useMemo, useEffect } from 'react';
import { Form } from 'antd';
import { ModalForm } from '@ant-design/pro-components';
import { CreateDepartmentDto, DepartmentTreeNode, DepartmentDto } from '@packages/types';
import { useDepartmentTree } from '../api/departments';
import { DeptFormFields } from './DeptFormFields';
import { useModalAutoFocus } from '../../../hooks/useModalAutoFocus';

interface DepartmentWithRelations extends DepartmentDto {
    organization?: { id: string; name: string };
    parent?: DepartmentDto | null;
}

interface DeptEditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onFinish: (values: CreateDepartmentDto) => Promise<boolean>;
    initialValues?: DepartmentWithRelations;
    orgOptions: { value: string; label: string }[];
}

// Helper to convert tree data (could be moved to utils)
const convertToTreeSelectData = (
    nodes: DepartmentTreeNode[],
    excludeId?: string,
): any[] => {
    return nodes
        .filter((node) => node.id !== excludeId)
        .map((node) => ({
            value: node.id,
            title: node.name,
            label: node.name,
            children: node.children?.length
                ? convertToTreeSelectData(node.children, excludeId)
                : undefined,
        }));
};

export const DeptEditModal: React.FC<DeptEditModalProps> = ({
    open,
    onOpenChange,
    onFinish,
    initialValues,
    orgOptions,
}) => {
    const [form] = Form.useForm<CreateDepartmentDto>();
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    // Watch organizationId to fetch corresponding department tree
    const orgIdFromForm = Form.useWatch('organizationId', form);
    // Use initialValues orgId if form value is not yet set (e.g. on first render)
    const activeOrgId = orgIdFromForm || initialValues?.organizationId;

    // Fetch department tree for the selected organization
    const { data: deptTree } = useDepartmentTree(activeOrgId || '', !!activeOrgId);

    // Prepare tree data for selector
    const treeData = useMemo(() => {
        if (!deptTree) return [];
        return convertToTreeSelectData(deptTree, initialValues?.id);
    }, [deptTree, initialValues?.id]);

    // Force reset form when opening
    useEffect(() => {
        if (open) {
            form.resetFields();
            form.setFieldsValue(initialValues || { status: 'ACTIVE', sortOrder: 0 });
        }
    }, [open, initialValues, form]);

    return (
        <ModalForm<CreateDepartmentDto>
            title={initialValues ? '编辑部门' : '新建部门'}
            width="500px"
            open={open}
            onOpenChange={onOpenChange}
            form={form}
            onFinish={onFinish}
            initialValues={initialValues || { status: 'ACTIVE', sortOrder: 0 }}
            modalProps={{
                ...modalProps,
                destroyOnClose: true,
                focusTriggerAfterClose: false,
                afterClose: () => form.resetFields(),
            }}
        >
            <div ref={containerRef}>
                <DeptFormFields
                    isEdit={!!initialValues}
                    orgOptions={orgOptions}
                    treeData={treeData}
                    orgIdForTree={activeOrgId}
                    autoFocusFieldProps={autoFocusFieldProps}
                />
            </div>
        </ModalForm>
    );
};

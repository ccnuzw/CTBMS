import React from 'react';
import { Menu, theme } from 'antd';
import { CopyOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';

interface NodeContextMenuProps {
    id: string;
    top: number;
    left: number;
    onCopy: () => void;
    onDelete: () => void;
    onSaveTemplate: () => void;
    onClose: () => void;
}

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
    id,
    top,
    left,
    onCopy,
    onDelete,
    onSaveTemplate,
    onClose,
}) => {
    const { token } = theme.useToken();

    // Close menu when clicking outside (handled by parent overlay usually, or here via simplified approach)
    // We'll rely on parent WorkflowCanvas to mount/unmount this based on visibility state.

    const items = [
        {
            key: 'node-id',
            label: `节点: ${id}`,
            disabled: true,
        },
        {
            key: 'copy',
            label: '复制节点 (Copy)',
            icon: <CopyOutlined />,
            onClick: () => {
                onCopy();
                onClose();
            },
        },
        {
            key: 'save-template',
            label: '存为模板 (Save as Template)',
            icon: <SaveOutlined />,
            onClick: () => {
                onSaveTemplate();
                onClose();
            },
        },
        {
            type: 'divider',
        },
        {
            key: 'delete',
            label: '删除节点 (Delete)',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => {
                onDelete();
                onClose();
            },
        },
    ];

    return (
        <div
            style={{
                position: 'absolute',
                top,
                left,
                zIndex: 1000,
                borderRadius: token.borderRadiusLG,
                overflow: 'hidden',
                boxShadow: token.boxShadowSecondary,
                background: token.colorBgElevated,
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <Menu
                items={items as any}
                mode="vertical"
                style={{ width: 220, border: 'none' }}
                selectable={false}
            />
        </div>
    );
};

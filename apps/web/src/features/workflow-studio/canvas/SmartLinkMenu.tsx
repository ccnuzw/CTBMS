import React, { useMemo } from 'react';
import { Menu, theme } from 'antd';
import {
    getNodeTypeConfig,
    type NodeTypeConfig,
} from './nodeTypeRegistry';

interface SmartLinkMenuProps {
    top: number;
    left: number;
    sourceNodeType: string;
    onSelect: (nodeType: string) => void;
    onClose: () => void;
}

export const SmartLinkMenu: React.FC<SmartLinkMenuProps> = ({
    top,
    left,
    sourceNodeType,
    onSelect,
    onClose,
}) => {
    const { token } = theme.useToken();

    const recommendedNodes = useMemo(() => {
        const sourceConfig = getNodeTypeConfig(sourceNodeType);
        if (!sourceConfig?.recommendedNextNodes) {
            return [];
        }
        return sourceConfig.recommendedNextNodes
            .map((type) => getNodeTypeConfig(type))
            .filter((config): config is NodeTypeConfig => !!config);
    }, [sourceNodeType]);

    if (recommendedNodes.length === 0) {
        return null;
    }

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1000,
                }}
                onClick={onClose}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onClose();
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top,
                    left,
                    zIndex: 1001,
                    background: token.colorBgElevated,
                    borderRadius: token.borderRadiusLG,
                    boxShadow: token.boxShadowSecondary,
                    minWidth: 160,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        padding: '8px 12px',
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        fontSize: 12,
                        color: token.colorTextSecondary,
                        background: token.colorBgLayout,
                    }}
                >
                    推荐后续节点
                </div>
                <Menu
                    mode="vertical"
                    selectable={false}
                    style={{ border: 'none' }}
                    items={recommendedNodes.map((node) => ({
                        key: node.type,
                        icon: <node.icon />,
                        label: node.label,
                        onClick: () => onSelect(node.type),
                    }))}
                />
            </div>
        </>
    );
};

import React, { memo } from 'react';
import { NodeProps, NodeResizer } from '@xyflow/react';
import { theme } from 'antd';
import { GroupOutlined } from '@ant-design/icons';

export const GroupNode: React.FC<NodeProps> = memo(({ data, selected }) => {
    const { token } = theme.useToken();
    const config = (data.config as Record<string, unknown>) || {};
    const label = (config.label as string) || 'Group';

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(240, 240, 240, 0.25)',
                border: selected ? `2px solid ${token.colorPrimary}` : `2px dashed ${token.colorBorder}`,
                borderRadius: token.borderRadiusLG,
                position: 'relative',
                padding: 10,
                transition: 'all 0.2s',
            }}
        >
            <NodeResizer
                isVisible={selected}
                minWidth={100}
                minHeight={100}
                lineStyle={{ border: `1px solid ${token.colorPrimary}` }}
                handleStyle={{ width: 8, height: 8, borderRadius: 2 }}
            />

            <div
                style={{
                    position: 'absolute',
                    top: -24,
                    left: 0,
                    padding: '2px 8px',
                    backgroundColor: selected ? token.colorPrimary : token.colorFillSecondary,
                    color: selected ? '#fff' : token.colorTextSecondary,
                    borderRadius: token.borderRadiusSM,
                    fontSize: 12,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                }}
            >
                <GroupOutlined />
                {label}
            </div>

            {/* The content of the group is rendered by React Flow as child nodes, 
                so we don't need to render children property here. 
                Visual structure only. */}
        </div>
    );
});

GroupNode.displayName = 'GroupNode';

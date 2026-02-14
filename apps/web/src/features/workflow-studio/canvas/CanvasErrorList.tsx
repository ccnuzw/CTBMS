import React, { useState } from 'react';
import { Card, List, Typography, Badge, Button, Tooltip, theme } from 'antd';
import { CloseOutlined, WarningOutlined, AimOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface ValidationError {
    message: string;
    nodeId?: string;
    edgeId?: string;
    severity?: 'ERROR' | 'WARNING';
}

interface CanvasErrorListProps {
    errors: ValidationError[];
    onFocusNode?: (nodeId: string) => void;
    onFocusEdge?: (edgeId: string) => void;
}

export const CanvasErrorList: React.FC<CanvasErrorListProps> = ({ errors, onFocusNode, onFocusEdge }) => {
    const { token } = theme.useToken();
    const [expanded, setExpanded] = useState(true);

    if (errors.length === 0) return null;

    const errorCount = errors.filter(e => e.severity !== 'WARNING').length;
    const warningCount = errors.length - errorCount;

    return (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, width: 320 }}>
            {expanded ? (
                <Card
                    size="small"
                    title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Badge count={errors.length} showZero={false}>
                                    <WarningOutlined style={{ color: token.colorError, fontSize: 16 }} />
                                </Badge>
                                <span style={{ marginLeft: 8 }}>Validation Issues</span>
                            </div>
                            <Button
                                type="text"
                                size="small"
                                icon={<UpOutlined />}
                                onClick={() => setExpanded(false)}
                            />
                        </div>
                    }
                    bodyStyle={{ padding: 0, maxHeight: 400, overflowY: 'auto' }}
                    style={{ boxShadow: token.boxShadowSecondary }}
                >
                    <List
                        size="small"
                        dataSource={errors}
                        renderItem={(item) => (
                            <List.Item
                                actions={[
                                    (item.nodeId || item.edgeId) && (
                                        <Tooltip title="Locate on Canvas">
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<AimOutlined />}
                                                onClick={() => {
                                                    if (item.nodeId) onFocusNode?.(item.nodeId);
                                                    else if (item.edgeId) onFocusEdge?.(item.edgeId);
                                                }}
                                            />
                                        </Tooltip>
                                    )
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <WarningOutlined
                                            style={{ color: item.severity === 'WARNING' ? token.colorWarning : token.colorError }}
                                        />
                                    }
                                    title={
                                        <Text style={{ fontSize: 13 }}>
                                            {item.nodeId ? `Node: ${item.nodeId}` : (item.edgeId ? `Edge: ${item.edgeId}` : 'Global')}
                                        </Text>
                                    }
                                    description={
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {item.message}
                                        </Text>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                </Card>
            ) : (
                <Card
                    size="small"
                    bodyStyle={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onClick={() => setExpanded(true)}
                    style={{ boxShadow: token.boxShadowSecondary }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge count={errors.length} />
                        <span style={{ fontWeight: 500 }}>Validation Issues</span>
                    </div>
                    <DownOutlined />
                </Card>
            )}
        </div>
    );
};

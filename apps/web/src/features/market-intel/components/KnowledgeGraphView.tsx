import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { Spin, Empty, Card, Space, Button, theme } from 'antd';
import { ReloadOutlined, ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import screenfull from 'screenfull';

interface KnowledgeGraphViewProps {
    intelId?: string;
    height?: number;
}

interface GraphNode {
    id: string;
    name: string;
    type: string;
    group: string;
    val?: number; // Size
}

interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    type: string;
    weight?: number;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({ intelId, height = 500 }) => {
    const fgRef = useRef<ForceGraphMethods>();
    const containerRef = useRef<HTMLDivElement>(null);
    const { token } = theme.useToken();
    const [dimensions, setDimensions] = useState({ width: 800, height });

    const { data, isLoading, refetch } = useQuery(
        ['knowledge-graph', intelId],
        async () => {
            const response = await axios.get<GraphData>('/api/v1/knowledge/graph', {
                params: { intelId, limit: 200 }
            });
            return response.data;
        },
        {
            enabled: !!intelId,
            refetchOnWindowFocus: false,
        }
    );

    useEffect(() => {
        // Dynamic resize
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: height || containerRef.current.clientHeight,
                });
            }
        };

        window.addEventListener('resize', updateDimensions);
        updateDimensions();

        return () => window.removeEventListener('resize', updateDimensions);
    }, [height]);

    const handleZoomIn = () => {
        fgRef.current?.zoom((fgRef.current.zoom() || 1) * 1.2, 400);
    };

    const handleZoomOut = () => {
        fgRef.current?.zoom((fgRef.current.zoom() || 1) / 1.2, 400);
    };

    const handleFit = () => {
        fgRef.current?.zoomToFit(400, 10);
    };

    const handleFullscreen = () => {
        if (containerRef.current && screenfull.isEnabled) {
            screenfull.request(containerRef.current);
        }
    };

    if (isLoading) {
        return (
            <div style={{ height, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Spin tip="Loading Graph..." />
            </div>
        );
    }

    if (!data || data.nodes.length === 0) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无知识图谱数据"
                style={{ margin: '50px 0' }}
            />
        );
    }

    const getNodeColor = (node: GraphNode) => {
        switch (node.type) {
            case 'COMMODITY': return token.colorSuccess;
            case 'REGION': return token.colorWarning;
            case 'ORGANIZATION': return token.colorPrimary;
            case 'EVENT': return token.colorError;
            case 'FACTOR': return token.colorInfo;
            default: return token.colorTextSecondary;
        }
    };

    return (
        <Card
            title="知识图谱 (Knowledge Graph)"
            size="small"
            extra={
                <Space>
                    <Button icon={<ZoomInOutlined />} size="small" onClick={handleZoomIn} />
                    <Button icon={<ZoomOutOutlined />} size="small" onClick={handleZoomOut} />
                    <Button icon={<FullscreenOutlined />} size="small" onClick={handleFullscreen} />
                    <Button icon={<ReloadOutlined />} size="small" onClick={() => { refetch(); handleFit(); }} />
                </Space>
            }
            bodyStyle={{ padding: 0, position: 'relative' }}
        >
            <div ref={containerRef} style={{ width: '100%', height: dimensions.height, overflow: 'hidden' }}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={data}
                    nodeLabel="name"
                    nodeColor={getNodeColor as any}
                    nodeRelSize={6}
                    linkColor={() => token.colorBorder}
                    linkWidth={link => (link.weight || 1) * 1.5}
                    linkDirectionalArrowLength={3.5}
                    linkDirectionalArrowRelPos={1}
                    cooldownTicks={100}
                    onEngineStop={() => fgRef.current?.zoomToFit(400)}
                    backgroundColor={token.colorBgContainer}
                />
            </div>
            <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(255,255,255,0.7)', padding: 5, borderRadius: 4, fontSize: 12 }}>
                <Space size="small">
                    <span style={{ color: token.colorSuccess }}>● 品种</span>
                    <span style={{ color: token.colorWarning }}>● 地域</span>
                    <span style={{ color: token.colorPrimary }}>● 机构</span>
                    <span style={{ color: token.colorError }}>● 事件</span>
                    <span style={{ color: token.colorInfo }}>● 因素</span>
                </Space>
            </div>
        </Card>
    );
};

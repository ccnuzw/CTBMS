import React, { useMemo, useState, useEffect } from 'react';
import { theme } from 'antd';
import {
    EnvironmentOutlined,
    RocketOutlined,
    ThunderboltOutlined,
    ReloadOutlined,
    CompassOutlined,
    AimOutlined,
    PlayCircleOutlined,
    CloseOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { EnterpriseResponse, EnterpriseType } from '@packages/types';
import { optimizeLogisticsRoute } from '../services/aiService';

const { useToken } = theme;

interface GeoMapProps {
    enterprises: EnterpriseResponse[];
    onSelectEnterprise: (ent: EnterpriseResponse) => void;
}

// 简单的投影逻辑 Hook
const useMapProjection = (enterprises: EnterpriseResponse[], width: number, height: number, padding: number) => {
    return useMemo(() => {
        const validEnts = enterprises.filter(e => e.longitude != null && e.latitude != null);

        if (validEnts.length === 0) {
            return { getCoords: () => ({ x: width / 2, y: height / 2 }), bounds: null };
        }

        const lons = validEnts.map(e => e.longitude!);
        const lats = validEnts.map(e => e.latitude!);

        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);

        const lonRange = maxLon - minLon || 1; // 避免除以0
        const latRange = maxLat - minLat || 1;

        const getCoords = (ent: EnterpriseResponse) => {
            if (ent.longitude == null || ent.latitude == null) return null;

            // X轴: 经度 (Left -> Right)
            const x = padding + ((ent.longitude - minLon) / lonRange) * (width - padding * 2);

            // Y轴: 纬度 (Bottom -> Top, 所以在 SVG 中需要反转: HEIGHT - y)
            const y = height - (padding + ((ent.latitude - minLat) / latRange) * (height - padding * 2));

            return { x, y };
        };

        return { getCoords, bounds: { minLon, maxLon, minLat, maxLat } };

    }, [enterprises, width, height, padding]);
};

export const GeoMap: React.FC<GeoMapProps> = ({ enterprises, onSelectEnterprise }) => {
    const { token } = useToken();

    // Map State
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [mapMode, setMapMode] = useState<'explore' | 'route'>('explore');
    const [showFlows, setShowFlows] = useState(false);

    // Route State
    const [routeNodes, setRouteNodes] = useState<EnterpriseResponse[]>([]);
    const [optimizationResult, setOptimizationResult] = useState<{ strategy: string; savedDistance: string } | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);

    // Constants
    const MAP_WIDTH = 1000;
    const MAP_HEIGHT = 600;
    const PADDING = 50;
    const RADIUS_500KM_PX = 150; // 示意半径，非真实比例

    // ViewBox
    const [viewBox, setViewBox] = useState(`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
    const [isZoomed, setIsZoomed] = useState(false);

    const helper = useMapProjection(enterprises, MAP_WIDTH, MAP_HEIGHT, PADDING);
    const selectedEnterprise = enterprises.find(e => e.id === selectedNodeId);

    // 1. Zoom Logic
    const resetZoom = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setViewBox(`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
        setIsZoomed(false);
    };

    const focusOnGroup = (group: EnterpriseResponse) => {
        // 简单实现：聚焦到集团中心点，放大2倍
        const coords = helper.getCoords(group);
        if (!coords) return;

        const zoomWidth = MAP_WIDTH / 2;
        const zoomHeight = MAP_HEIGHT / 2;
        const x = Math.max(0, Math.min(coords.x - zoomWidth / 2, MAP_WIDTH - zoomWidth));
        const y = Math.max(0, Math.min(coords.y - zoomHeight / 2, MAP_HEIGHT - zoomHeight));

        setViewBox(`${x} ${y} ${zoomWidth} ${zoomHeight}`);
        setIsZoomed(true);
    };

    // 2. Interaction
    const handleNodeClick = (e: React.MouseEvent, ent: EnterpriseResponse) => {
        e.stopPropagation();

        if (mapMode === 'route') {
            if (routeNodes.find(n => n.id === ent.id)) {
                setRouteNodes(routeNodes.filter(n => n.id !== ent.id));
                setOptimizationResult(null);
            } else {
                if (routeNodes.length >= 6) return;
                setRouteNodes([...routeNodes, ent]);
                setOptimizationResult(null);
            }
        } else {
            setSelectedNodeId(ent.id);
            onSelectEnterprise(ent);
            if (ent.types.includes(EnterpriseType.GROUP)) {
                focusOnGroup(ent);
            }
        }
    };

    const handleOptimizeRoute = async () => {
        if (routeNodes.length < 3) return;
        setIsOptimizing(true);
        const result = await optimizeLogisticsRoute(routeNodes);

        const newOrder = result.optimizedIndices.map(idx => routeNodes[idx]);
        setRouteNodes(newOrder);
        setOptimizationResult({
            strategy: result.strategy,
            savedDistance: result.savedDistance
        });
        setIsOptimizing(false);
    };

    const clearRoute = () => {
        setRouteNodes([]);
        setOptimizationResult(null);
    };

    // 绘制样式
    const getNodeColor = (ent: EnterpriseResponse) => {
        if (ent.types.includes(EnterpriseType.GROUP)) return token.colorPrimary; // Purple-ish usually, using primary here
        if (ent.types.includes(EnterpriseType.SUPPLIER)) return token.colorWarning;
        if (ent.types.includes(EnterpriseType.CUSTOMER)) return token.colorSuccess;
        if (ent.types.includes(EnterpriseType.LOGISTICS)) return token.colorInfo;
        return token.colorTextSecondary;
    };

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: 600,
                backgroundColor: token.colorBgLayout,
                borderRadius: token.borderRadiusLG,
                overflow: 'hidden',
                border: `1px solid ${token.colorBorderSecondary}`
            }}
        >
            {/* Control Panel */}
            <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ background: token.colorBgContainer, padding: 8, borderRadius: token.borderRadius, boxShadow: token.boxShadowSecondary, display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => { setMapMode('explore'); clearRoute(); }}
                        style={{
                            border: 'none', background: mapMode === 'explore' ? token.colorPrimaryBg : 'transparent',
                            color: mapMode === 'explore' ? token.colorPrimary : token.colorTextSecondary,
                            padding: '4px 12px', borderRadius: token.borderRadiusSM, cursor: 'pointer', fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: 4
                        }}
                    >
                        <CompassOutlined /> 探索模式
                    </button>
                    <button
                        onClick={() => { setMapMode('route'); setSelectedNodeId(null); }}
                        style={{
                            border: 'none', background: mapMode === 'route' ? token.colorPrimaryBg : 'transparent',
                            color: mapMode === 'route' ? token.colorPrimary : token.colorTextSecondary,
                            padding: '4px 12px', borderRadius: token.borderRadiusSM, cursor: 'pointer', fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: 4
                        }}
                    >
                        <RocketOutlined /> 路径规划
                    </button>
                    <button
                        onClick={() => setShowFlows(!showFlows)}
                        style={{
                            border: 'none', background: showFlows ? token.colorWarningBg : 'transparent',
                            color: showFlows ? token.colorWarning : token.colorTextSecondary,
                            padding: '4px 12px', borderRadius: token.borderRadiusSM, cursor: 'pointer', fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: 4
                        }}
                    >
                        <ThunderboltOutlined /> 物流热力
                    </button>
                </div>

                {isZoomed && (
                    <button
                        onClick={resetZoom}
                        style={{
                            border: 'none', background: token.colorBgContainer,
                            color: token.colorText, padding: '8px 12px', borderRadius: token.borderRadius,
                            boxShadow: token.boxShadowSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content'
                        }}
                    >
                        <AimOutlined /> 重置视图
                    </button>
                )}

                {/* Info Panel - Explore */}
                {mapMode === 'explore' && selectedEnterprise && (
                    <div style={{ background: token.colorBgContainer, padding: 12, borderRadius: token.borderRadius, boxShadow: token.boxShadow, borderLeft: `4px solid ${token.colorPrimary}`, width: 240 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{selectedEnterprise.name}</div>
                        <div style={{ fontSize: 12, color: token.colorTextDescription }}>
                            {[selectedEnterprise.province, selectedEnterprise.city].filter(Boolean).join(' ')}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12, color: token.colorSuccess, background: token.colorSuccessBg, padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ExclamationCircleOutlined /> 发现潜在商机 (500km内)
                        </div>
                    </div>
                )}

                {/* Info Panel - Route */}
                {mapMode === 'route' && (
                    <div style={{ background: token.colorBgContainer, padding: 16, borderRadius: token.borderRadius, boxShadow: token.boxShadow, width: 300 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontWeight: 'bold' }}>智能多点路径规划</span>
                            {routeNodes.length > 0 && <CloseOutlined onClick={clearRoute} style={{ cursor: 'pointer', color: token.colorTextQuaternary }} />}
                        </div>

                        {routeNodes.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', border: `1px dashed ${token.colorBorder}`, borderRadius: token.borderRadius, color: token.colorTextDescription, fontSize: 12 }}>
                                请在地图上依次点击节点<br />添加起点、途经点、终点
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                                {routeNodes.map((node, idx) => (
                                    <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{
                                            width: 18, height: 18, borderRadius: '50%', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: idx === 0 ? token.colorSuccess : (idx === routeNodes.length - 1 ? token.colorError : token.colorPrimary)
                                        }}>
                                            {idx + 1}
                                        </div>
                                        <div style={{ flex: 1, padding: 8, borderRadius: 4, border: `1px solid ${token.colorBorderSecondary}`, fontSize: 12 }}>
                                            <div style={{ fontWeight: 500 }}>{node.shortName || node.name}</div>
                                            <div style={{ fontSize: 10, color: token.colorTextDescription }}>
                                                {idx === 0 ? '起点' : (idx === routeNodes.length - 1 ? '终点' : '途经点')}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {routeNodes.length >= 3 && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                                {!optimizationResult ? (
                                    <button
                                        onClick={handleOptimizeRoute}
                                        disabled={isOptimizing}
                                        style={{
                                            width: '100%', padding: '6px 0', background: token.colorPrimary, color: '#fff', border: 'none',
                                            borderRadius: token.borderRadius, cursor: isOptimizing ? 'wait' : 'pointer', opacity: isOptimizing ? 0.7 : 1
                                        }}
                                    >
                                        {isOptimizing ? <ReloadOutlined spin /> : <ThunderboltOutlined />} {isOptimizing ? '计算中...' : 'AI 智能路线优化'}
                                    </button>
                                ) : (
                                    <div>
                                        <div style={{ color: token.colorSuccess, fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>
                                            <PlayCircleOutlined /> 路线已优化
                                        </div>
                                        <div style={{ background: token.colorFillAlter, padding: 8, borderRadius: 4, fontSize: 12 }}>
                                            <div style={{ color: token.colorPrimaryText, fontWeight: 'bold' }}>优化策略:</div>
                                            <div style={{ color: token.colorTextSecondary, marginBottom: 4 }}>{optimizationResult.strategy}</div>
                                            <div style={{ textAlign: 'right', color: token.colorSuccessText, fontWeight: 'bold' }}>
                                                预计节省: {optimizationResult.savedDistance}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Map Canvas */}
            <svg
                viewBox={viewBox}
                style={{ width: '100%', height: '100%', cursor: 'default', transition: 'all 0.5s ease' }}
                onClick={resetZoom}
            >
                {/* Grid Background */}
                <defs>
                    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" fill="none" stroke={token.colorBorderSecondary} strokeWidth="0.5" strokeOpacity="0.5" />
                    </pattern>
                    <linearGradient id="mapBg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={token.colorBgLayout} />
                        <stop offset="100%" stopColor={token.colorBgContainer} />
                    </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#mapBg)" />
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Route Path Lines */}
                {routeNodes.length > 1 && routeNodes.map((node, idx) => {
                    if (idx === routeNodes.length - 1) return null;
                    const nextNode = routeNodes[idx + 1];
                    const p1 = helper.getCoords(node);
                    const p2 = helper.getCoords(nextNode);
                    if (!p1 || !p2) return null;

                    return (
                        <g key={`path-${idx}`}>
                            <line
                                x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                                stroke={optimizationResult ? token.colorSuccess : token.colorPrimary}
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeDasharray="8,4"
                                opacity="0.8"
                            />
                        </g>
                    );
                })}

                {/* Group Hierarchies (Explore Mode) - Only when explicitly clicked on a group */}
                {mapMode === 'explore' && selectedNodeId && enterprises
                    .filter(e => e.id === selectedNodeId && e.types.includes(EnterpriseType.GROUP))
                    .map(group => {
                        const p1 = helper.getCoords(group);
                        if (!p1 || !group.children || group.children.length === 0) return null;

                        return group.children.map((child) => {
                            // Only draw line if child has valid coordinates
                            const childEnt = child as EnterpriseResponse;
                            if (!childEnt.longitude || !childEnt.latitude) return null;

                            const p2 = helper.getCoords(childEnt);
                            if (!p2) return null;

                            return (
                                <line
                                    key={`link-${group.id}-${childEnt.id}`}
                                    x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                                    stroke={token.colorPrimary}
                                    strokeWidth="2"
                                    strokeDasharray="4,4"
                                    opacity="0.6"
                                />
                            );
                        });
                    })
                }

                {/* Nodes */}
                {enterprises.map(ent => {
                    const coords = helper.getCoords(ent);
                    if (!coords) return null;

                    const isSelected = selectedNodeId === ent.id;
                    const isHovered = hoveredNodeId === ent.id;
                    const routeIndex = routeNodes.findIndex(n => n.id === ent.id);
                    const isInRoute = routeIndex !== -1;

                    let radius = 6;
                    let stroke = '#fff';
                    let strokeWidth = 2;

                    if (isInRoute) {
                        radius = 10;
                        strokeWidth = 3;
                        if (routeIndex === 0) stroke = token.colorSuccess;
                        else if (routeIndex === routeNodes.length - 1) stroke = token.colorError;
                        else stroke = token.colorPrimary;
                    } else if (isSelected) {
                        radius = 12;
                        strokeWidth = 3;
                        stroke = token.colorPrimaryBorder;
                    } else if (isHovered) {
                        radius = 8;
                    }

                    // Explore Mode: 500km Radius visual
                    const showRadius = mapMode === 'explore' && isSelected;

                    return (
                        <g
                            key={ent.id}
                            style={{ cursor: 'pointer', transition: 'all 0.3s' }}
                            onClick={(e) => handleNodeClick(e, ent)}
                            onMouseEnter={() => setHoveredNodeId(ent.id)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                        >
                            {showRadius && (
                                <circle
                                    cx={coords.x} cy={coords.y} r={RADIUS_500KM_PX}
                                    fill={token.colorSuccessBg} fillOpacity="0.2" stroke={token.colorSuccess} strokeWidth="1" strokeDasharray="4,4"
                                />
                            )}

                            <circle
                                cx={coords.x} cy={coords.y} r={radius}
                                fill={getNodeColor(ent)}
                                stroke={stroke} strokeWidth={strokeWidth}
                            />

                            {/* Labels */}
                            {(isSelected || isHovered || isInRoute) && (
                                <text
                                    x={coords.x} y={coords.y - radius - 8}
                                    textAnchor="middle"
                                    fontSize="10"
                                    fontWeight="bold"
                                    fill={token.colorText}
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {ent.shortName || ent.name}
                                </text>
                            )}

                            {isInRoute && (
                                <text
                                    x={coords.x} y={coords.y}
                                    textAnchor="middle" dy=".3em"
                                    fontSize="8" fill="#fff" fontWeight="bold"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {routeIndex + 1}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Legend */}
            <div style={{ position: 'absolute', bottom: 16, right: 16, background: token.colorBgElevated, padding: 8, borderRadius: token.borderRadius, fontSize: 10, display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none', boxShadow: token.boxShadowSecondary }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorSuccess }}></div> 客户</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorWarning }}></div> 供应商</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorInfo }}></div> 物流商</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorPrimary }}></div> 集团</div>
            </div>
        </div>
    );
};

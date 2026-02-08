import React, { useMemo, useState, useEffect } from 'react';
import { theme } from 'antd';
import {
    RocketOutlined,
    ThunderboltOutlined,
    ReloadOutlined,
    CompassOutlined,
    AimOutlined,
    PlayCircleOutlined,
    CloseOutlined,
    ExclamationCircleOutlined,
    RadiusSettingOutlined,
    EnvironmentOutlined,
    GlobalOutlined,
} from '@ant-design/icons';
import { Select, Segmented } from 'antd';
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EnterpriseResponse, EnterpriseType } from '@packages/types';
import { optimizeLogisticsRoute } from '../services/aiService';

const { useToken } = theme;

interface GeoMapProps {
    enterprises: EnterpriseResponse[];
    onSelectEnterprise: (ent: EnterpriseResponse) => void;
    selectedId?: string | null;
}

// 创建自定义图标
const createCustomIcon = (color: string, isSelected: boolean, isInRoute: boolean, routeIndex?: number) => {
    const size = isSelected ? 24 : isInRoute ? 20 : 14;
    const borderWidth = isSelected ? 3 : isInRoute ? 3 : 2;

    return L.divIcon({
        className: 'custom-marker',
        html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: ${borderWidth}px solid #fff;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        color: #fff;
        transition: all 0.3s;
      ">
        ${isInRoute && routeIndex !== undefined ? routeIndex + 1 : ''}
      </div>
    `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
};

// 地图视图控制组件
const MapController: React.FC<{
    selectedEnterprise: EnterpriseResponse | null;
    enterprises: EnterpriseResponse[];
    shouldReset: boolean;
    onResetComplete: () => void;
    fitToEnterprises?: EnterpriseResponse[];
}> = ({ selectedEnterprise, enterprises, shouldReset, onResetComplete, fitToEnterprises }) => {
    const map = useMap();

    useEffect(() => {
        if (shouldReset) {
            // 重置到包含所有点的边界
            const validEnts = enterprises.filter((e) => e.longitude != null && e.latitude != null);
            if (validEnts.length > 0) {
                const bounds = L.latLngBounds(
                    validEnts.map((e) => [e.latitude!, e.longitude!] as L.LatLngTuple),
                );
                map.fitBounds(bounds, { padding: [50, 50] });
            }
            onResetComplete();
        }
    }, [shouldReset, enterprises, map, onResetComplete]);

    useEffect(() => {
        if (fitToEnterprises && fitToEnterprises.length > 0) {
            const validEnts = fitToEnterprises.filter((e) => e.longitude != null && e.latitude != null);
            if (validEnts.length > 0) {
                const bounds = L.latLngBounds(
                    validEnts.map((e) => [e.latitude!, e.longitude!] as L.LatLngTuple),
                );
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        } else if (selectedEnterprise && selectedEnterprise.latitude && selectedEnterprise.longitude) {
            // Group gets a wider view (10), others get a closer view (14)
            const zoomLevel = selectedEnterprise.types.includes(EnterpriseType.GROUP) ? 10 : 14;
            map.flyTo([selectedEnterprise.latitude, selectedEnterprise.longitude], zoomLevel, {
                duration: 0.5,
            });
        }
    }, [selectedEnterprise, map, fitToEnterprises]);

    return null;
};

// 地理围栏绘制控制器
const GeofenceController: React.FC<{
    isActive: boolean;
    hasGeofence: boolean;
    onGeofenceUpdate: (center: L.LatLng | null, radius: number) => void;
}> = ({ isActive, hasGeofence, onGeofenceUpdate }) => {
    const [drawingStage, setDrawingStage] = useState<'idle' | 'center' | 'radius'>('idle');
    const [center, setCenter] = useState<L.LatLng | null>(null);

    // Reset internal state when inactive or when geofence is cleared externally
    useEffect(() => {
        if (!isActive) {
            setDrawingStage('idle');
            setCenter(null);
        } else if (!hasGeofence) {
            // If active but no geofence exists (initial state or cleared), reset to center picking
            setDrawingStage('center');
            setCenter(null);
        }
    }, [isActive, hasGeofence]);

    useMapEvents({
        click(e) {
            if (!isActive) return;

            if (drawingStage === 'center') {
                setCenter(e.latlng);
                setDrawingStage('radius');
                onGeofenceUpdate(e.latlng, 0); // Initialize with 0 radius
            } else if (drawingStage === 'radius') {
                setDrawingStage('idle'); // Confirm drawing
                // Keep the final geofence on map until cleared or mode changed
            }
        },
        mousemove(e) {
            if (!isActive || drawingStage !== 'radius' || !center) return;

            const radius = center.distanceTo(e.latlng);
            onGeofenceUpdate(center, radius);
        },
    });

    return null;
};


export const GeoMap: React.FC<GeoMapProps> = ({ enterprises, onSelectEnterprise, selectedId }) => {
    const { token } = useToken();

    // Map State
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [mapMode, setMapMode] = useState<'explore' | 'route' | 'geofence'>('explore');
    const [showFlows, setShowFlows] = useState(false);
    const [shouldResetView, setShouldResetView] = useState(false);

    // Sync external selection
    useEffect(() => {
        if (selectedId !== undefined) {
            setSelectedNodeId(selectedId);
        }
    }, [selectedId]);

    // Geofence State
    const [geofenceMode, setGeofenceMode] = useState<'circle' | 'province'>('circle');
    const [geofenceCircle, setGeofenceCircle] = useState<{ center: L.LatLng; radius: number } | null>(null);
    const [geofenceProvince, setGeofenceProvince] = useState<string | null>(null);

    // Derived provinces
    const provinceOptions = useMemo(() => {
        const counts: Record<string, number> = {};
        enterprises.forEach(ent => {
            if (ent.province) {
                counts[ent.province] = (counts[ent.province] || 0) + 1;
            }
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1]) // Sort by count desc
            .map(([prov, count]) => ({
                label: `${prov} (${count})`,
                value: prov,
            }));
    }, [enterprises]);

    // Route State
    const [routeNodes, setRouteNodes] = useState<EnterpriseResponse[]>([]);
    const [optimizationResult, setOptimizationResult] = useState<{
        strategy: string;
        savedDistance: string;
    } | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);

    const selectedEnterprise = enterprises.find((e) => e.id === selectedNodeId) || null;

    // 计算地图中心和边界
    const mapConfig = useMemo(() => {
        const validEnts = enterprises.filter((e) => e.longitude != null && e.latitude != null);

        if (validEnts.length === 0) {
            // 默认中国中心
            return { center: [35.8617, 104.1954] as L.LatLngTuple, zoom: 5 };
        }

        const lats = validEnts.map((e) => e.latitude!);
        const lons = validEnts.map((e) => e.longitude!);

        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;

        return { center: [centerLat, centerLon] as L.LatLngTuple, zoom: 6 };
    }, [enterprises]);

    // 获取节点颜色
    const getNodeColor = (ent: EnterpriseResponse) => {
        if (ent.types.includes(EnterpriseType.GROUP)) return token.colorPrimary;
        if (ent.types.includes(EnterpriseType.SUPPLIER)) return token.colorWarning;
        if (ent.types.includes(EnterpriseType.CUSTOMER)) return token.colorSuccess;
        if (ent.types.includes(EnterpriseType.LOGISTICS)) return token.colorInfo;
        return token.colorTextSecondary;
    };

    // 重置视图
    const resetZoom = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setShouldResetView(true);
    };

    // 节点点击处理
    const handleNodeClick = (ent: EnterpriseResponse) => {
        if (mapMode === 'route') {
            if (routeNodes.find((n) => n.id === ent.id)) {
                setRouteNodes(routeNodes.filter((n) => n.id !== ent.id));
                setOptimizationResult(null);
            } else {
                if (routeNodes.length >= 6) return;
                setRouteNodes([...routeNodes, ent]);
                setOptimizationResult(null);
            }
        } else if (mapMode === 'geofence') {
            // Do nothing when drawing geofence
        } else {
            setSelectedNodeId(ent.id);
            onSelectEnterprise(ent);
        }
    };

    // AI 路径优化
    const handleOptimizeRoute = async () => {
        if (routeNodes.length < 3) return;
        setIsOptimizing(true);
        const result = await optimizeLogisticsRoute(routeNodes);

        const newOrder = result.optimizedIndices.map((idx) => routeNodes[idx]);
        setRouteNodes(newOrder);
        setOptimizationResult({
            strategy: result.strategy,
            savedDistance: result.savedDistance,
        });
        setIsOptimizing(false);
    };

    const clearRoute = () => {
        setRouteNodes([]);
        setOptimizationResult(null);
    };

    // Geofence Calc
    const geofenceResults = useMemo(() => {
        let selected: EnterpriseResponse[] = [];

        if (geofenceMode === 'circle') {
            if (!geofenceCircle || !geofenceCircle.center || geofenceCircle.radius <= 0) return null;
            selected = enterprises.filter((ent) => {
                if (ent.latitude == null || ent.longitude == null) return false;
                const nodePos = L.latLng(ent.latitude, ent.longitude);
                return geofenceCircle.center.distanceTo(nodePos) <= geofenceCircle.radius;
            });
        } else {
            if (!geofenceProvince) return null;
            selected = enterprises.filter((ent) => ent.province === geofenceProvince);
        }

        const counts = {
            [EnterpriseType.CUSTOMER]: 0,
            [EnterpriseType.SUPPLIER]: 0,
            [EnterpriseType.LOGISTICS]: 0,
            [EnterpriseType.GROUP]: 0,
        };

        selected.forEach((ent) => {
            ent.types.forEach((t) => {
                if (counts[t] !== undefined) counts[t]++;
            });
        });

        return { selected, counts };
    }, [geofenceMode, geofenceCircle, geofenceProvince, enterprises]);

    // Group Connections (Explore Mode)
    const groupConnections = useMemo(() => {
        if (
            mapMode !== 'explore' ||
            !selectedEnterprise ||
            !selectedEnterprise.types.includes(EnterpriseType.GROUP) ||
            !selectedEnterprise.latitude ||
            !selectedEnterprise.longitude
        ) {
            return [];
        }

        const centerPos: L.LatLngTuple = [selectedEnterprise.latitude, selectedEnterprise.longitude];

        // Find visible children in the current list
        const visibleChildren = enterprises.filter(
            (e) => e.parent && e.parent.id === selectedEnterprise.id && e.latitude && e.longitude
        );

        // Also check for children in the selectedEnterprise object itself (if detailed data is available)
        const nestedChildren = (selectedEnterprise.children || []).filter(
            (c: { id: string; latitude?: number | null; longitude?: number | null }) => (
                c.latitude
                && c.longitude
                && !visibleChildren.find((vc) => vc.id === c.id)
            )
        );

        return [...visibleChildren, ...nestedChildren].map((child) => ({
            id: child.id,
            from: centerPos,
            to: [child.latitude!, child.longitude!] as L.LatLngTuple,
            name: child.name,
        }));
    }, [mapMode, selectedEnterprise, enterprises]);

    // 路径线坐标
    const routePositions = useMemo(() => {
        return routeNodes
            .filter((n) => n.latitude != null && n.longitude != null)
            .map((n) => [n.latitude!, n.longitude!] as L.LatLngTuple);
    }, [routeNodes]);

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: 600,
                backgroundColor: token.colorBgLayout,
                borderRadius: token.borderRadiusLG,
                overflow: 'hidden',
                border: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            {/* Control Panel */}
            <div
                style={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                <div
                    style={{
                        background: token.colorBgContainer,
                        padding: 8,
                        borderRadius: token.borderRadius,
                        boxShadow: token.boxShadowSecondary,
                        display: 'flex',
                        gap: 8,
                    }}
                >
                    <button
                        onClick={() => {
                            setMapMode('explore');
                            clearRoute();
                            setGeofenceCircle(null);
                            setGeofenceProvince(null);
                        }}
                        style={{
                            border: 'none',
                            background: mapMode === 'explore' ? token.colorPrimaryBg : 'transparent',
                            color: mapMode === 'explore' ? token.colorPrimary : token.colorTextSecondary,
                            padding: '4px 12px',
                            borderRadius: token.borderRadiusSM,
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                        }}
                    >
                        <CompassOutlined /> 探索模式
                    </button>
                    <button
                        onClick={() => {
                            setMapMode('route');
                            setSelectedNodeId(null);
                            setGeofenceCircle(null);
                            setGeofenceProvince(null);
                        }}
                        style={{
                            border: 'none',
                            background: mapMode === 'route' ? token.colorPrimaryBg : 'transparent',
                            color: mapMode === 'route' ? token.colorPrimary : token.colorTextSecondary,
                            padding: '4px 12px',
                            borderRadius: token.borderRadiusSM,
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                        }}
                    >
                        <RocketOutlined /> 路径规划
                    </button>
                    <button
                        onClick={() => {
                            setMapMode('geofence');
                            clearRoute();
                            setSelectedNodeId(null);
                        }}
                        style={{
                            border: 'none',
                            background: mapMode === 'geofence' ? token.colorPrimaryBg : 'transparent',
                            color: mapMode === 'geofence' ? token.colorPrimary : token.colorTextSecondary,
                            padding: '4px 12px',
                            borderRadius: token.borderRadiusSM,
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                        }}
                    >
                        <RadiusSettingOutlined /> 地理围栏
                    </button>
                    <button
                        onClick={() => setShowFlows(!showFlows)}
                        style={{
                            border: 'none',
                            background: showFlows ? token.colorWarningBg : 'transparent',
                            color: showFlows ? token.colorWarning : token.colorTextSecondary,
                            padding: '4px 12px',
                            borderRadius: token.borderRadiusSM,
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                        }}
                    >
                        <ThunderboltOutlined /> 物流热力
                    </button>
                </div>

                <button
                    onClick={resetZoom}
                    style={{
                        border: 'none',
                        background: token.colorBgContainer,
                        color: token.colorText,
                        padding: '8px 12px',
                        borderRadius: token.borderRadius,
                        boxShadow: token.boxShadowSecondary,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        width: 'fit-content',
                    }}
                >
                    <AimOutlined /> 重置视图
                </button>

                {/* Info Panel - Explore */}
                {mapMode === 'explore' && selectedEnterprise && (
                    <div
                        style={{
                            background: token.colorBgContainer,
                            padding: 12,
                            borderRadius: token.borderRadius,
                            boxShadow: token.boxShadow,
                            borderLeft: `4px solid ${token.colorPrimary}`,
                            width: 240,
                        }}
                    >
                        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{selectedEnterprise.name}</div>
                        <div style={{ fontSize: 12, color: token.colorTextDescription }}>
                            {[selectedEnterprise.province, selectedEnterprise.city].filter(Boolean).join(' ')}
                        </div>
                        <div
                            style={{
                                marginTop: 8,
                                fontSize: 12,
                                color: token.colorSuccess,
                                background: token.colorSuccessBg,
                                padding: 4,
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                        >
                            <ExclamationCircleOutlined /> 发现潜在商机 (500km内)
                        </div>
                    </div>
                )}

                {/* Info Panel - Geofence */}
                {mapMode === 'geofence' && (
                    <div
                        style={{
                            background: token.colorBgContainer,
                            padding: 16,
                            borderRadius: token.borderRadius,
                            boxShadow: token.boxShadow,
                            width: 260,
                        }}
                    >
                        <div style={{ fontWeight: 'bold', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <span>地理围栏筛选</span>
                            {(geofenceCircle || geofenceProvince) && <CloseOutlined onClick={() => { setGeofenceCircle(null); setGeofenceProvince(null); }} style={{ cursor: 'pointer', fontSize: 12 }} />}
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <Segmented
                                block
                                size="small"
                                value={geofenceMode}
                                onChange={(val) => {
                                    setGeofenceMode(val as 'circle' | 'province');
                                    setGeofenceCircle(null);
                                    setGeofenceProvince(null);
                                }}
                                options={[
                                    { label: '圆形框选', value: 'circle', icon: <RadiusSettingOutlined /> },
                                    { label: '省份筛选', value: 'province', icon: <GlobalOutlined /> },
                                ]}
                            />
                        </div>

                        {geofenceMode === 'province' && (
                            <div style={{ marginBottom: 12 }}>
                                <Select
                                    style={{ width: '100%' }}
                                    placeholder="请选择省份"
                                    value={geofenceProvince}
                                    onChange={setGeofenceProvince}
                                    options={provinceOptions}
                                />
                            </div>
                        )}

                        {!geofenceCircle && !geofenceProvince ? (
                            geofenceMode === 'circle' ? (
                                <div style={{ fontSize: 12, color: token.colorTextDescription }}>
                                    <ol style={{ paddingLeft: 20, margin: 0 }}>
                                        <li>点击地图确定中心点</li>
                                        <li>移动鼠标调整半径</li>
                                        <li>再次点击确认范围</li>
                                    </ol>
                                </div>
                            ) : (
                                <div style={{ fontSize: 12, color: token.colorTextDescription, textAlign: 'center' }}>
                                    请选择一个省份进行快速筛选
                                </div>
                            )
                        ) : (
                            <div>
                                {geofenceCircle && (
                                    <div style={{ marginBottom: 12, fontSize: 12, color: token.colorTextSecondary }}>
                                        半径: <span style={{ fontWeight: 'bold', color: token.colorPrimary }}>{(geofenceCircle.radius / 1000).toFixed(1)} km</span>
                                    </div>
                                )}
                                {geofenceResults && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                                            <div style={{ background: token.colorSuccessBg, padding: 4, borderRadius: 4, textAlign: 'center' }}>
                                                <div style={{ fontSize: 10, color: token.colorSuccess }}>客户</div>
                                                <div style={{ fontSize: 14, fontWeight: 'bold' }}>{geofenceResults.counts[EnterpriseType.CUSTOMER]}</div>
                                            </div>
                                            <div style={{ background: token.colorWarningBg, padding: 4, borderRadius: 4, textAlign: 'center' }}>
                                                <div style={{ fontSize: 10, color: token.colorWarning }}>供应商</div>
                                                <div style={{ fontSize: 14, fontWeight: 'bold' }}>{geofenceResults.counts[EnterpriseType.SUPPLIER]}</div>
                                            </div>
                                            <div style={{ background: token.colorInfoBg, padding: 4, borderRadius: 4, textAlign: 'center' }}>
                                                <div style={{ fontSize: 10, color: token.colorInfo }}>物流</div>
                                                <div style={{ fontSize: 14, fontWeight: 'bold' }}>{geofenceResults.counts[EnterpriseType.LOGISTICS]}</div>
                                            </div>
                                            <div style={{ background: token.colorPrimaryBg, padding: 4, borderRadius: 4, textAlign: 'center' }}>
                                                <div style={{ fontSize: 10, color: token.colorPrimary }}>集团</div>
                                                <div style={{ fontSize: 14, fontWeight: 'bold' }}>{geofenceResults.counts[EnterpriseType.GROUP]}</div>
                                            </div>
                                        </div>
                                        <div style={{ maxHeight: 200, overflowY: 'auto', borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 8 }}>
                                            {geofenceResults.selected.length === 0 ? (
                                                <div style={{ fontSize: 12, color: token.colorTextDescription, textAlign: 'center' }}>范围内无企业</div>
                                            ) : (
                                                <ul style={{ padding: 0, margin: 0, listStyle: 'none' }}>
                                                    {geofenceResults.selected.map(ent => (
                                                        <li
                                                            key={ent.id}
                                                            onClick={() => {
                                                                setSelectedNodeId(ent.id);
                                                                onSelectEnterprise(ent);
                                                            }}
                                                            style={{
                                                                padding: '4px 0',
                                                                borderBottom: `1px dashed ${token.colorBorderSecondary}`,
                                                                fontSize: 12,
                                                                cursor: 'pointer',
                                                            }}
                                                            onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillTertiary)}
                                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                        >
                                                            {ent.name}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}


                {/* Info Panel - Route */}
                {mapMode === 'route' && (
                    <div
                        style={{
                            background: token.colorBgContainer,
                            padding: 16,
                            borderRadius: token.borderRadius,
                            boxShadow: token.boxShadow,
                            width: 300,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 12,
                            }}
                        >
                            <span style={{ fontWeight: 'bold' }}>智能多点路径规划</span>
                            {routeNodes.length > 0 && (
                                <CloseOutlined
                                    onClick={clearRoute}
                                    style={{ cursor: 'pointer', color: token.colorTextQuaternary }}
                                />
                            )}
                        </div>

                        {routeNodes.length === 0 ? (
                            <div
                                style={{
                                    padding: 16,
                                    textAlign: 'center',
                                    border: `1px dashed ${token.colorBorder}`,
                                    borderRadius: token.borderRadius,
                                    color: token.colorTextDescription,
                                    fontSize: 12,
                                }}
                            >
                                请在地图上依次点击节点
                                <br />
                                添加起点、途经点、终点
                            </div>
                        ) : (
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    maxHeight: 200,
                                    overflowY: 'auto',
                                }}
                            >
                                {routeNodes.map((node, idx) => (
                                    <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div
                                            style={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: '50%',
                                                color: '#fff',
                                                fontSize: 10,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background:
                                                    idx === 0
                                                        ? token.colorSuccess
                                                        : idx === routeNodes.length - 1
                                                            ? token.colorError
                                                            : token.colorPrimary,
                                            }}
                                        >
                                            {idx + 1}
                                        </div>
                                        <div
                                            style={{
                                                flex: 1,
                                                padding: 8,
                                                borderRadius: 4,
                                                border: `1px solid ${token.colorBorderSecondary}`,
                                                fontSize: 12,
                                            }}
                                        >
                                            <div style={{ fontWeight: 500 }}>{node.shortName || node.name}</div>
                                            <div style={{ fontSize: 10, color: token.colorTextDescription }}>
                                                {idx === 0
                                                    ? '起点'
                                                    : idx === routeNodes.length - 1
                                                        ? '终点'
                                                        : '途经点'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {routeNodes.length >= 3 && (
                            <div
                                style={{
                                    marginTop: 12,
                                    paddingTop: 12,
                                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                                }}
                            >
                                {!optimizationResult ? (
                                    <button
                                        onClick={handleOptimizeRoute}
                                        disabled={isOptimizing}
                                        style={{
                                            width: '100%',
                                            padding: '6px 0',
                                            background: token.colorPrimary,
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: token.borderRadius,
                                            cursor: isOptimizing ? 'wait' : 'pointer',
                                            opacity: isOptimizing ? 0.7 : 1,
                                        }}
                                    >
                                        {isOptimizing ? <ReloadOutlined spin /> : <ThunderboltOutlined />}{' '}
                                        {isOptimizing ? '计算中...' : 'AI 智能路线优化'}
                                    </button>
                                ) : (
                                    <div>
                                        <div
                                            style={{
                                                color: token.colorSuccess,
                                                fontSize: 12,
                                                fontWeight: 'bold',
                                                marginBottom: 4,
                                            }}
                                        >
                                            <PlayCircleOutlined /> 路线已优化
                                        </div>
                                        <div
                                            style={{
                                                background: token.colorFillAlter,
                                                padding: 8,
                                                borderRadius: 4,
                                                fontSize: 12,
                                            }}
                                        >
                                            <div style={{ color: token.colorPrimaryText, fontWeight: 'bold' }}>
                                                优化策略:
                                            </div>
                                            <div style={{ color: token.colorTextSecondary, marginBottom: 4 }}>
                                                {optimizationResult.strategy}
                                            </div>
                                            <div
                                                style={{
                                                    textAlign: 'right',
                                                    color: token.colorSuccessText,
                                                    fontWeight: 'bold',
                                                }}
                                            >
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

            {/* Leaflet Map */}
            <MapContainer
                center={mapConfig.center}
                zoom={mapConfig.zoom}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom={true}
                zoomControl={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Map Controllers */}
                <MapController
                    selectedEnterprise={selectedEnterprise}
                    enterprises={enterprises}
                    shouldReset={shouldResetView}
                    onResetComplete={() => setShouldResetView(false)}
                    fitToEnterprises={mapMode === 'geofence' && geofenceProvince && geofenceResults ? geofenceResults.selected : undefined}
                />

                <GeofenceController
                    isActive={mapMode === 'geofence' && geofenceMode === 'circle'}
                    hasGeofence={!!geofenceCircle}
                    onGeofenceUpdate={(c, r) => setGeofenceCircle(c ? { center: c, radius: r } : null)}
                />

                {/* Route Path Lines */}
                {routePositions.length > 1 && (
                    <Polyline
                        positions={routePositions}
                        pathOptions={{
                            color: optimizationResult ? token.colorSuccess : token.colorPrimary,
                            weight: 4,
                            opacity: 0.8,
                            dashArray: '10, 6',
                        }}
                    />
                )}

                {/* Group Connections (Explore Mode) */}
                {groupConnections.map(conn => (
                    <Polyline
                        key={conn.id}
                        positions={[conn.from, conn.to]}
                        pathOptions={{
                            color: '#722ED1',
                            weight: 2,
                            opacity: 0.6,
                            dashArray: '5, 5',
                        }}
                    >
                        <Tooltip sticky>{conn.name}</Tooltip>
                    </Polyline>
                ))}

                {/* 500km Radius Circle (Explore Mode) */}
                {mapMode === 'explore' &&
                    selectedEnterprise &&
                    selectedEnterprise.latitude &&
                    selectedEnterprise.longitude && (
                        <Circle
                            center={[selectedEnterprise.latitude, selectedEnterprise.longitude]}
                            radius={500000} // 500km in meters
                            pathOptions={{
                                color: token.colorSuccess,
                                fillColor: token.colorSuccessBg,
                                fillOpacity: 0.2,
                                weight: 1,
                                dashArray: '4, 4',
                            }}
                        />
                    )}

                {/* Geofence Drawing Circle */}
                {geofenceCircle && (
                    <Circle
                        center={geofenceCircle.center}
                        radius={geofenceCircle.radius}
                        pathOptions={{
                            color: token.colorPrimary,
                            fillColor: token.colorPrimaryBg,
                            fillOpacity: 0.2,
                            weight: 2,
                            dashArray: '8, 8',
                        }}
                    />
                )}

                {/* Enterprise Markers with Tooltips */}
                {enterprises.map((ent) => {
                    if (ent.latitude == null || ent.longitude == null) return null;

                    const isSelected = selectedNodeId === ent.id;
                    const routeIndex = routeNodes.findIndex((n) => n.id === ent.id);
                    const isInRoute = routeIndex !== -1;

                    return (
                        <Marker
                            key={ent.id}
                            position={[ent.latitude, ent.longitude]}
                            icon={createCustomIcon(getNodeColor(ent), isSelected, isInRoute, routeIndex)}
                            eventHandlers={{
                                click: () => handleNodeClick(ent),
                            }}
                        >
                            {/* Node Tooltip */}
                            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold' }}>{ent.name}</div>
                                    <div style={{ fontSize: 10, color: '#666' }}>{ent.types.join(' | ')}</div>
                                    {[ent.province, ent.city].some(Boolean) && (
                                        <div style={{ fontSize: 10, marginTop: 4 }}>
                                            <EnvironmentOutlined /> {[ent.province, ent.city].filter(Boolean).join(' ')}
                                        </div>
                                    )}
                                </div>
                            </Tooltip>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Legend */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 16,
                    right: 16,
                    background: token.colorBgElevated,
                    padding: 8,
                    borderRadius: token.borderRadius,
                    fontSize: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    pointerEvents: 'none',
                    boxShadow: token.boxShadowSecondary,
                    zIndex: 1000,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                        style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorSuccess }}
                    ></div>{' '}
                    客户
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                        style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorWarning }}
                    ></div>{' '}
                    供应商
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                        style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorInfo }}
                    ></div>{' '}
                    物流商
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                        style={{ width: 8, height: 8, borderRadius: '50%', background: token.colorPrimary }}
                    ></div>{' '}
                    集团
                </div>
            </div>
        </div>
    );
};

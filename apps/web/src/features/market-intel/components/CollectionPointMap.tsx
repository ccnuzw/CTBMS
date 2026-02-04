import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Button, Tag, Space, Typography, Card } from 'antd';
import { UserOutlined, EnvironmentOutlined } from '@ant-design/icons';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useDictionary } from '@/hooks/useDictionaries';

// Fix Leaflet default icon issue in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons
const createColoredIcon = (color: string) => {
  return new L.DivIcon({
    className: 'custom-marker-icon',
    html: `<div style="
      background-color: ${color};
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -6],
  });
};

const redIcon = createColoredIcon('#ff4d4f');   // Unassigned
const blueIcon = createColoredIcon('#1890ff');  // Assigned
const greenIcon = createColoredIcon('#52c41a'); // Assigned to current user

const POINT_TYPE_LABELS_FALLBACK: Record<string, string> = {
  PORT: '港口',
  ENTERPRISE: '企业',
  STATION: '站台',
  MARKET: '市场',
  REGION: '区域',
};

interface CollectionPointMapProps {
  points: any[];
  selectedUserId: string | null;
  onAssign: (pointId: string) => void;
  onUnassign: (pointId: string) => void;
}

const FitBounds = ({ points }: { points: any[] }) => {
  const map = useMap();

  React.useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.latitude || 39.9, p.longitude || 116.4]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [points, map]);

  return null;
};

export const CollectionPointMap: React.FC<CollectionPointMapProps> = ({
  points,
  selectedUserId,
  onAssign,
  onUnassign
}) => {
  const { data: pointTypeDict } = useDictionary('COLLECTION_POINT_TYPE');

  const pointTypeLabels = useMemo(() => {
    const items = (pointTypeDict || []).filter((item) => item.isActive);
    if (!items.length) return POINT_TYPE_LABELS_FALLBACK;
    return items.reduce<Record<string, string>>((acc, item) => {
      acc[item.code] = item.label;
      return acc;
    }, {});
  }, [pointTypeDict]);
  // Filter valid points
  const validPoints = useMemo(() =>
    points.filter(p => p.latitude && p.longitude),
    [points]);

  if (validPoints.length === 0) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#f0f2f5'
      }}>
        <Typography.Text type="secondary">暂无坐标数据</Typography.Text>
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 300px)', width: '100%', position: 'relative' }}>
      <MapContainer
        center={[35.0, 105.0]}
        zoom={4}
        style={{ height: '100%', width: '100%', borderRadius: '8px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds points={validPoints} />

        {validPoints.map(point => {
          const isAssignedToCurrentUser = selectedUserId ? point.allocatedUserIds.includes(selectedUserId) : false;
          const isAssigned = point.isAllocated;

          let icon = redIcon;
          if (isAssignedToCurrentUser) icon = greenIcon;
          else if (isAssigned) icon = blueIcon;

          return (
            <Marker
              key={point.pointId}
              position={[point.latitude, point.longitude]}
              icon={icon}
            >
              <Popup>
                <Card
                  size="small"
                  title={point.pointName}
                  bordered={false}
                  style={{ width: 200, boxShadow: 'none' }}
                  bodyStyle={{ padding: '8px 0 0 0' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                  <Tag>{pointTypeLabels[point.pointType] || point.pointType}</Tag>
                    {isAssignedToCurrentUser ? (
                      <Tag color="success" icon={<UserOutlined />}>我负责的点</Tag>
                    ) : isAssigned ? (
                      <Tag color="processing">已分配 ({point.allocatedUserIds.length}人)</Tag>
                    ) : (
                      <Tag color="warning">未分配</Tag>
                    )}

                    {selectedUserId && !isAssignedToCurrentUser && (
                      <Button
                        type="primary"
                        size="small"
                        block
                        icon={<EnvironmentOutlined />}
                        onClick={() => onAssign(point.pointId)}
                      >
                        分配给当前用户
                      </Button>
                    )}
                    {selectedUserId && isAssignedToCurrentUser && (
                      <Button
                        danger
                        size="small"
                        block
                        icon={<EnvironmentOutlined />}
                        onClick={() => onUnassign(point.pointId)}
                      >
                        取消分配
                      </Button>
                    )}
                  </Space>
                </Card>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 1000,
        background: 'white',
        padding: '8px 12px',
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <Space direction="vertical" size={4}>
          <Space><div style={{ width: 10, height: 10, background: '#ff4d4f', borderRadius: '50%' }} /> 未分配</Space>
          <Space><div style={{ width: 10, height: 10, background: '#1890ff', borderRadius: '50%' }} /> 已分配</Space>
          <Space><div style={{ width: 10, height: 10, background: '#52c41a', borderRadius: '50%' }} /> 当前用户负责</Space>
        </Space>
      </div>
    </div>
  );
};

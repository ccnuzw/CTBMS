import React from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import { Card, Empty } from 'antd';
import type { FuturesQuoteSnapshotDto, VirtualTradeLedgerDto } from '@packages/types';
import dayjs from 'dayjs';

interface KLineChartProps {
  data: FuturesQuoteSnapshotDto[];
  trades?: VirtualTradeLedgerDto[];
  height?: number;
}

const formatTime = (time: string | Date) => dayjs(time).format('HH:mm');

export const KLineChart: React.FC<KLineChartProps> = ({ data, trades = [], height = 400 }) => {
  if (!data || data.length === 0) {
    return (
      <Card>
        <Empty description="暂无行情数据" />
      </Card>
    );
  }

  const sortedData = [...data].sort(
    (a, b) => new Date(a.snapshotAt).getTime() - new Date(b.snapshotAt).getTime(),
  );

  const chartData = sortedData.map((item) => ({
    ...item,
    timeStr: formatTime(item.snapshotAt),
    price: item.lastPrice,
  }));

  const annotations = trades
    .map((trade) => {
      const tradeTime = new Date(trade.tradedAt).getTime();
      const closest = chartData.reduce((prev, curr) => {
        return Math.abs(new Date(curr.snapshotAt).getTime() - tradeTime) <
          Math.abs(new Date(prev.snapshotAt).getTime() - tradeTime)
          ? curr
          : prev;
      });

      return {
        x: closest.timeStr,
        y: trade.price,
        color: trade.action.includes('LONG') ? '#ff4d4f' : '#52c41a',
      };
    })
    .filter((item) => Number.isFinite(item.y));

  return (
    <Card bordered={false} bodyStyle={{ padding: 0 }}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="timeStr" minTickGap={30} />
            <YAxis domain={['auto', 'auto']} />
            <Tooltip
              labelFormatter={(label) => `时间: ${String(label)}`}
              formatter={(value: number | string | undefined) => {
                const num = typeof value === 'number' ? value : Number(value ?? 0);
                return [num.toFixed(2), '价格'];
              }}
            />
            <Legend />

            <Line
              type="monotone"
              dataKey="price"
              stroke="#1677ff"
              dot={false}
              strokeWidth={2}
              name="最新价"
            />

            {annotations.map((anno, idx) => (
              <ReferenceDot key={`${anno.x}-${idx}`} x={anno.x} y={anno.y} r={5} fill={anno.color} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

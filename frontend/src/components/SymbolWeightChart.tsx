import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Area,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';

interface WeightDataPoint {
  date: string;
  weight: number;
  target: number;
}

interface SymbolWeightChartProps {
  symbol: string;
  color: string;
  data: WeightDataPoint[];
}

const SymbolWeightChart: React.FC<SymbolWeightChartProps> = ({ color, data }) => {
  // Use a brighter color for the weights line and area
  const brightColor = color;
  const brightStroke = color;
  const brightFill = color + 'CC'; // Add alpha for more opacity if hex

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#a8a8a8" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
        <YAxis tick={{ fontSize: 10 }} width={32} />
        <Tooltip formatter={(value: number) => value.toFixed(2)} />
        <Legend verticalAlign="top" height={24} />
        <Area
          type="monotone"
          dataKey="weight"
          name="Weights"
          stroke={brightStroke}
          fill={brightFill}
          fillOpacity={0.7}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="target"
          name="Targets"
          stroke="#ccc"
          strokeWidth={1.3}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default SymbolWeightChart; 
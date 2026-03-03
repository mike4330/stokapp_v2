/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useMemo } from 'react';
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

  const yAxisDomain = useMemo((): [number, number] => {
    if (!data || data.length === 0) return [0, 1];

    const allValues = data.flatMap(d => [d.weight, d.target]);
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    const range = maxValue - minValue;

    // Use 25% padding on both sides to emphasize variation.
    // Fall back to 10% of the max if the range is zero (flat line).
    const padding = range > 0 ? range * 0.25 : maxValue * 0.1;
    const yMin = Math.max(0, minValue - padding);
    const yMax = maxValue + padding;

    return [yMin, yMax];
  }, [data]);

  return (
    <ResponsiveContainer width="98%" height={210}>
      <ComposedChart data={data} margin={{ top: 1, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 2" stroke="#444444" />
        <XAxis dataKey="date" tick={{ fontSize: 10 , fill: '#ccc'}} minTickGap={20} />
        <YAxis 
          tick={{ fontSize: 11, fill: '#ccc' }} 
          width={35} 
          
          domain={yAxisDomain}
          tickFormatter={(value) => value.toFixed(3)}
        />
        <Tooltip 
          formatter={(value: number) => value.toFixed(4)} 
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Legend verticalAlign="top" height={26} />
        <Area
          type="monotone"
          dataKey="weight"
          name="Weights"
          stroke={brightStroke}
          fill={brightFill}
          fillOpacity={0.77}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="target"
          name="Targets"
          stroke="#999" // Changed from #ccc to black for better visibility
          strokeWidth={1.3}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default SymbolWeightChart;

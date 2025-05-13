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
  // Allow customization of the min y-axis percentage below the data minimum
  minYAxisPadding?: number;
}

const SymbolWeightChart: React.FC<SymbolWeightChartProps> = ({ 
  color, 
  data,
  minYAxisPadding = 0.1 // 10% below minimum by default
}) => {
  // Use a brighter color for the weights line and area
  const brightColor = color;
  const brightStroke = color;
  const brightFill = color + 'CC'; // Add alpha for more opacity if hex

  const yAxisDomain = useMemo((): [number, string] => {
    if (!data || data.length === 0) return [0, 'dataMax'];
    
    // Find minimum values in both weight and target
    const allValues = data.flatMap(d => [d.weight, d.target]);
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    
    // Set minimum to be slightly lower than the smallest value
    // but don't go below zero for weights
    const padding = (maxValue - minValue) * minYAxisPadding;
    const yMin = Math.max(0, minValue - padding);
    
    // Round to a nice number to avoid odd starting points
    const roundedYMin = Math.floor(yMin * 100) / 100;
    
    return [roundedYMin, 'dataMax'];
  }, [data, minYAxisPadding]);

  return (
    <ResponsiveContainer width="100%" height={210}>
      <ComposedChart data={data} margin={{ top: 1, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 2" stroke="#444444" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
        <YAxis 
          tick={{ fontSize: 10 }} 
          width={32} 
          domain={yAxisDomain}
          tickFormatter={(value) => value.toFixed(2)}
        />
        <Tooltip 
          formatter={(value: number) => value.toFixed(4)} 
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Legend verticalAlign="top" height={24} />
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

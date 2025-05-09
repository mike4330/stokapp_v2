/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * ReturnChart Component
 * 
 * Bar chart visualization of investment returns over time. Shows both realized
 * and unrealized returns, with options to view different time periods and
 * compare against benchmarks.
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ReturnData {
  date: string;
  return_percent: number;
}

interface ReturnChartProps {
  data: ReturnData[];
  isLoading: boolean;
}

export const ReturnChart: React.FC<ReturnChartProps> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-gray-900/50 rounded-lg p-6 h-[400px]">
        <div className="h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-lg p-6 h-[400px]">
      <h2 className="text-lg font-semibold mb-4 text-white">Return Over Time</h2>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 10,
              left: 10,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="date"
              tickFormatter={(date) => new Date(date).toLocaleDateString()}
              stroke="#9CA3AF"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(value) => `${value.toFixed(1)}%`}
              stroke="#9CA3AF"
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, 'Return']}
              labelFormatter={(date) => new Date(date).toLocaleDateString()}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: 'none',
                borderRadius: '0.375rem',
                color: '#E5E7EB',
                fontSize: '12px'
              }}
            />
            <Line
              type="monotone"
              dataKey="return_percent"
              stroke="#60A5FA"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}; 

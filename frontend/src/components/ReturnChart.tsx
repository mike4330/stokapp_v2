/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * ReturnChart Component
 * 
 * Line chart visualization of investment returns over time. Shows return percentages
 * over time with interactive tooltips and responsive design. Includes date range selection.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
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
  symbol: string;
}

type TimeFrame = '6M' | '1Y' | '2Y' | 'ALL';

// Helper to parse YYYY-MM-DD as local date
const parseLocalDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const ReturnChart: React.FC<ReturnChartProps> = ({ symbol }) => {
  const [data, setData] = useState<ReturnData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1Y');

  useEffect(() => {
    async function fetchData() {
      if (!symbol) return;
      
      try {
        setIsLoading(true);
        
        // Calculate days based on timeFrame
        let days = 365; // default
        switch (timeFrame) {
          case '6M':
            days = 180;
            break;
          case '1Y':
            days = 365;
            break;
          case '2Y':
            days = 730;
            break;
          case 'ALL':
            days = 3650; // 10 years as "ALL"
            break;
        }
        
        const response = await axios.get(`/api/positions/${symbol}/returns?days=${days}`);
        
        // Transform the data to match our interface
        const transformedData = response.data.map((item: any) => ({
          date: item.date,
          return_percent: item.return_percent,
        }));
        
        setData(transformedData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching return data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [symbol, timeFrame]);

  if (isLoading) {
    return (
      <div className="bg-gray-900/50 rounded-lg p-6 h-[400px]">
        <div className="h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900/50 rounded-lg p-6 h-[400px]">
        <h2 className="text-lg font-semibold mb-4 text-white">{symbol}: Return Over Time</h2>
        <div className="h-full flex items-center justify-center">
          <div className="text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 rounded-lg p-6 h-[400px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">{symbol}: Return Over Time</h2>
        <div className="flex space-x-2">
          {(['6M', '1Y', '2Y', 'ALL'] as TimeFrame[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeFrame(tf)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                timeFrame === tf
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
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
              tickFormatter={(date) => parseLocalDate(date).toLocaleDateString()}
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
              labelFormatter={(date) => parseLocalDate(date).toLocaleDateString()}
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
              isAnimationActive={true}
              animationDuration={300}
              animationBegin={0}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}; 

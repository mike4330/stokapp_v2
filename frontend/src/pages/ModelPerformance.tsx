/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import TimeFrameSelector, { TimeFrame } from '../components/TimeFrameSelector';

interface MPTResultData {
  timestamp: string;
  expected_return: number | null;
  volatility: number | null;
  sharpe_ratio: number | null;
}

interface PerformanceData {
  // Define your performance data structure here
  // This will depend on what backend API you create
}

const ModelPerformance: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<MPTResultData[]>([]);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1Y');

  // Fetch MPT results time series
  useEffect(() => {
    const fetchTimeSeriesData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Calculate days based on timeFrame
        let days = 365;
        switch (timeFrame) {
          case '1M':
            days = 30;
            break;
          case '3M':
            days = 90;
            break;
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
            days = 3650;
            break;
        }

        const response = await fetch(`/api/mpt-results/time-series?days=${days}`);
        if (!response.ok) {
          throw new Error('Failed to fetch MPT results time series');
        }

        const data = await response.json();
        setTimeSeriesData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model performance data');
      } finally {
        setLoading(false);
      }
    };

    fetchTimeSeriesData();
  }, [timeFrame]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet>
        <title>Model Performance | MPM</title>
      </Helmet>
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Model Performance</h1>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="bg-green-800 py-3 px-6">
          <h2 className="text-lg font-semibold text-white">Portfolio Model Performance Analysis</h2>
        </div>
        <div className="p-6">
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
            </div>
          )}
          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded my-4">
              {error}
            </div>
          )}
          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Chart 1 - Expected Return Over Time */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Expected Return Over Time
                  </h3>
                  <TimeFrameSelector
                    timeFrame={timeFrame}
                    onTimeFrameChange={setTimeFrame}
                  />
                </div>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={timeSeriesData}
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(timestamp) => {
                          const date = new Date(timestamp);
                          return date.toLocaleDateString();
                        }}
                        stroke="#9CA3AF"
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                        stroke="#9CA3AF"
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(17, 24, 39, 0.9)',
                          border: '1px solid #374151',
                          borderRadius: '0.375rem',
                        }}
                        labelStyle={{ color: '#F3F4F6' }}
                        formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Expected Return']}
                        labelFormatter={(timestamp) => {
                          const date = new Date(timestamp);
                          return date.toLocaleString();
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="expected_return"
                        stroke="#059669"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2 - Top Right */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Chart 2
                </h3>
                <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
                  Placeholder for scatter chart
                </div>
              </div>

              {/* Chart 3 - Bottom Left */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Chart 3
                </h3>
                <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
                  Placeholder for scatter chart
                </div>
              </div>

              {/* Chart 4 - Bottom Right */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Chart 4
                </h3>
                <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
                  Placeholder for scatter chart
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelPerformance;

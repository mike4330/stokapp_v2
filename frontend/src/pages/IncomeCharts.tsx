/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

const COLORS = [
    '#a50026', //1
  '#313695', //11
    '#d62f27', //2
   '#4574b3', //10
    '#f46d43', //3
 '#74add1', //9
    '#fdad60', //4
  '#aad8e9', //8
    '#fee090', //5
  '#e0f3f8', //7
    '#feffc0', //6

];

interface PieData {
  symbol: string;
  value: number;
}

function combineSmallSlices(data: PieData[], thresholdPercent: number): PieData[] {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const threshold = total * (thresholdPercent / 100);
  const large = data.filter(d => d.value >= threshold);
  const small = data.filter(d => d.value < threshold);
  if (small.length === 0) return data;
  const otherValue = small.reduce((sum, d) => sum + d.value, 0);
  return [
    ...large,
    { symbol: 'Other', value: otherValue },
  ];
}

interface TimeSeriesData {
  date: string;
  dividends: number;
  realized_gains: number;
}

const IncomeCharts: React.FC = () => {
  const [dividends, setDividends] = useState<PieData[]>([]);
  const [realizedGains, setRealizedGains] = useState<PieData[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/charts/cumulative-dividends').then(r => r.json()),
      fetch('/api/charts/cumulative-realized-gains').then(r => r.json()),
      fetch('/api/charts/income-time-series').then(r => r.json()),
    ])
      .then(([divs, gains, timeSeries]) => {
        setDividends((divs as PieData[]).filter((d: PieData) => d.value > 0));
        setRealizedGains((gains as PieData[]).filter((g: PieData) => g.value > 0));
        const formattedTimeSeries = Array.isArray(timeSeries) ? timeSeries.map(item => ({
          date: item.date,
          dividends: Number(item.dividends) || 0,
          realized_gains: Number(item.realized_gains) || 0
        })) : [];
        setTimeSeriesData(formattedTimeSeries);
        setLoading(false);
      })
      .catch(e => {
        setError('Failed to load data');
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  const thresholdPercent = 2;
  const dividendsData = combineSmallSlices(dividends, thresholdPercent);
  const realizedGainsData = combineSmallSlices(realizedGains, thresholdPercent);

  // Custom label component with improved positioning
  const renderCustomizedLabel = ({ 
    cx, 
    cy, 
    midAngle, 
    innerRadius, 
    outerRadius, 
    percent, 
    index, 
    name 
  }: any) => {
    const RADIAN = Math.PI / 180;
    // Increase the flyout distance by using a larger multiplier (1.4 instead of 1.1)
    const radius = outerRadius * 1.2;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="#fff"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '11px' }}
      >
        {`${name}: ${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Income Charts</h1>
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="p-4">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Cumulative Dividends by Symbol</h2>
            <ResponsiveContainer width="100%" height={450}>
              <PieChart>
                <Pie
                  data={dividendsData}
                  dataKey="value"
                  nameKey="symbol"
                  cx="50%"
                  cy="50%"
                  outerRadius={155}
                  labelLine={true}
                  label={renderCustomizedLabel}
                >
                  {dividendsData.map((entry, idx) => (
                    <Cell key={`cell-div-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="p-4">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Cumulative Realized Gains by Symbol</h2>
            <ResponsiveContainer width="100%" height={450}>
              <PieChart>
                <Pie
                  data={realizedGainsData}
                  dataKey="value"
                  nameKey="symbol"
                  cx="50%"
                  cy="50%"
                  outerRadius={155}
                  labelLine={true}
                  label={renderCustomizedLabel}
                >
                  {realizedGainsData.map((entry, idx) => (
                    <Cell key={`cell-gain-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Income Over Time</h2>
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(date) => new Date(date).toLocaleDateString()}
              />
              <YAxis 
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip 
                formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
              />
              <Legend />
              <Bar dataKey="dividends" name="Dividends" stackId="a" fill="#4574b3" />
              <Bar dataKey="realized_gains" name="Realized Gains" stackId="a" fill="#d62f27" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default IncomeCharts;

/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
// Import chart components
import PortfolioPerformanceChart from '../components/PortfolioPerformanceChart';
import ReturnsChart from '../components/ReturnsChart';
// Import Recharts components for the bar chart
import {
  BarChart,         // Bar chart component
  Bar,              // Bar component for individual bars
  XAxis,            // X-axis component
  YAxis,            // Y-axis component
  CartesianGrid,    // Grid lines
  Tooltip,          // Tooltip for data points
  ResponsiveContainer, // Wrapper for responsive charts
  Cell              // Individual cell styling for bars
} from 'recharts';

// Array of colors for the bar chart - each bar will get a color from this array
const COLORS = [
  'rgba(0, 136, 254, 0.7)',  // Blue
  'rgba(0, 196, 159, 0.7)',  // Teal
  'rgba(255, 187, 40, 0.7)',  // Yellow
  'rgba(255, 128, 66, 0.7)',  // Orange
  'rgba(136, 132, 216, 0.7)', // Purple
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40' // Additional colors
];

const PortfolioPerformancePage: React.FC = () => {
  // State for returns by security data
  const [returnsData, setReturnsData] = useState<{ symbol: string; return_percent: number }[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(true);
  const [returnsError, setReturnsError] = useState<string | null>(null);

  // Fetch returns by security data on component mount
  useEffect(() => {
    const fetchReturnsData = async () => {
      try {
        const response = await axios.get('/api/returns/by-security');
        setReturnsData(response.data);
        setReturnsLoading(false);
      } catch (err) {
        setReturnsError('Failed to fetch returns by security');
        setReturnsLoading(false);
      }
    };
    fetchReturnsData();
  }, []);

  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-white">Portfolio Performance</h1>
      
      {/* 
        TOP SECTION: Main portfolio charts grid (2 columns on larger screens)
        - Left: Portfolio Performance Chart (value vs. cost over time)
        - Right: Returns Chart (returns with moving averages)
      */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Portfolio Performance Chart Container */}
        <div className="bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="p-4">
            {/* This component renders the Value vs. Cost chart */}
            <PortfolioPerformanceChart />
          </div>
        </div>
        
        {/* Returns Chart Container */}
        <div className="bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="p-4">
            {/* This component renders the Returns chart with moving averages */}
            <ReturnsChart />
          </div>
        </div>
      </div>
      
      {/* 
        MIDDLE SECTION: Return by Security bar chart
        This bar chart shows the return percentage for each security
      */}
      <div className="w-full p-6 bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg mb-6 overflow-hidden border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Return by Security
        </h2>
        
        {/* Chart content with loading/error states */}
        {returnsLoading ? (
          // Loading state
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          </div>
        ) : returnsError ? (
          // Error state
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">{returnsError}</div>
              </div>
            </div>
          </div>
        ) : (
          // Bar Chart - Return by Security
          <div className="h-[500px]"> {/* Fixed height container for the chart */}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={returnsData}
                margin={{ top: 20, right: 30, left: 40, bottom: 90 }} // Extra bottom margin for rotated labels
              >
                {/* Grid lines */}
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} vertical={false} horizontal={true} />
                
                {/* X-axis - symbols */}
                <XAxis
                  dataKey="symbol"
                  angle={-45} // Rotate labels for better fit
                  textAnchor="end"
                  height={80} // Extra height for rotated labels
                  interval={0} // Show all labels
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={{ stroke: '#374151', strokeWidth: 1 }}
                />
                
                {/* Y-axis - percentage returns */}
                <YAxis
                  tickFormatter={(value) => `${value.toFixed(1)}%`} // Format as percentage
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={{ stroke: '#374151', strokeWidth: 1 }}
                />
                
                {/* Tooltip */}
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(2)}%`} // Format value as percentage
                  labelFormatter={(label: string) => `Symbol: ${label}`} // Format label
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    borderRadius: 8, 
                    border: '1px solid #334155', 
                    color: '#e2e8f0',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)'
                  }}
                  labelStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                
                {/* Bar chart with colored cells */}
                <Bar dataKey="return_percent" name="Return %" radius={[4, 4, 0, 0]}> {/* Rounded top corners */}
                  {/* Map each data point to a cell with a color from the COLORS array */}
                  {returnsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      
      {/* 
        BOTTOM SECTION: Performance Metrics
        Grid of key performance metrics in card format
      */}
      <div className="bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg p-4 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">Performance Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Annualized Return */}
          <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
            <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Annualized Return</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white">8.24%</p>
          </div>
          
          {/* YTD Return */}
          <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
            <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">YTD Return</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white">5.62%</p>
          </div>
          
          {/* Total Return */}
          <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
            <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Return</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white">42.17%</p>
          </div>
          
          {/* Volatility */}
          <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
            <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Volatility (1Y)</h3>
            <p className="text-xl font-bold text-gray-900 dark:text-white">12.8%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioPerformancePage;

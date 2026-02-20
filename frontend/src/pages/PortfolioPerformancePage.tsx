/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Helmet } from 'react-helmet-async';
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
  const [returnsData, setReturnsData] = useState<{ symbol: string; return_percent: number; return_dollars: number }[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(true);
  const [returnsError, setReturnsError] = useState<string | null>(null);
  // State for chart display mode
  const [showDollars, setShowDollars] = useState(false);
  
  // State for returns by sector data
  const [sectorReturnsData, setSectorReturnsData] = useState<{ sector: string; return_percent: number; return_dollars: number }[]>([]);
  const [sectorReturnsLoading, setSectorReturnsLoading] = useState(true);
  const [sectorReturnsError, setSectorReturnsError] = useState<string | null>(null);
  // State for sector chart display mode
  const [showSectorDollars, setShowSectorDollars] = useState(false);

  // State for portfolio metrics (bottom cards)
  const [metrics, setMetrics] = useState<{
    total_return_dollars: number;
    total_return_percent: number;
    ytd_return_percent: number | null;
    annualized_return_percent: number | null;
    volatility_1y: number | null;
  } | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Fetch returns by security data on component mount
  useEffect(() => {
    const fetchReturnsData = async () => {
      try {
        const response = await axios.get('/api/returns/total-by-security');
        setReturnsData(response.data);
        setReturnsLoading(false);
      } catch (err) {
        setReturnsError('Failed to fetch returns by security');
        setReturnsLoading(false);
      }
    };
    fetchReturnsData();
  }, []);

  // Fetch returns by sector data on component mount
  useEffect(() => {
    const fetchSectorReturnsData = async () => {
      try {
        const response = await axios.get('/api/returns/total-by-sector');
        setSectorReturnsData(response.data);
        setSectorReturnsLoading(false);
      } catch (err) {
        setSectorReturnsError('Failed to fetch returns by sector');
        setSectorReturnsLoading(false);
      }
    };
    fetchSectorReturnsData();
  }, []);

  // Fetch portfolio metrics for bottom cards
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await axios.get('/api/portfolio/metrics');
        setMetrics(response.data);
      } catch (err) {
        // leave metrics null on error
      } finally {
        setMetricsLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  // Sort data based on display mode
  const sortedReturnsData = useMemo(() => {
    if (!returnsData || returnsData.length === 0) return [];
    
    return [...returnsData].sort((a, b) => {
      if (showDollars) {
        return b.return_dollars - a.return_dollars; // Sort by dollars descending
      } else {
        return b.return_percent - a.return_percent; // Sort by percentage descending
      }
    });
  }, [returnsData, showDollars]);

  // Sort sector data based on display mode
  const sortedSectorReturnsData = useMemo(() => {
    if (!sectorReturnsData || sectorReturnsData.length === 0) return [];
    
    return [...sectorReturnsData].sort((a, b) => {
      if (showSectorDollars) {
        return b.return_dollars - a.return_dollars; // Sort by dollars descending
      } else {
        return b.return_percent - a.return_percent; // Sort by percentage descending
      }
    });
  }, [sectorReturnsData, showSectorDollars]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Helmet>
        <title>Portfolio Performance | MPM</title>
      </Helmet>
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Portfolio Performance</h1>
      
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
        MIDDLE SECTION: Total Return by Security bar chart
        This bar chart shows the total return percentage (unrealized + realized + dividends) for each security
      */}
      <div className="w-full p-6 bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg mb-6 overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Total Return by Security
          </h2>
          {/* Toggle for percentage vs dollars */}
          <div className="flex items-center space-x-3">
            <span className={`text-sm ${!showDollars ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              Percentage
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only"
                checked={showDollars}
                onChange={(e) => setShowDollars(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
            <span className={`text-sm ${showDollars ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              Dollars
            </span>
          </div>
        </div>
        
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
          // Bar Chart - Total Return by Security
          <div className="h-[500px]"> {/* Fixed height container for the chart */}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedReturnsData}
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
                
                {/* Y-axis - percentage returns or dollars */}
                <YAxis
                  tickFormatter={(value) => showDollars ? `$${value.toLocaleString()}` : `${value.toFixed(1)}%`}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={{ stroke: '#374151', strokeWidth: 1 }}
                />
                
                {/* Tooltip */}
                <Tooltip
                  formatter={(value: number) => showDollars ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${value.toFixed(2)}%`}
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
                <Bar 
                  dataKey={showDollars ? "return_dollars" : "return_percent"} 
                  name={showDollars ? "Total Return $" : "Total Return %"} 
                  radius={[4, 4, 0, 0]} // Rounded top corners
                >
                  {/* Map each data point to a cell with a color from the COLORS array */}
                  {sortedReturnsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      
      {/* 
        SECTOR SECTION: Total Return by Sector bar chart
        This bar chart shows the total return percentage (unrealized + realized + dividends) for each sector
      */}
      <div className="w-full p-6 bg-gray-100 dark:bg-gray-800/90 rounded-xl shadow-lg mb-6 overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Total Return by Sector
          </h2>
          {/* Toggle for percentage vs dollars */}
          <div className="flex items-center space-x-3">
            <span className={`text-sm ${!showSectorDollars ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              Percentage
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only"
                checked={showSectorDollars}
                onChange={(e) => setShowSectorDollars(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
            <span className={`text-sm ${showSectorDollars ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              Dollars
            </span>
          </div>
        </div>
        
        {/* Chart content with loading/error states */}
        {sectorReturnsLoading ? (
          // Loading state
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          </div>
        ) : sectorReturnsError ? (
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
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">{sectorReturnsError}</div>
              </div>
            </div>
          </div>
        ) : (
          // Bar Chart - Total Return by Sector
          <div className="h-[400px]"> {/* Fixed height container for the chart */}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedSectorReturnsData}
                margin={{ top: 20, right: 30, left: 40, bottom: 50 }} // Less bottom margin since sector names are shorter
              >
                {/* Grid lines */}
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} vertical={false} horizontal={true} />
                
                {/* X-axis - sectors */}
                <XAxis
                  dataKey="sector"
                  angle={-25} // Slight rotation for sector names
                  textAnchor="end"
                  height={60} // Height for rotated labels
                  interval={0} // Show all labels
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={{ stroke: '#374151', strokeWidth: 1 }}
                />
                
                {/* Y-axis - percentage returns or dollars */}
                <YAxis
                  tickFormatter={(value) => showSectorDollars ? `$${value.toLocaleString()}` : `${value.toFixed(1)}%`}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={{ stroke: '#374151', strokeWidth: 1 }}
                />
                
                {/* Tooltip */}
                <Tooltip
                  formatter={(value: number) => showSectorDollars ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${value.toFixed(2)}%`}
                  labelFormatter={(label: string) => `Sector: ${label}`} // Format label
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
                <Bar 
                  dataKey={showSectorDollars ? "return_dollars" : "return_percent"} 
                  name={showSectorDollars ? "Total Return $" : "Total Return %"} 
                  radius={[4, 4, 0, 0]} // Rounded top corners
                >
                  {/* Map each data point to a cell with a color from the COLORS array */}
                  {sortedSectorReturnsData.map((entry, index) => (
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
        {metricsLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Annualized Return */}
            <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
              <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Annualized Return</h3>
              <p className={`text-xl font-bold ${metrics && metrics.annualized_return_percent !== null && metrics.annualized_return_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics && metrics.annualized_return_percent !== null
                  ? `${metrics.annualized_return_percent.toFixed(2)}%`
                  : '—'}
              </p>
            </div>

            {/* YTD Return */}
            <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
              <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">YTD Return</h3>
              <p className={`text-xl font-bold ${metrics && metrics.ytd_return_percent !== null && metrics.ytd_return_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics && metrics.ytd_return_percent !== null
                  ? `${metrics.ytd_return_percent.toFixed(2)}%`
                  : '—'}
              </p>
            </div>

            {/* Total Return */}
            <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
              <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Return</h3>
              <p className={`text-xl font-bold ${metrics && metrics.total_return_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics ? `${metrics.total_return_percent.toFixed(2)}%` : '—'}
              </p>
              {metrics && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ${metrics.total_return_dollars.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            {/* Volatility */}
            <div className="bg-white dark:bg-gray-700 p-3 rounded-lg shadow">
              <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Volatility (1Y)</h3>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {metrics && metrics.volatility_1y !== null
                  ? `${metrics.volatility_1y.toFixed(2)}%`
                  : '—'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioPerformancePage;

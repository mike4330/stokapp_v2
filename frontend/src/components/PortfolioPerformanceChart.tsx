/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * PortfolioPerformanceChart Component
 * 
 * Line chart showing overall portfolio performance over time. Includes total
 * return, comparison to benchmarks, and annotations for significant events.
 * Supports multiple time periods and chart overlays.
 */

import React, { useState, useEffect } from 'react';
// Recharts components for data visualization
import {
  ResponsiveContainer,  // Wrapper for responsive charts
  ComposedChart,        // Chart type that can combine multiple chart types
  XAxis,                // X-axis component
  YAxis,                // Y-axis component
  CartesianGrid,        // Grid lines
  Tooltip,              // Tooltip for data points
  Line                  // Line chart component
} from 'recharts';
import axios from 'axios';
import { format, parseISO } from 'date-fns';

// Type definition for portfolio historical data points
interface HistoricalDataPoint {
  date: string;      // Date string (will be formatted for display)
  value: number;     // Current portfolio value
  cost: number;      // Cost basis of portfolio
}

// Hook to detect Tailwind dark mode
function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () =>
      setIsDark(document.documentElement.classList.contains('dark'));
    checkDark();
    // If you have a custom event for theme change, listen for it
    // Otherwise, you may want to listen for storage or mutation events if your theme changes dynamically
    // For most Tailwind setups, a page reload or context will update the class
    // window.addEventListener('classChange', checkDark);
    // return () => window.removeEventListener('classChange', checkDark);
  }, []);

  return isDark;
}

const PortfolioPerformanceChart: React.FC = () => {
  // State for storing historical portfolio data
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isDark = useIsDarkMode();

  // Fetch historical portfolio data on component mount
  useEffect(() => {
    const fetchHistoricalData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`Fetching portfolio data`);
        // API call to get historical portfolio data
        const response = await axios.get('/api/portfolio/historical');
        
        console.log('API response:', response.data);
        console.log('Response data length:', response.data.length);
        
        // Check if data is empty
        if (!response.data || response.data.length === 0) {
          console.error('Received empty data from API');
          setError('No historical portfolio data available.');
          setIsLoading(false);
          return;
        }
        
        // Log first data point for debugging
        if (response.data.length > 0) {
          console.log('First data point:', response.data[0]);
        }
        
        // Format the data for the chart - ensure proper number parsing
        const formattedData = response.data.map((item: any) => ({
          date: item.date,
          // Ensure numbers with fallbacks
          value: item.value !== null ? parseFloat(item.value) : 0,
          cost: item.cost !== null ? parseFloat(item.cost) : 0,
        }));
        
        console.log('Formatted data length:', formattedData.length);
        
        setHistoricalData(formattedData);
      } catch (err) {
        console.error("Failed to fetch portfolio historical data", err);
        setError("Failed to load portfolio data. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistoricalData();
  }, []);
  
  // Helper function: Format date for tooltip and x-axis
  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'MMM dd, yyyy');
    } catch (e) {
      return dateStr;
    }
  };
  
  // Custom tooltip component for the chart
  // This controls what appears when hovering over data points
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-700 p-3 border border-gray-200 dark:border-gray-600 shadow-md rounded-md">
          <p className="font-semibold text-gray-800 dark:text-gray-200">{formatDate(label)}</p>
          <p className="text-red-500 dark:text-red-400">
            <span className="font-medium">Value:</span> ${payload[0].value.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </p>
          <p className="text-blue-500 dark:text-blue-400">
            <span className="font-medium">Cost:</span> ${payload[1].value.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}
          </p>
        </div>
      );
    }
    return null;
  };

  // Calculate nice round Y-axis ticks for better user experience
  const calculateNiceYAxisConfig = (data: HistoricalDataPoint[]) => {
    if (!data || data.length === 0) return { domain: [0, 0], ticks: [] };

    // Find min and max values across all data points
    const allValues = data.flatMap(d => [d.value, d.cost]);
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);

    // Calculate range and determine nice tick interval
    const range = dataMax - dataMin;

    // Determine tick interval based on range (nice round numbers)
    let tickInterval;
    if (range <= 1000) tickInterval = 100;        // $100 increments
    else if (range <= 5000) tickInterval = 500;   // $500 increments
    else if (range <= 10000) tickInterval = 1000; // $1k increments
    else if (range <= 50000) tickInterval = 2500; // $2.5k increments
    else tickInterval = 5000;                     // $5k increments

    // Calculate nice domain bounds (round to nearest tick interval)
    const domainMin = Math.floor(dataMin / tickInterval) * tickInterval;
    const domainMax = Math.ceil(dataMax / tickInterval) * tickInterval;

    // Generate explicit ticks array
    const ticks = [];
    for (let tick = domainMin; tick <= domainMax; tick += tickInterval) {
      ticks.push(tick);
    }

    return {
      domain: [domainMin, domainMax],
      ticks
    };
  };

  // Loading state
  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-gray-600 dark:text-gray-300">Loading portfolio data...</div>;
  }

  // Error state
  if (error) {
    return <div className="text-red-500 text-center h-64 flex items-center justify-center">{error}</div>;
  }

  // Calculate nice Y-axis configuration for the chart
  const yAxisConfig = calculateNiceYAxisConfig(historicalData);

  return (
    <div className="h-full flex flex-col">
      {/* Chart title */}
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Portfolio Performance</h2>
      </div>
      
      {/* Custom legend for the chart */}
      <div className="flex flex-wrap justify-center gap-4 pt-1 pb-2">
        <div className="flex items-center px-2 py-1">
          <div className="w-6 h-1 mr-2 rounded-full" style={{ backgroundColor: "#ef4444" }} />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Value</span>
        </div>
        <div className="flex items-center px-2 py-1">
          <div className="w-6 h-1 mr-2 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Cost</span>
        </div>
      </div>
      
      {/* The actual chart component - This is where the visualization is rendered */}
      <div className="flex-grow h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={historicalData}
            margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
          >
            {/* Grid lines */}
            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" strokeOpacity={0.4} vertical={false} />
            
            {/* X-axis configuration */}
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => {
                try {
                  const date = parseISO(value);
                  return format(date, 'MM/dd/yy'); // Format date for display
                } catch (e) {
                  return value;
                }
              }}
              tick={{ fontSize: 11, fill: isDark ? '#F3F4F6' : '#374151' }}
              padding={{ left: 5, right: 5 }}
              minTickGap={30}
              stroke="#888"
              axisLine={{ stroke: '#444', strokeWidth: 0.5 }}
              tickLine={{ stroke: '#444', strokeWidth: 0.5 }}
            />
            
            {/* Y-axis configuration */}
            <YAxis
              tickFormatter={value => `$${(value / 1000).toFixed(0)}k`} // Format as $XXk
              tick={{ fontSize: 11, fill: isDark ? '#F3F4F6' : '#374151' }}
              domain={yAxisConfig.domain} // Nice round domain bounds
              ticks={yAxisConfig.ticks} // Explicit nice round ticks
              stroke="#888"
              width={45}
              axisLine={{ stroke: '#444', strokeWidth: 0.5 }}
              tickLine={{ stroke: '#444', strokeWidth: 0.5 }}
            />
            
            {/* Tooltip */}
            <Tooltip content={<CustomTooltip />} />
            
            {/* Value line (red) */}
            <Line 
              type="monotone" 
              dataKey="value" 
              name="Value" 
              stroke="#ef4444" // Red color
              dot={false} // No dots on data points
              strokeWidth={1.5}
              activeDot={{ r: 6 }} // Larger dot on hover
              isAnimationActive={false} // Disable animations for performance
            />
            
            {/* Cost line (blue) */}
            <Line 
              type="monotone" 
              dataKey="cost" 
              name="Cost" 
              stroke="#3b82f6" // Blue color
              dot={false} // No dots on data points
              strokeWidth={2}
              isAnimationActive={false} // Disable animations for performance
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PortfolioPerformanceChart;

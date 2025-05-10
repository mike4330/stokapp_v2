/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * PriceHistoryChart Component
 * 
 * Interactive line chart showing historical price data for a security. Includes
 * moving averages, volume data, and zoom/pan capabilities. Supports multiple
 * timeframe selections.
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
  Legend,
  Scatter,
  ReferenceDot
} from 'recharts';

interface PriceData {
  date: string;
  price: number;
  formattedDate?: string;
}

interface Transaction {
  id: number;
  date: string;
  type: string;
  price: number;
  units: number;
}

interface CombinedData extends PriceData {
  transactions?: Transaction[];
}

interface PriceHistoryChartProps {
  symbol: string;
}

const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({ symbol }) => {
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // State for controlling time window
  const [timeWindow, setTimeWindow] = useState(180); // Default: 180 days
  const [allPriceData, setAllPriceData] = useState<PriceData[]>([]);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [priceResponse, transactionsResponse] = await Promise.all([
          axios.get(`/api/positions/${symbol}/price-history`),
          axios.get(`/api/positions/${symbol}/transactions`)
        ]);
        
        // Reverse the data to show oldest to newest for better visualization
        const sortedData = [...priceResponse.data].reverse();
        setAllPriceData(sortedData); // Store all data
        
        // Apply the current time window
        const visibleData = sortedData.slice(-timeWindow);
        setPriceData(visibleData);
        
        // Filter just buy and sell transactions
        const filteredTransactions = transactionsResponse.data.filter(
          (t: Transaction) => t.type.toLowerCase() === 'buy' || t.type.toLowerCase() === 'sell'
        );
        setTransactions(filteredTransactions);
        
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load chart data');
      } finally {
        setLoading(false);
      }
    };

    if (symbol) {
      fetchData();
    }
  }, [symbol, timeWindow]);

  // Function to adjust time window
  const adjustTimeWindow = (days: number) => {
    const newTimeWindow = Math.max(30, Math.min(allPriceData.length, timeWindow + days));
    setTimeWindow(newTimeWindow);
  };

  const parseDate = (dateString: string) => {
    // Handle different date formats
    return new Date(dateString);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-56 bg-gray-900/50 rounded-lg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900/50 p-4 rounded-lg">
        <h2 className="text-base font-semibold mb-2 text-white">{symbol}: Price History</h2>
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (priceData.length === 0) {
    return (
      <div className="bg-gray-900/50 p-4 rounded-lg">
        <h2 className="text-base font-semibold mb-2 text-white">{symbol}: Price History</h2>
        <div className="text-gray-400">No price history data available</div>
      </div>
    );
  }

  // Format dates for display
  const formattedData = priceData.map(item => ({
    ...item,
    formattedDate: new Date(item.date).toLocaleDateString(),
  }));

  // Determine chart date range
  const chartStartDate = formattedData.length > 0 ? parseDate(formattedData[0].date).getTime() : 0;
  const chartEndDate = formattedData.length > 0 ? parseDate(formattedData[formattedData.length - 1].date).getTime() : 0;
  
  // Filter transactions to only include those within the chart date range
  const visibleTransactions = transactions.filter(transaction => {
    const transactionTime = parseDate(transaction.date).getTime();
    return transactionTime >= chartStartDate && transactionTime <= chartEndDate;
  });

  // Process transactions
  const processedTransactions = visibleTransactions
    // Sort by date
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    // Group by date to avoid too many stacked triangles
    .reduce((acc, transaction) => {
      const dateStr = transaction.date.substring(0, 10); // YYYY-MM-DD part
      const existingIndex = acc.findIndex(t => 
        t.date.substring(0, 10) === dateStr && 
        t.type.toLowerCase() === transaction.type.toLowerCase() &&
        Math.abs(t.price - transaction.price) < 1 // Group similar prices
      );
      
      if (existingIndex >= 0) {
        // Add units to existing transaction instead of creating a new marker
        acc[existingIndex].units += transaction.units;
      } else {
        acc.push(transaction);
      }
      
      return acc;
    }, [] as Transaction[]);

  // Find transaction markers to overlay
  const transactionMarkers = processedTransactions.map(transaction => {
    // Find the closest price data point to this transaction date
    const transactionDate = parseDate(transaction.date);
    
    let bestMatchIndex = 0;
    let smallestDiff = Infinity;
    
    formattedData.forEach((dataPoint, index) => {
      const dataPointDate = parseDate(dataPoint.date);
      const diff = Math.abs(dataPointDate.getTime() - transactionDate.getTime());
      if (diff < smallestDiff) {
        smallestDiff = diff;
        bestMatchIndex = index;
      }
    });
    
    return {
      index: bestMatchIndex,
      type: transaction.type.toLowerCase(),
      price: transaction.price,
      date: transaction.date,
      id: transaction.id,
      units: transaction.units
    };
  });

  // Custom legend to combine price and transaction markers
  const CustomizedLegend = () => {
    return (
      <div className="flex items-center text-xs absolute top-0 right-8">
        <div className="flex items-center mr-3">
          <div className="w-8 h-2 bg-[#8884d8] mr-1" />
          <span className="text-gray-300">Price</span>
        </div>
        <div className="flex items-center mr-3">
          <div className="w-0 h-0 border-l-4 border-r-4 border-b-6 border-transparent border-b-[#4ade80] mr-1" style={{borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '6px solid #4ade80'}} />
          <span className="text-green-300">Buy</span>
        </div>
        <div className="flex items-center">
          <div className="w-0 h-0 border-l-4 border-r-4 border-t-6 border-transparent border-t-[#f87171] mr-1" style={{borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid #f87171'}} />
          <span className="text-red-300">Sell</span>
        </div>
      </div>
    );
  };

  // Get formatted date range for display
  const startDateStr = formattedData.length > 0 ? formattedData[0].formattedDate : 'N/A';
  const endDateStr = formattedData.length > 0 ? formattedData[formattedData.length - 1].formattedDate : 'N/A';

  return (
    <div className="bg-gray-900/50 p-4 rounded-lg relative">
      <h2 className="text-base font-semibold mb-2 text-white flex justify-between items-center">
        <span>Price History</span>
        <div className="flex text-xs items-center">
          <span className="text-gray-400 mr-1">{startDateStr} to {endDateStr}</span>
          <div className="flex ml-2">
            <button 
              onClick={() => adjustTimeWindow(-30)} 
              className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded-l focus:outline-none text-xs"
              title="Show 30 fewer days"
              disabled={timeWindow <= 30}
            >
              -30d
            </button>
            <button 
              onClick={() => adjustTimeWindow(30)} 
              className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded-r focus:outline-none text-xs border-l border-gray-600"
              title="Show 30 more days"
              disabled={timeWindow >= allPriceData.length}
            >
              +30d
            </button>
          </div>
        </div>
      </h2>
      <div className="h-80 relative">
        <CustomizedLegend />
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={formattedData}
            margin={{
              top: 10,
              right: 10,
              left: 0,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis 
              dataKey="formattedDate" 
              tick={{ fill: '#aaa', fontSize: 11 }}
              tickFormatter={(val, idx) => {
                // Show fewer ticks for readability
                return idx % 20 === 0 ? val : '';
              }}
            />
            <YAxis 
              tick={{ fill: '#aaa', fontSize: 11 }}
              tickFormatter={(val) => `$${val.toFixed(2)}`}
              domain={['dataMin', 'dataMax']}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#2a2a2a', 
                borderColor: '#666',
                fontSize: '12px'
              }}
              formatter={(value: number, name: string) => {
                if (name === 'Price') return [`$${value.toFixed(2)}`, 'Price'];
                return [value, name];
              }}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="#8884d8" 
              dot={false}
              strokeWidth={2}
              name="Price"
              isAnimationActive={false}
            />
            
            {/* Transaction markers */}
            {transactionMarkers.map((marker, idx) => (
              <ReferenceDot
                key={marker.id || idx}
                x={formattedData[marker.index]?.formattedDate}
                y={marker.price}
                r={5}
                fill={marker.type === 'buy' ? '#4ade80' : '#f87171'}
                stroke={marker.type === 'buy' ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                ifOverflow="extendDomain"
                shape={props => {
                  const { cx, cy, fill, stroke } = props;
                  // Size based on units (with a reasonable min/max)
                  const size = Math.min(Math.max(4, Math.sqrt(marker.units) * 1.2), 10);
                  
                  // Triangle pointing up for buy, down for sell
                  if (marker.type === 'buy') {
                    return (
                      <polygon 
                        points={`${cx},${cy-size} ${cx-size*0.8},${cy+size*0.5} ${cx+size*0.8},${cy+size*0.5}`} 
                        fill={fill} 
                        stroke={stroke}
                      />
                    );
                  } else {
                    return (
                      <polygon 
                        points={`${cx},${cy+size} ${cx-size*0.8},${cy-size*0.5} ${cx+size*0.8},${cy-size*0.5}`} 
                        fill={fill} 
                        stroke={stroke}
                      />
                    );
                  }
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PriceHistoryChart; 

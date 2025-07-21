/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DividendData {
  date: string;
  symbol: string;
  cost: number;
}

interface UpcomingDividend {
  symbol: string;
  payment_date: string;
  amount: number;
  expected_payment: number;
}

interface DividendChartsProps {}

const DividendCharts: React.FC<DividendChartsProps> = () => {
  const [dividendData, setDividendData] = useState<{ [symbol: string]: DividendData[] }>({});
  const [upcomingDividends, setUpcomingDividends] = useState<UpcomingDividend[]>([]);
  const [currentHoldings, setCurrentHoldings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateRandomColor = () => {
    const r = Math.floor(Math.random() * 226);
    const g = Math.floor(Math.random() * 226);
    const b = Math.floor(Math.random() * 226);
    return `rgb(${r}, ${g}, ${b})`;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Get current holdings first
        const holdingsResponse = await fetch('/api/holdings');
        if (!holdingsResponse.ok) {
          throw new Error('Failed to fetch holdings');
        }
        const holdingsData = await holdingsResponse.json();
        const symbols = holdingsData.map((holding: any) => holding.symbol);
        setCurrentHoldings(symbols);

        // Fetch dividend history for each symbol
        const dividendPromises = symbols.map(async (symbol: string) => {
          try {
            const response = await fetch(`/api/dividends/history/${symbol}`);
            if (response.ok) {
              const data = await response.json();
              return { symbol, data };
            }
          } catch (err) {
            console.warn(`Failed to fetch dividend data for ${symbol}:`, err);
          }
          return { symbol, data: [] };
        });

        const dividendResults = await Promise.all(dividendPromises);
        const dividendMap: { [symbol: string]: DividendData[] } = {};
        
        dividendResults.forEach(({ symbol, data }) => {
          if (data && data.length > 0) {
            dividendMap[symbol] = data;
          }
        });

        setDividendData(dividendMap);

        // Fetch upcoming dividends
        try {
          const upcomingResponse = await fetch('/api/dividends/calendar');
          if (upcomingResponse.ok) {
            const upcomingData = await upcomingResponse.json();
            setUpcomingDividends(upcomingData.filter((div: any) => div.expected_payment > 0));
          }
        } catch (err) {
          console.warn('Failed to fetch upcoming dividends:', err);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="text-lg">Loading dividend charts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-600">
        <div className="text-lg">Error: {error}</div>
      </div>
    );
  }

  const symbolsWithDividends = Object.keys(dividendData).filter(symbol => 
    dividendData[symbol].length > 0
  );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
        Dividend History Charts
      </h1>

      {/* Upcoming Dividends Section */}
      {upcomingDividends.length > 0 && (
        <div className="mb-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Upcoming Dividends
          </h2>
          <div className="flex flex-wrap gap-2 font-mono text-sm">
            {upcomingDividends.map((dividend, index) => (
              <span 
                key={index}
                className="inline-block border-2 border-green-600 dark:border-green-400 px-2 py-1 rounded bg-white dark:bg-gray-700"
              >
                {dividend.payment_date} {dividend.symbol} - ${dividend.expected_payment.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      {symbolsWithDividends.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {symbolsWithDividends.map((symbol) => {
            const data = dividendData[symbol];
            const color = generateRandomColor();
            
            // Calculate Y-axis domain for better visualization
            const values = data.map(d => d.cost);
            const minValue = Math.min(...values);
            const maxValue = Math.max(...values);
            const range = maxValue - minValue;
            
            // Use a non-zero Y axis if the minimum value is significantly above zero
            // and the range is small relative to the minimum
            const useNonZeroAxis = minValue > 0 && (range / minValue) < 2;
            
            let yAxisDomain: [number, number] | ['auto', 'auto'];
            if (useNonZeroAxis) {
              const padding = range * 0.1;
              const domainMin = Math.max(0, minValue - padding);
              const domainMax = maxValue + padding;
              // Round to reasonable precision to avoid floating point display issues
              const precision = range < 1 ? 2 : range < 10 ? 1 : 0;
              yAxisDomain = [
                Math.round(domainMin * Math.pow(10, precision)) / Math.pow(10, precision),
                Math.round(domainMax * Math.pow(10, precision)) / Math.pow(10, precision)
              ];
            } else {
              yAxisDomain = ['auto', 'auto'];
            }
            
            return (
              <div 
                key={symbol} 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700"
              >
                <h3 className="text-lg font-semibold mb-3 text-center text-gray-800 dark:text-gray-200">
                  {symbol}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }}
                        stroke="#6B7280"
                      />
                      <YAxis 
                        tick={{ fontSize: 10 }}
                        stroke="#6B7280"
                        domain={yAxisDomain}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#374151',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#F9FAFB'
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Dividend']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cost" 
                        stroke={color}
                        strokeWidth={2}
                        fill={color}
                        fillOpacity={0.3}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-gray-600 dark:text-gray-400 mt-8">
          <p className="text-lg">No dividend history found for current holdings.</p>
          <p className="mt-2">Only symbols with dividend payment history will appear here.</p>
        </div>
      )}
    </div>
  );
};

export default DividendCharts;
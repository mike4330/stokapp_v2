/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface HoldingCount {
  sector: string;
  large: number;
  medium: number;
  small: number;
  total: number;
}

interface ApiResponse {
  holdings: HoldingCount[];
  totals: {
    large: number;
    medium: number;
    small: number;
    total: number;
  };
}

const SectorMarketCapMatrix: React.FC = () => {
  const [data, setData] = useState<HoldingCount[]>([]);
  const [totals, setTotals] = useState({ large: 0, medium: 0, small: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Endpoint to be implemented
        const response = await axios.get<ApiResponse>('/api/holdings-by-sector-marketcap');
        setData(response.data.holdings);
        setTotals(response.data.totals);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch sector/market cap data');
        setLoading(false);
        console.error('Error fetching sector/market cap data:', err);
      }
    };

    fetchData();

    // Mock data for development until API endpoint is created
    const mockData: HoldingCount[] = [
      { sector: 'Communication Services', large: 3, medium: 1, small: 2, total: 6 },
      { sector: 'Consumer Discretionary', large: 2, medium: 3, small: 2, total: 7 },
      { sector: 'Consumer Staples', large: 3, medium: 2, small: 1, total: 6 },
      { sector: 'Energy', large: 2, medium: 2, small: 3, total: 7 },
      { sector: 'Financials', large: 4, medium: 1, small: 2, total: 7 },
      { sector: 'Healthcare', large: 3, medium: 2, small: 1, total: 6 },
      { sector: 'Industrials', large: 1, medium: 3, small: 2, total: 6 },
      { sector: 'Materials', large: 2, medium: 2, small: 2, total: 6 },
      { sector: 'Real Estate', large: 1, medium: 3, small: 2, total: 6 },
      { sector: 'Tech', large: 5, medium: 2, small: 1, total: 8 },
      { sector: 'Utilities', large: 1, medium: 2, small: 3, total: 6 }
    ];
    
    const mockTotals = {
      large: mockData.reduce((sum, item) => sum + item.large, 0),
      medium: mockData.reduce((sum, item) => sum + item.medium, 0),
      small: mockData.reduce((sum, item) => sum + item.small, 0),
      total: mockData.reduce((sum, item) => sum + item.total, 0)
    };
    
    // Use mock data during development
    setData(mockData);
    setTotals(mockTotals);
    setLoading(false);
  }, []);

  const getCellColor = (count: number, marketCap: string) => {
    // Set color based on count and market cap
    if (count === 0) return 'bg-gray-100 dark:bg-gray-700';
    
    // Different blue shades based on concentration level
    if (marketCap === 'large') {
      if (count >= 4) return 'bg-blue-800';
      if (count >= 2) return 'bg-blue-600';
      return 'bg-blue-400';
    } else if (marketCap === 'medium') {
      if (count >= 3) return 'bg-blue-800';
      if (count >= 2) return 'bg-blue-600';
      return 'bg-blue-400';
    } else if (marketCap === 'small') {
      if (count >= 3) return 'bg-blue-800';
      if (count >= 2) return 'bg-blue-600';
      return 'bg-blue-400';
    }
    
    return 'bg-gray-200 dark:bg-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
            <div className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">Sector</th>
            <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">Large</th>
            <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">Medium</th>
            <th className="px-4 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">Small</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index}>
              <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">{row.sector}</td>
              <td className={`px-4 py-2 text-center text-sm ${getCellColor(row.large, 'large') === 'bg-blue-800' || getCellColor(row.large, 'large') === 'bg-blue-600' ? 'text-white' : 'text-gray-900 dark:text-gray-100'} border border-gray-200 dark:border-gray-700 ${getCellColor(row.large, 'large')}`}>{row.large}</td>
              <td className={`px-4 py-2 text-center text-sm ${getCellColor(row.medium, 'medium') === 'bg-blue-800' || getCellColor(row.medium, 'medium') === 'bg-blue-600' ? 'text-white' : 'text-gray-900 dark:text-gray-100'} border border-gray-200 dark:border-gray-700 ${getCellColor(row.medium, 'medium')}`}>{row.medium}</td>
              <td className={`px-4 py-2 text-center text-sm ${getCellColor(row.small, 'small') === 'bg-blue-800' || getCellColor(row.small, 'small') === 'bg-blue-600' ? 'text-white' : 'text-gray-900 dark:text-gray-100'} border border-gray-200 dark:border-gray-700 ${getCellColor(row.small, 'small')}`}>{row.small}</td>
            </tr>
          ))}
          <tr className="font-semibold bg-gray-50 dark:bg-gray-800">
            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">Totals</td>
            <td className="px-4 py-2 text-center text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">{totals.large}</td>
            <td className="px-4 py-2 text-center text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">{totals.medium}</td>
            <td className="px-4 py-2 text-center text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">{totals.small}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default SectorMarketCapMatrix; 
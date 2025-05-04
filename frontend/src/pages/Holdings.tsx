/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface Holding {
  symbol: string;
  units: number;
  current_price: number;
  position_value: number;
  ma50: number | null;
  ma200: number | null;
  overamt: number | null;
  price_change: number | null;
  price_change_pct: number | null;
}

type SortColumn = 'symbol' | 'units' | 'position_value' | 'portfolio_percent' | 'overamt' | 'price_change_pct';
type SortDirection = 'asc' | 'desc';

// Memoized indicator component to prevent unnecessary re-renders
const PriceIndicator = React.memo(({ 
  label, 
  isAbove 
}: { 
  label: string; 
  isAbove: boolean 
}) => (
  <span 
    className={`
      inline-flex items-center justify-center w-16 h-6 rounded-md text-xs font-medium
      ${isAbove ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'}
    `}
  >
    <span className="inline-flex items-center">
      {isAbove ? '↑' : '↓'}
      <span className="ml-0.5">{label}</span>
    </span>
  </span>
));

// Memoized table row to prevent unnecessary re-renders
const HoldingRow = React.memo(({ 
  holding, 
  totalValue 
}: { 
  holding: Holding; 
  totalValue: number 
}) => (
  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
    <td className="whitespace-nowrap py-1 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-100 sm:pl-6">
      <Link 
        to={`/positions/${holding.symbol}`}
        className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
      >
        {holding.symbol}
      </Link>
    </td>
    <td className="whitespace-nowrap px-3 py-1 text-sm text-gray-500 dark:text-gray-300 font-mono">
      {holding.units.toFixed(4)}
    </td>
    <td className="whitespace-nowrap px-3 py-1 text-sm text-gray-500 dark:text-gray-300 font-mono">
      ${holding.current_price.toFixed(2)}
    </td>
    <td className="whitespace-nowrap px-3 py-1 text-sm flex justify-center space-x-2">
      {holding.ma50 && (
        <PriceIndicator 
          label="MA50" 
          isAbove={holding.current_price >= holding.ma50} 
        />
      )}
      {holding.ma200 && (
        <PriceIndicator 
          label="MA200" 
          isAbove={holding.current_price >= holding.ma200} 
        />
      )}
    </td>
    <td className="whitespace-nowrap px-3 py-1 text-sm font-mono">
      <span className={`
        ${holding.price_change_pct && holding.price_change_pct > 0 ? 'text-green-600 dark:text-green-400' : ''}
        ${holding.price_change_pct && holding.price_change_pct < 0 ? 'text-red-600 dark:text-red-400' : ''}
      `}>
        {holding.price_change_pct ? (
          <>
            {holding.price_change_pct > 0 ? '+' : ''}
            {holding.price_change_pct.toFixed(2)}%
            <span className="text-xs ml-1">
              ({holding.price_change && holding.price_change > 0 ? '+' : ''}
              ${holding.price_change?.toFixed(2)})
            </span>
          </>
        ) : 'N/A'}
      </span>
    </td>
    <td className="whitespace-nowrap px-3 py-1 text-sm text-gray-500 dark:text-gray-300 font-mono">
      ${holding.position_value.toFixed(2)}
    </td>
    <td className="whitespace-nowrap px-3 py-1 text-sm text-gray-500 dark:text-gray-300 font-mono">
      {((holding.position_value / totalValue) * 100).toFixed(2)}%
    </td>
    <td className="whitespace-nowrap px-3 py-1 text-sm text-gray-500 dark:text-gray-300 font-mono">
      {holding.overamt?.toFixed(2) || 'N/A'}
    </td>
  </tr>
));

// Memoized sort header to prevent unnecessary re-renders  
const SortHeader = React.memo(({ 
  label, 
  column, 
  currentSort, 
  currentDirection, 
  onSort 
}: { 
  label: string;
  column: SortColumn;
  currentSort: SortColumn;
  currentDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}) => (
  <th 
    scope="col" 
    className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
    onClick={() => onSort(column)}
  >
    <div className="flex items-center">
      {label}
      {currentSort === column && (
        <span className="ml-1">
          {currentDirection === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </div>
  </th>
));

const Holdings: React.FC = () => {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Memoize API request to prevent creating new functions on each render
  const fetchHoldings = useCallback(async () => {
    // Use AbortController for clean cancellation on unmount
    const controller = new AbortController();
    
    try {
      const response = await axios.get('/api/holdings', {
        signal: controller.signal
      });
      setHoldings(response.data);
      setLoading(false);
    } catch (err) {
      // Only set error if not aborted
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setError('Failed to fetch holdings');
        setLoading(false);
        console.error('Error fetching holdings:', err);
      }
    }
    
    return controller;
  }, []);

  useEffect(() => {
    const controller = fetchHoldings();
    
    // Clean up request on unmount
    return () => {
      controller.then(c => c.abort());
    };
  }, [fetchHoldings]);

  // Memoize sort handler to prevent recreating on each render
  const handleSort = useCallback((column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Memoize totalValue calculation
  const totalValue = useMemo(() => 
    holdings.reduce((sum, holding) => sum + holding.position_value, 0),
    [holdings]
  );

  // Memoize sorted holdings to prevent recalculation on every render
  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'units':
          comparison = a.units - b.units;
          break;
        case 'position_value':
          comparison = a.position_value - b.position_value;
          break;
        case 'portfolio_percent':
          const aPercent = (a.position_value / totalValue) * 100;
          const bPercent = (b.position_value / totalValue) * 100;
          comparison = aPercent - bPercent;
          break;
        case 'overamt':
          comparison = (a.overamt || 0) - (b.overamt || 0);
          break;
        case 'price_change_pct':
          comparison = (a.price_change_pct || 0) - (b.price_change_pct || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [holdings, sortColumn, sortDirection, totalValue]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
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
    <div className="py-8">
      {/* Portfolio Summary - No changes needed here */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Portfolio Value</h3>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
            ${totalValue.toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Number of Holdings</h3>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
            {holdings.length}
          </p>
        </div>
      </div>

      {/* Holdings Table - Using memoized components */}
      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <SortHeader 
                      label="Symbol" 
                      column="symbol" 
                      currentSort={sortColumn}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortHeader 
                      label="Units" 
                      column="units" 
                      currentSort={sortColumn}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <th scope="col" className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Current Price
                    </th>
                    <th scope="col" className="px-3 py-1 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Indicators
                    </th>
                    <SortHeader 
                      label="Price Change" 
                      column="price_change_pct" 
                      currentSort={sortColumn}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortHeader 
                      label="Position Value" 
                      column="position_value" 
                      currentSort={sortColumn}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortHeader 
                      label="Portfolio %" 
                      column="portfolio_percent" 
                      currentSort={sortColumn}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortHeader 
                      label="Overamt" 
                      column="overamt" 
                      currentSort={sortColumn}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
                  {sortedHoldings.map((holding) => (
                    <HoldingRow 
                      key={holding.symbol} 
                      holding={holding} 
                      totalValue={totalValue} 
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Holdings;

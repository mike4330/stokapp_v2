/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

interface AccountHolding {
  symbol: string;
  units: number;
  current_price: number;
  position_value: number;
  ma50: number | null;
  ma200: number | null;
  overamt: number | null;
  price_change: number | null;
  price_change_pct: number | null;
  unrealized_gain: number;
  unrealized_gain_percent: number;
  acct: string;
}

interface AccountStats {
  totalValue: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPercent: number;
  numPositions: number;
  avgPositionSize: number;
  largestPosition: {
    symbol: string;
    value: number;
    percent: number;
  };
}

interface HoldingsByAccount {
  [account: string]: AccountHolding[];
}

const PortfolioDetails: React.FC = () => {
  const [holdings, setHoldings] = useState<AccountHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHoldings = useCallback(async () => {
    const controller = new AbortController();
    
    try {
      const response = await axios.get('/api/holdings?group_by_account=true', {
        signal: controller.signal
      });
      console.log('Holdings data from API (full structure):', JSON.stringify(response.data, null, 2));
      setHoldings(response.data);
      setLoading(false);
    } catch (err) {
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
    return () => {
      controller.then(c => c.abort());
    };
  }, [fetchHoldings]);

  // Group holdings by account
  const holdingsByAccount = holdings.reduce<HoldingsByAccount>((acc, holding) => {
    if (!acc[holding.acct]) {
      acc[holding.acct] = [];
    }
    acc[holding.acct].push(holding);
    return acc;
  }, {});

  // Calculate account statistics
  const accountStats = Object.entries(holdingsByAccount).reduce<{[key: string]: AccountStats}>((acc, [account, holdings]) => {
    const totalValue = holdings.reduce((sum, h) => sum + h.position_value, 0);
    const totalUnrealizedGain = holdings.reduce((sum, h) => sum + h.unrealized_gain, 0);
    const totalUnrealizedGainPercent = (totalUnrealizedGain / totalValue) * 100;
    
    // Find largest position
    const largestPosition = holdings.reduce((max, h) => 
      h.position_value > max.value ? { symbol: h.symbol, value: h.position_value, percent: (h.position_value / totalValue) * 100 } : max,
      { symbol: '', value: 0, percent: 0 }
    );

    acc[account] = {
      totalValue,
      totalUnrealizedGain,
      totalUnrealizedGainPercent,
      numPositions: holdings.length,
      avgPositionSize: totalValue / holdings.length,
      largestPosition
    };
    return acc;
  }, {});

  // Calculate overall portfolio total
  const totalPortfolioValue = Object.values(accountStats).reduce((sum, stats) => sum + stats.totalValue, 0);

  // Helper for comma-separated currency
  const formatCurrency = (value: number) =>
    `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // --- BEGIN stacked bar chart logic ---
  // 1. Assign colors to accounts
  const accountColors: string[] = [
    '#64748b', // slate-500
    '#6366f1', // indigo-500
    '#14b8a6', // teal-500
    '#f59e42', // amber-500
    '#a78bfa', // violet-400
    '#10b981', // emerald-500
    '#06b6d4', // cyan-500
    '#f43f5e', // rose-500
  ];

  // 2. Aggregate: symbol -> { [acct]: value }
  const symbolAccountMap: { [symbol: string]: { [acct: string]: number } } = {};
  holdings.forEach(h => {
    if (!symbolAccountMap[h.symbol]) symbolAccountMap[h.symbol] = {};
    symbolAccountMap[h.symbol][h.acct] = h.position_value;
  });

  // 3. Get all unique accounts (for legend and color assignment)
  const allAccounts = Array.from(new Set(holdings.map(h => h.acct)));

  // 4. For each symbol, sum total value (for width %)
  const symbolTotals: { [symbol: string]: number } = {};
  Object.entries(symbolAccountMap).forEach(([symbol, acctMap]) => {
    symbolTotals[symbol] = Object.values(acctMap).reduce((a, b) => a + b, 0);
  });

  // 5. Bar chart component
  const HoldingStackedBarChart = () => (
    <div>
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Holdings by Account</h2>
      <div className="mb-4 flex gap-4">
        {allAccounts.map((acct, i) => (
          <div key={acct} className="flex items-center gap-2">
            <span style={{
              display: 'inline-block',
              width: 20,
              height: 12,
              background: accountColors[i % accountColors.length],
              borderRadius: 2,
              border: '1px solid #d1d5db',
            }} />
            <span className="text-xs text-gray-700 dark:text-gray-200">{acct}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Object.entries(symbolAccountMap).map(([symbol, acctMap]) => (
          <div key={symbol} className="flex items-center gap-2">
            <div style={{ width: 120, textAlign: 'right' }} className="font-mono text-xs text-gray-700 dark:text-gray-200">{symbol}</div>
            <div style={{ flex: 1, display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', background: '#f3f4f6' }}>
              {allAccounts.map((acct, i) => {
                const value = acctMap[acct] || 0;
                const percent = symbolTotals[symbol] ? (value / symbolTotals[symbol]) * 100 : 0;
                return value > 0 ? (
                  <div
                    key={acct}
                    style={{
                      width: `${percent}%`,
                      background: accountColors[i % accountColors.length],
                      height: '100%',
                    }}
                    title={`${acct}: ${formatCurrency(value)}`}
                  />
                ) : null;
              })}
            </div>
            <div className="ml-2 text-xs font-mono text-gray-700 dark:text-gray-200">{formatCurrency(symbolTotals[symbol])}</div>
          </div>
        ))}
      </div>
    </div>
  );

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Portfolio Details</h1>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Total Portfolio Value: {formatCurrency(totalPortfolioValue)}</h2>
        </div>
        <div className="mb-8 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <HoldingStackedBarChart />
        </div>
      </div>

      {Object.entries(holdingsByAccount).map(([account, accountHoldings]) => {
        const stats = accountStats[account];
        return (
          <div key={account} className="mb-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    <span className="inline-block px-2 py-1 text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 rounded mr-2">{account === 'Unknown' ? 'No Account Specified' : account}</span>
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400">
                    Account Value: {formatCurrency(stats.totalValue)}
                    ({((stats.totalValue / totalPortfolioValue) * 100).toFixed(2)}% of portfolio)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Number of Positions</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{stats.numPositions}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Average Position Size</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    ${stats.avgPositionSize.toFixed(2)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Unrealized P/L</p>
                  <p className={`text-lg font-semibold ${stats.totalUnrealizedGain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {stats.totalUnrealizedGain > 0 ? '+' : ''}${stats.totalUnrealizedGain.toFixed(2)}
                    <span className="text-sm ml-1">
                      ({stats.totalUnrealizedGainPercent > 0 ? '+' : ''}
                      {stats.totalUnrealizedGainPercent.toFixed(2)}%)
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Largest Position</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {stats.largestPosition.symbol} ({stats.largestPosition.percent.toFixed(2)}%)
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Symbol</th>
                      <th className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Units</th>
                      <th className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Current Price</th>
                      <th className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Position Value</th>
                      <th className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">% of Account</th>
                      <th className="px-3 py-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">Unrealized P/L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
                    {accountHoldings.map((holding) => (
                      <tr key={holding.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                          <Link 
                            to={`/positions/${holding.symbol}`}
                            className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300"
                          >
                            {holding.symbol}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100">
                          {holding.units.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100">
                          ${holding.current_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100">
                          ${holding.position_value.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100">
                          {((holding.position_value / stats.totalValue) * 100).toFixed(2)}%
                        </td>
                        <td className="px-3 py-2 text-sm font-mono">
                          <span className={`
                            ${holding.unrealized_gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                          `}>
                            {holding.unrealized_gain > 0 ? '+' : ''}
                            ${holding.unrealized_gain.toFixed(2)}
                            {holding.unrealized_gain_percent !== undefined && (
                              <span className="text-xs ml-1">
                                ({holding.unrealized_gain_percent > 0 ? '+' : ''}
                                {holding.unrealized_gain_percent.toFixed(2)}%)
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PortfolioDetails; 
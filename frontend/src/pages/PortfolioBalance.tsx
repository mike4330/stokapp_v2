/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SectorMarketCapMatrix from '../components/SectorMarketCapMatrix';

interface PotentialLot {
  account: string;
  symbol: string;
  date: string;
  units: number;
  current_price: number;
  current_value: number;
  profit: number;
  profit_pct: number;
  is_long_term: boolean;
  target_diff: number;
}

interface GroupedLots {
  [symbol: string]: {
    lots: PotentialLot[];
    totalValue: number;
    totalProfit: number;
    targetDiff: number;
  };
}

interface FilterControls {
  lotBasis: number;
  returnPct: number;
}

interface Recommendation {
  symbol: string;
  sectorshort: string;
  z_score: number;
  overamt: number;
}

const PortfolioBalance: React.FC = () => {
  const [lots, setLots] = useState<PotentialLot[]>([]);
  const [filteredLots, setFilteredLots] = useState<PotentialLot[]>([]);
  const [groupedLots, setGroupedLots] = useState<GroupedLots>({});
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterControls>({
    lotBasis: 5,
    returnPct: 5,
  });

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [lotsResponse, recommendationsResponse] = await Promise.all([
          axios.get('/api/potential-lots'),
          axios.get('/api/model-recommendations')
        ]);
        setLots(lotsResponse.data);
        setFilteredLots(lotsResponse.data);
        setRecommendations(recommendationsResponse.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Refresh recommendations
  const refreshAndUpdateOveramt = async () => {
    try {
      setLoading(true);
      setError(null);
      const jobResponse = await fetch('/scheduler/job/update_overamt_job/run-now', {
        method: 'POST'
      });
      if (!jobResponse.ok) {
        throw new Error('Failed to trigger update_overamt job');
      }
      // After job completes, fetch recommendations
      const response = await axios.get('/api/model-recommendations');
      setRecommendations(response.data);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters and group by symbol
  useEffect(() => {
    const filtered = lots.filter(lot => 
      lot.current_value >= filters.lotBasis && 
      lot.profit_pct >= filters.returnPct
    );
    setFilteredLots(filtered);

    // Group lots by symbol
    const grouped = filtered.reduce<GroupedLots>((acc, lot) => {
      if (!acc[lot.symbol]) {
        acc[lot.symbol] = {
          lots: [],
          totalValue: 0,
          totalProfit: 0,
          targetDiff: lot.target_diff,
        };
      }
      acc[lot.symbol].lots.push(lot);
      acc[lot.symbol].totalValue += lot.current_value;
      acc[lot.symbol].totalProfit += lot.profit;
      return acc;
    }, {});

    setGroupedLots(grouped);
  }, [lots, filters]);

  // Filter control handlers
  const updateLotBasis = (increment: boolean) => {
    setFilters(prev => ({
      ...prev,
      lotBasis: prev.lotBasis + (increment ? 1 : -1)
    }));
  };

  const updateReturnPct = (increment: boolean) => {
    setFilters(prev => ({
      ...prev,
      returnPct: prev.returnPct + (increment ? 0.5 : -0.5)
    }));
  };

  // Get color for profit percentage
  const getProfitColor = (profitPct: number): string => {
    // Viridis color scheme from the PHP version
    const colors = [
      '#fde725', '#d8e219', '#addc30', '#84d44b', '#5ec962',
      '#3fbc73', '#28ae80', '#1fa088', '#21918c', '#26828e',
      '#2c728e', '#33638d', '#3b528b', '#424086', '#472d7b'
    ];
    
    const thresholds = [
      5, 6.5, 8.5, 11, 14.3, 18.6, 24.1, 31.4, 40.8, 53,
      68.9, 89.6, 116.5
    ];
    
    const index = thresholds.findIndex(t => profitPct <= t);
    return index === -1 ? colors[colors.length - 1] : colors[index];
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
        Portfolio Balance
      </h1>

      {/* Sector-MarketCap Distribution Section */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-6">
          Holdings by Sector & Market Cap
        </h2>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <SectorMarketCapMatrix />
        </div>
      </div>

      {/* Recommendations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Buy Recommendations Section */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
              Buy Recommendations
            </h2>
            <button
              onClick={refreshAndUpdateOveramt}
              className="px-4 py-2 bg-green-800 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors duration-200 flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Refresh Data
            </button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="bg-blue-800 py-3 px-6">
              <h3 className="text-lg font-semibold text-white">Model Recommendations</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Symbol</th>
                    <th className="px-6 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sector</th>
                    <th className="px-6 py-1 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Overamt</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {recommendations.map((rec) => (
                    <tr key={rec.symbol}>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{rec.symbol}</td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{rec.sectorshort}</td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-300 text-right">${rec.overamt.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        {/* Sell Recommendations Section */}
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-6">
            Sell Recommendations
          </h2>
          {/* Wrap filter controls and results together */}
          <div>
            {/* Filter Controls */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                {/* Lot Basis */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Lot Basis
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => updateLotBasis(false)}
                      className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      aria-label="Decrease Lot Basis"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 12H8" /></svg>
                    </button>
                    <input
                      type="number"
                      value={filters.lotBasis}
                      onChange={(e) => setFilters(prev => ({
                        ...prev,
                        lotBasis: Number(e.target.value)
                      }))}
                      className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base shadow-sm"
                    />
                    <button
                      onClick={() => updateLotBasis(true)}
                      className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      aria-label="Increase Lot Basis"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-4-4h8" /></svg>
                    </button>
                  </div>
                </div>
                {/* Return PCT */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Return PCT
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => updateReturnPct(false)}
                      className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      aria-label="Decrease Return PCT"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 12H8" /></svg>
                    </button>
                    <input
                      type="number"
                      value={filters.returnPct}
                      onChange={(e) => setFilters(prev => ({
                        ...prev,
                        returnPct: Number(e.target.value)
                      }))}
                      className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base shadow-sm"
                      step="0.5"
                    />
                    <button
                      onClick={() => updateReturnPct(true)}
                      className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      aria-label="Increase Return PCT"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8m-4-4h8" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* Results */}
            <div className="space-y-4">
              {Object.entries(groupedLots).map(([symbol, data]) => (
                <details key={symbol} className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden group marker:content-none">
                  <summary className="px-6 py-4 cursor-pointer focus:outline-none list-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <svg 
                            className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-90 text-gray-500 dark:text-gray-400"
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <h3 className="ml-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{symbol}</h3>
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {data.lots.length} lot{data.lots.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          ${Math.abs(data.targetDiff).toFixed(2)} overweight
                        </span>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <div className="text-sm text-gray-600 dark:text-gray-400">Total Value</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            ${data.totalValue.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600 dark:text-gray-400">Total Profit</div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            ${data.totalProfit.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </summary>

                  <div className="border-t border-gray-200 dark:border-gray-700">
                    <table className="table-fixed w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider break-words">Account</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider break-words">Date</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider break-words">Units</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider break-words">Current Price</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider break-words">Current Value</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider break-words">Profit</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider break-words">Profit %</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {data.lots.map((lot, index) => (
                          <tr key={`${lot.symbol}-${lot.date}-${index}`}>
                            <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-300 break-words">{lot.account}</td>
                            <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-300 break-words">
                              {lot.is_long_term ? '✔ ' : ''}{new Date(lot.date).toLocaleDateString()}
                            </td>
                            <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-300 break-words">{lot.units}</td>
                            <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-300 break-words">${lot.current_price.toFixed(2)}</td>
                            <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-300 break-words">${lot.current_value.toFixed(2)}</td>
                            <td className="px-2 py-2 text-sm text-gray-900 dark:text-gray-300 break-words">${lot.profit.toFixed(2)}</td>
                            <td 
                              className="px-2 py-2 text-sm break-words"
                              style={{ 
                                background: getProfitColor(lot.profit_pct),
                                color: lot.profit_pct > 31.4 ? 'white' : 'black'
                              }}
                            >
                              {lot.profit_pct.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioBalance; 

import React, { useState, useEffect } from 'react';
import axios from 'axios';

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

const PotentialLots: React.FC = () => {
  const [lots, setLots] = useState<PotentialLot[]>([]);
  const [filteredLots, setFilteredLots] = useState<PotentialLot[]>([]);
  const [groupedLots, setGroupedLots] = useState<GroupedLots>({});
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
        const response = await axios.get('/api/potential-lots');
        setLots(response.data);
        setFilteredLots(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch potential lots data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
        Potential Lots for Sale
      </h1>
      
      {/* Filter Controls */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Lot Basis
            </label>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => updateLotBasis(false)}
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded"
              >
                ⬇
              </button>
              <input
                type="number"
                value={filters.lotBasis}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  lotBasis: Number(e.target.value)
                }))}
                className="w-20 px-2 py-1 border rounded dark:bg-gray-700"
              />
              <button
                onClick={() => updateLotBasis(true)}
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded"
              >
                ⬆
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Return PCT
            </label>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => updateReturnPct(false)}
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded"
              >
                -
              </button>
              <input
                type="number"
                value={filters.returnPct}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  returnPct: Number(e.target.value)
                }))}
                className="w-20 px-2 py-1 border rounded dark:bg-gray-700"
                step="0.5"
              />
              <button
                onClick={() => updateReturnPct(true)}
                className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded"
              >
                +
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
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Account</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Profit</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Profit %</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.lots.map((lot, index) => (
                    <tr key={`${lot.symbol}-${lot.date}-${index}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{lot.account}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                        {lot.is_long_term ? '✔ ' : ''}{new Date(lot.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{lot.units}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${lot.current_price.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${lot.current_value.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${lot.profit.toFixed(2)}</td>
                      <td 
                        className="px-6 py-4 whitespace-nowrap text-sm"
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
  );
};

export default PotentialLots; 
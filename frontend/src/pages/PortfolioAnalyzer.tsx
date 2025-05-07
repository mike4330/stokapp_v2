import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend } from 'recharts';
import axios from 'axios';

interface RunDetail {
  id: string;
  timestamp: string;
  name: string;
  description?: string;
  parameters: any;
  results: any;
}

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

const COLORS = [
  '#059669', '#2563eb', '#f59e42', '#e11d48', '#a21caf', '#fbbf24', '#10b981', '#6366f1', '#f43f5e', '#f472b6', '#0ea5e9', '#facc15', '#84cc16', '#eab308', '#14b8a6', '#f87171', '#a3e635', '#fcd34d', '#f472b6', '#818cf8'
];

const PortfolioAnalyzer: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('absPercentDiff');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!runId) return;

    const fetchRunDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/repository/runs/${runId}`);
        const data = await res.json();
        if (data.run) {
          setRunDetail(data.run);
        } else {
          setError('Run not found');
        }
      } catch (err) {
        setError('Failed to load run details');
      } finally {
        setLoading(false);
      }
    };

    fetchRunDetail();
  }, [runId]);

  // Fetch current holdings
  useEffect(() => {
    const fetchHoldings = async () => {
      setHoldingsLoading(true);
      try {
        const response = await axios.get('/api/holdings');
        setHoldings(response.data);
      } catch (err) {
        setHoldingsError('Failed to fetch current holdings');
        console.error('Error fetching holdings:', err);
      } finally {
        setHoldingsLoading(false);
      }
    };

    fetchHoldings();
  }, []);

  // Calculate current portfolio allocation percentages
  const calculateCurrentAllocation = () => {
    if (!holdings.length) return {};

    const totalValue = holdings.reduce((sum, holding) => sum + holding.position_value, 0);
    const allocation: Record<string, number> = {};
    
    holdings.forEach(holding => {
      allocation[holding.symbol] = holding.position_value / totalValue;
    });
    
    return allocation;
  };

  // Render sector weights as bar chart
  const renderSectorBar = (sectorWeights: Record<string, number>) => {
    const data = Object.entries(sectorWeights)
      .sort(([, a], [, b]) => b - a) // Sort by weight in descending order
      .map(([k, v]) => ({ sector: k, weight: +(v * 100).toFixed(4) }));
    
    return (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="sector" angle={-45} textAnchor="end" height={60} interval={0} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number) => `${v.toFixed(4)}%`} />
          <Bar dataKey="weight" fill="#059669" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Render asset weights as bar chart
  const renderWeightsBar = (weights: Record<string, number>) => {
    const data = Object.entries(weights)
      .sort(([, a], [, b]) => b - a) // Sort by weight in descending order
      .map(([k, v]) => ({ asset: k, weight: +(v * 100).toFixed(4) }));
    
    return (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="asset" angle={-45} textAnchor="end" height={60} interval={0} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number) => `${v.toFixed(4)}%`} />
          <Bar dataKey="weight" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Render comparison between current holdings and proposed model weights
  const renderWeightComparison = (modelWeights: Record<string, number>) => {
    if (!modelWeights || !holdings.length) return null;
    
    const totalPortfolioValue = holdings.reduce((sum, holding) => sum + holding.position_value, 0);
    const currentAllocation = calculateCurrentAllocation();
    const allSymbols = new Set([
      ...Object.keys(modelWeights),
      ...Object.keys(currentAllocation)
    ]);
    
    interface ComparisonItem {
      symbol: string;
      current: number;
      model: number;
      percentDiff: number;
      dollarDiff: number;
      absPercentDiff: number;
      absDollarDiff: number;
      currentValue: number;
      modelValue: number;
      [key: string]: string | number; // Index signature for dynamic access
    }
    
    const data: ComparisonItem[] = Array.from(allSymbols).map(symbol => {
      const currentWeight = currentAllocation[symbol] || 0;
      const modelWeight = modelWeights[symbol] || 0;
      const percentDifference = modelWeight - currentWeight;
      const dollarDifference = percentDifference * totalPortfolioValue;
      
      // Find the holding to get current units and price
      const holding = holdings.find(h => h.symbol === symbol);
      
      return {
        symbol,
        current: +(currentWeight * 100).toFixed(4),
        model: +(modelWeight * 100).toFixed(4),
        percentDiff: +(percentDifference * 100).toFixed(4),
        dollarDiff: dollarDifference,
        absPercentDiff: Math.abs(percentDifference * 100),
        absDollarDiff: Math.abs(dollarDifference),
        currentValue: holding ? holding.position_value : 0,
        modelValue: modelWeight * totalPortfolioValue
      };
    });
    
    // Apply sorting
    const sortedData = [...data].sort((a, b) => {
      if (sortColumn === 'symbol') {
        return sortDirection === 'asc' 
          ? a.symbol.localeCompare(b.symbol) 
          : b.symbol.localeCompare(a.symbol);
      }
      
      // For numeric columns
      const aValue = a[sortColumn] as number;
      const bValue = b[sortColumn] as number;
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });
    
    const handleSort = (column: string) => {
      if (sortColumn === column) {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSortColumn(column);
        // Default to desc for difference columns and asc for other columns
        if (column.includes('Diff') || column === 'model' || column === 'current') {
          setSortDirection('desc');
        } else {
          setSortDirection('asc');
        }
      }
    };
    
    const SortIcon = ({ column }: { column: string }) => {
      if (sortColumn !== column) return <span className="text-gray-400 ml-1">↕</span>;
      return sortDirection === 'asc' 
        ? <span className="text-blue-500 ml-1">↑</span> 
        : <span className="text-blue-500 ml-1">↓</span>;
    };
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th 
                className="px-3 py-2 text-left text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => handleSort('symbol')}
              >
                Symbol <SortIcon column="symbol" />
              </th>
              <th 
                className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => handleSort('current')}
              >
                Current (%) <SortIcon column="current" />
              </th>
              <th 
                className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => handleSort('model')}
              >
                Model (%) <SortIcon column="model" />
              </th>
              <th 
                className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => handleSort('absPercentDiff')}
              >
                % Difference <SortIcon column="absPercentDiff" />
              </th>
              <th 
                className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => handleSort('absDollarDiff')}
              >
                $ Difference <SortIcon column="absDollarDiff" />
              </th>
              <th className="px-3 py-2 text-left text-gray-900 dark:text-gray-100">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item, idx) => (
              <tr key={item.symbol} className={idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/50"}>
                <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{item.symbol}</td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{item.current.toFixed(4)}</td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{item.model.toFixed(4)}</td>
                <td className={`px-3 py-2 text-right font-medium ${
                  item.percentDiff > 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : item.percentDiff < 0 
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-300'
                }`}>
                  {item.percentDiff > 0 ? '+' : ''}{item.percentDiff.toFixed(4)}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${
                  item.dollarDiff > 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : item.dollarDiff < 0 
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-300'
                }`}>
                  {item.dollarDiff > 0 ? '+' : ''}${Math.abs(item.dollarDiff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {item.percentDiff > 0.1 && (
                    <span className="text-green-600 dark:text-green-400">Buy</span>
                  )}
                  {item.percentDiff < -0.1 && (
                    <span className="text-red-600 dark:text-red-400">Sell</span>
                  )}
                  {Math.abs(item.percentDiff) <= 0.1 && (
                    <span className="text-gray-500 dark:text-gray-400">Hold</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render a comparison chart that shows both current and model allocations side by side
  const renderComparisonChart = (modelWeights: Record<string, number>) => {
    if (!modelWeights || !holdings.length) return null;
    
    const currentAllocation = calculateCurrentAllocation();
    const allSymbols = new Set([
      ...Object.keys(modelWeights),
      ...Object.keys(currentAllocation)
    ]);
    
    // Get only the top 10 assets by combined weight
    const topAssets = Array.from(allSymbols)
      .map(symbol => ({
        symbol,
        totalWeight: (currentAllocation[symbol] || 0) + (modelWeights[symbol] || 0)
      }))
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 10)
      .map(item => item.symbol);
    
    const data = topAssets.map(symbol => ({
      asset: symbol,
      current: +((currentAllocation[symbol] || 0) * 100).toFixed(4),
      model: +((modelWeights[symbol] || 0) * 100).toFixed(4)
    }));
    
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart 
          data={data} 
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          layout="vertical"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} horizontal={false} />
          <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
          <YAxis 
            dataKey="asset" 
            type="category" 
            width={80}
            tick={{ fontSize: 12 }} 
          />
          <Tooltip formatter={(v: number) => `${v.toFixed(4)}%`} />
          <Legend verticalAlign="top" height={36} />
          <Bar dataKey="current" name="Current" fill="#2563eb" radius={[0, 4, 4, 0]} />
          <Bar dataKey="model" name="Model" fill="#059669" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="bg-green-800 py-3 px-6 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Portfolio Analyzer</h2>
          <Link 
            to="/modelling/results-explorer" 
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded flex items-center transition-colors shadow"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Results
          </Link>
        </div>
        <div className="p-6">
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded my-4">
              {error}
            </div>
          )}

          {!loading && !error && runDetail && (
            <div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg shadow p-6 mb-6">
                <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Portfolio Analysis for Run: {runDetail.id}</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h4 className="font-semibold mb-2 text-primary-600 dark:text-primary-400">Run Information</h4>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Run ID:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">{runDetail.id.substring(0, 16)}</span>
                    </div>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Date:</span>
                      <span className="text-gray-700 dark:text-gray-300">{runDetail.timestamp}</span>
                    </div>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Objective:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">{runDetail.parameters?.objective || 
                       runDetail.results?.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0] || 
                       'Unknown'}</span>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h4 className="font-semibold mb-2 text-primary-600 dark:text-primary-400">Performance Metrics</h4>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Expected Return:</span>
                      <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
                        {runDetail.results?.expected_return ? 
                          (runDetail.results.expected_return * 100).toFixed(2) + '%' : 
                          'N/A'}
                      </span>
                    </div>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Volatility:</span>
                      <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
                        {runDetail.results?.volatility ? 
                          (runDetail.results.volatility * 100).toFixed(2) + '%' : 
                          'N/A'}
                      </span>
                    </div>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Sharpe Ratio:</span>
                      <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
                        {runDetail.results?.sharpe_ratio ? 
                          runDetail.results.sharpe_ratio.toFixed(3) : 
                          'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h4 className="font-semibold mb-2 text-primary-600 dark:text-primary-400">Parameters</h4>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Gamma:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">
                        {runDetail.parameters?.gamma !== undefined && runDetail.parameters?.gamma !== null 
                          ? runDetail.parameters.gamma 
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Target Return:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">
                        {runDetail.parameters?.target_return !== undefined 
                          ? runDetail.parameters.target_return 
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="mb-2 flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Target Risk:</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">
                        {runDetail.parameters?.target_risk !== undefined 
                          ? runDetail.parameters.target_risk 
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h4 className="font-semibold mb-4 text-primary-600 dark:text-primary-400">Sector Allocation</h4>
                    {renderSectorBar(runDetail.results?.sector_weights || {})}
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h4 className="font-semibold mb-4 text-primary-600 dark:text-primary-400">Asset Allocation</h4>
                    {renderWeightsBar(runDetail.results?.weights || {})}
                  </div>
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                <h4 className="font-semibold mb-4 text-primary-600 dark:text-primary-400">Current vs. Model Portfolio Allocation</h4>
                
                {holdingsLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-700"></div>
                  </div>
                ) : holdingsError ? (
                  <div className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded my-4">
                    {holdingsError}
                  </div>
                ) : holdings.length === 0 ? (
                  <div className="bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 p-4 rounded my-4">
                    No current holdings found to compare with the model.
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      {renderComparisonChart(runDetail.results?.weights || {})}
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                      <h5 className="font-medium mb-3 text-gray-900 dark:text-gray-100">Required Portfolio Changes</h5>
                      {renderWeightComparison(runDetail.results?.weights || {})}
                    </div>
                  </>
                )}
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h4 className="font-semibold mb-4 text-primary-600 dark:text-primary-400">Asset Weights</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-900 dark:text-gray-100">Ticker</th>
                        <th className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">Weight (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(runDetail.results?.weights || {})
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([ticker, weight], idx) => (
                          <tr key={ticker} className={idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/50"}>
                            <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300">{ticker}</td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{((weight as number) * 100).toFixed(4)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioAnalyzer; 
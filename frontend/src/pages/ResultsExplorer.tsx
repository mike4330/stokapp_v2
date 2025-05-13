/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface RunMeta {
  id: string;
  name: string;
  timestamp: string;
  description?: string;
}

interface RunDetail {
  id: string;
  timestamp: string;
  name: string;
  description?: string;
  parameters: any;
  results: any;
}

const COLORS = [
  '#059669', '#2563eb', '#f59e42', '#e11d48', '#a21caf', '#fbbf24', '#10b981', '#6366f1', '#f43f5e', '#f472b6', '#0ea5e9', '#facc15', '#84cc16', '#eab308', '#14b8a6', '#f87171', '#a3e635', '#fcd34d', '#f472b6', '#818cf8'
];

const OBJECTIVE_LABELS: Record<string, string> = {
  max_sharpe: 'Maximize Sharpe Ratio',
  min_volatility: 'Minimize Volatility',
  efficient_risk: 'Efficient Risk',
  efficient_return: 'Efficient Return',
};

const OBJECTIVE_KEYS = Object.keys(OBJECTIVE_LABELS);

const ResultsExplorer: React.FC = () => {
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [runDetails, setRunDetails] = useState<RunDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareRuns, setCompareRuns] = useState<RunDetail[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [objectiveFilters, setObjectiveFilters] = useState<Record<string, boolean>>({
    max_sharpe: true,
    min_volatility: true,
    efficient_risk: true,
    efficient_return: true,
  });

  // Fetch all runs on mount
  useEffect(() => {
    setLoading(true);
    fetch('/api/repository/runs')
      .then(res => res.json())
      .then(async data => {
        setRuns(data.runs || []);
        // Fetch details for each run
        const details: RunDetail[] = await Promise.all(
          (data.runs || []).map(async (run: RunMeta) => {
            try {
              const res = await fetch(`/api/repository/runs/${run.id}`);
              const d = await res.json();
              return d.run;
            } catch {
              return null;
            }
          })
        );
        setRunDetails(details.filter(Boolean));
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load results');
        setLoading(false);
      });
  }, []);

  // Fetch details for multiple runs for comparison
  const fetchCompareRuns = async (ids: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        ids.map(async id => {
          const res = await fetch(`/api/repository/runs/${id}`);
          const data = await res.json();
          return data.run;
        })
      );
      setCompareRuns(results);
      setCompareMode(true);
    } catch {
      setError('Failed to load comparison runs');
    } finally {
      setLoading(false);
    }
  };

  // Handle selection for comparison
  const handleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Render weights as bar chart
  const renderWeightsBar = (weights: Record<string, number>) => {
    // Sort data by weight in descending order
    const data = Object.entries(weights)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => ({ asset: k, weight: +(v * 100).toFixed(4) }));
    
    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 120 }}>
          <XAxis 
            dataKey="asset" 
            angle={-90} 
            textAnchor="end" 
            height={120} 
            interval={0} 
            tick={{ fontSize: 11 }}
          />
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

  // Render sector weights as bar chart
  const renderSectorBar = (sectorWeights: Record<string, number>) => {
    const data = Object.entries(sectorWeights)
      .sort(([, a], [, b]) => b - a) // Sort by weight in descending order
      .map(([k, v]) => ({ sector: k, weight: +(v * 100).toFixed(4) }));
    
    return (
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <XAxis dataKey="sector" angle={-45} textAnchor="end" height={60} interval={0} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number) => `${v.toFixed(4)}%`} />
          <Bar dataKey="weight" fill="#059669" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Helper to extract objective key from run
  const getObjectiveKey = (run: RunDetail): string => {
    const p = run.parameters || {};
    const r = run.results || {};
    const debug = r.debug_info?.optimization || {};
    let objective = p.objective || debug.message?.split('using ')[1]?.split(' method')[0] || '';
    if (!objective && debug.message) objective = debug.message;
    // Normalize to known keys if possible
    if (OBJECTIVE_KEYS.includes(objective)) return objective;
    // Try to map common variants
    if (typeof objective === 'string') {
      if (objective.toLowerCase().includes('sharpe')) return 'max_sharpe';
      if (objective.toLowerCase().includes('volatility')) return 'min_volatility';
      if (objective.toLowerCase().includes('efficient risk')) return 'efficient_risk';
      if (objective.toLowerCase().includes('efficient return')) return 'efficient_return';
    }
    return objective;
  };

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      // Default sort direction for different column types
      if (['expected_return', 'volatility', 'sharpe_ratio'].includes(column)) {
        setSortDirection('desc');
      } else if (column === 'id' || column === 'objective') {
        setSortDirection('asc');
      } else {
        setSortDirection('desc'); // Default for timestamp and other columns
      }
    }
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <span className="text-gray-400 ml-1">↕</span>;
    return sortDirection === 'asc' 
      ? <span className="text-blue-500 ml-1">↑</span> 
      : <span className="text-blue-500 ml-1">↓</span>;
  };

  // Sort the run details based on current sort column and direction
  const getSortedRunDetails = () => {
    const filtered = runDetails.filter(run => objectiveFilters[getObjectiveKey(run)] !== false);
    
    return [...filtered].sort((a, b) => {
      const getValueForSorting = (run: RunDetail, column: string) => {
        const p = run.parameters || {};
        const r = run.results || {};
        
        switch (column) {
          case 'id':
            return run.id;
          case 'timestamp':
            return run.timestamp;
          case 'objective':
            const objective = p.objective || 
              r.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0] || '';
            return objective;
          case 'gamma':
            return p.gamma !== undefined && p.gamma !== null ? p.gamma : -Infinity;
          case 'target_return':
            return p.target_return !== undefined ? p.target_return : -Infinity;
          case 'target_risk':
            return p.target_risk !== undefined ? p.target_risk : -Infinity;
          case 'lower_bound':
            return p.lower_bound !== undefined ? p.lower_bound : -Infinity;
          case 'upper_bound':
            return p.upper_bound !== undefined ? p.upper_bound : -Infinity;
          case 'expected_return':
            return r.expected_return !== undefined ? r.expected_return : -Infinity;
          case 'volatility':
            return r.volatility !== undefined ? r.volatility : -Infinity;
          case 'sharpe_ratio':
            return r.sharpe_ratio !== undefined ? r.sharpe_ratio : -Infinity;
          default:
            return '';
        }
      };

      const aValue = getValueForSorting(a, sortColumn);
      const bValue = getValueForSorting(b, sortColumn);

      // For string comparisons
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue) 
          : bValue.localeCompare(aValue);
      }
      
      // For numeric comparisons
      return sortDirection === 'asc' 
        ? (aValue as number) - (bValue as number) 
        : (bValue as number) - (aValue as number);
    });
  };

  return (
    <div className="py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">MPT Results Explorer</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="bg-green-800 py-3 px-6 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Saved MPT Modeling Results</h2>
          {compareMode && (
            <button className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded flex items-center transition-colors shadow" onClick={() => { setCompareMode(false); setCompareRuns([]); setSelectedIds([]); }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to List
            </button>
          )}
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

          {/* Comparison View */}
          {compareMode && compareRuns.length > 1 && (
            <div>
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Comparison</h3>
              <div className="overflow-x-auto mb-6 bg-gray-50 dark:bg-gray-900 rounded-lg shadow">
                <table className="min-w-full">
                  <thead className="bg-gray-100 dark:bg-gray-800">
                    <tr>
                      <th 
                        className="px-4 py-2 text-left text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('id')}
                      >
                        Run <SortIcon column="id" />
                      </th>
                      <th 
                        className="px-4 py-2 text-left text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('timestamp')}
                      >
                        Date <SortIcon column="timestamp" />
                      </th>
                      <th 
                        className="px-4 py-2 text-left text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('objective')}
                      >
                        Objective <SortIcon column="objective" />
                      </th>
                      <th 
                        className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('expected_return')}
                      >
                        Exp. Return <SortIcon column="expected_return" />
                      </th>
                      <th 
                        className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('volatility')}
                      >
                        Volatility <SortIcon column="volatility" />
                      </th>
                      <th 
                        className="px-4 py-2 text-right text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('sharpe_ratio')}
                      >
                        Sharpe <SortIcon column="sharpe_ratio" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...compareRuns].sort((a, b) => {
                      const getValueForSorting = (run: RunDetail, column: string) => {
                        const p = run.parameters || {};
                        const r = run.results || {};
                        
                        switch (column) {
                          case 'id':
                            return run.id;
                          case 'timestamp':
                            return run.timestamp;
                          case 'objective':
                            const objective = p.objective || 
                              r.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0] || '';
                            return objective;
                          case 'expected_return':
                            return r.expected_return !== undefined ? r.expected_return : -Infinity;
                          case 'volatility':
                            return r.volatility !== undefined ? r.volatility : -Infinity;
                          case 'sharpe_ratio':
                            return r.sharpe_ratio !== undefined ? r.sharpe_ratio : -Infinity;
                          default:
                            return '';
                        }
                      };

                      const aValue = getValueForSorting(a, sortColumn);
                      const bValue = getValueForSorting(b, sortColumn);

                      // For string comparisons
                      if (typeof aValue === 'string' && typeof bValue === 'string') {
                        return sortDirection === 'asc' 
                          ? aValue.localeCompare(bValue) 
                          : bValue.localeCompare(aValue);
                      }
                      
                      // For numeric comparisons
                      return sortDirection === 'asc' 
                        ? (aValue as number) - (bValue as number) 
                        : (bValue as number) - (aValue as number);
                    }).map((run, idx) => (
                      <tr key={run.id} className={idx % 2 === 0 ? "bg-white dark:bg-gray-800/50" : "bg-gray-50 dark:bg-gray-700/50"}>
                        <td className="px-4 py-2 font-mono text-gray-700 dark:text-gray-300">{run.id}</td>
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{run.timestamp}</td>
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{run.parameters?.objective || run.results?.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0]}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{(run.results?.expected_return * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{(run.results?.volatility * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{run.results?.sharpe_ratio?.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {compareRuns.map((run, idx) => (
                  <div key={run.id} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg shadow">
                    <h4 className="font-semibold mb-2 text-lg text-gray-900 dark:text-gray-100">{run.name || `Run ${idx + 1}`} ({run.id})</h4>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="mb-2 flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Exp. Return:</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{(run.results?.expected_return * 100).toFixed(2)}%</span>
                        </div>
                        <div className="mb-2 flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Volatility:</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{(run.results?.volatility * 100).toFixed(2)}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Sharpe Ratio:</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{run.results?.sharpe_ratio?.toFixed(3)}</span>
                        </div>
                        <div className="mb-2 flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Objective:</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{run.parameters?.objective || run.results?.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0]}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mb-4">{renderSectorBar(run.results?.sector_weights || {})}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* List View */}
          {!compareMode && (
            <div>
              {/* Objective Filter Toggles */}
              <div className="mb-4 flex flex-wrap gap-4 items-center bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <span className="font-medium text-gray-700 dark:text-gray-200 mr-2">Filter by Objective:</span>
                {OBJECTIVE_KEYS.map(key => (
                  <label key={key} className="flex items-center space-x-1 text-sm">
                    <input
                      type="checkbox"
                      checked={objectiveFilters[key]}
                      onChange={() => setObjectiveFilters(f => ({ ...f, [key]: !f[key] }))}
                      className="form-checkbox h-4 w-4 text-green-600"
                    />
                    <span className="text-gray-700 dark:text-gray-300">{OBJECTIVE_LABELS[key]}</span>
                  </label>
                ))}
              </div>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 px-3 py-1 rounded-lg">
                  {runs.length} runs saved
                </div>
                <button
                  className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded shadow text-sm disabled:opacity-50 flex items-center"
                  disabled={selectedIds.length < 2}
                  onClick={() => fetchCompareRuns(selectedIds)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Compare Selected ({selectedIds.length})
                </button>
              </div>
              <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-lg shadow">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-left">Actions</th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-left cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('id')}
                      >
                        Run ID <SortIcon column="id" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-left cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('timestamp')}
                      >
                        Timestamp <SortIcon column="timestamp" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-left cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('objective')}
                      >
                        Objective <SortIcon column="objective" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('gamma')}
                      >
                        Gamma <SortIcon column="gamma" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('target_return')}
                      >
                        Target Return <SortIcon column="target_return" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('target_risk')}
                      >
                        Target Risk <SortIcon column="target_risk" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('lower_bound')}
                      >
                        Lower Bound <SortIcon column="lower_bound" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('upper_bound')}
                      >
                        Upper Bound <SortIcon column="upper_bound" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('expected_return')}
                      >
                        Expected Return <SortIcon column="expected_return" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('volatility')}
                      >
                        Volatility <SortIcon column="volatility" />
                      </th>
                      <th 
                        className="px-2 py-2 font-semibold text-gray-900 dark:text-gray-100 text-right cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700"
                        onClick={() => handleSort('sharpe_ratio')}
                      >
                        Sharpe Ratio <SortIcon column="sharpe_ratio" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedRunDetails().map((run, idx) => {
                      const p = run.parameters || {};
                      const r = run.results || {};
                      const debug = r.debug_info?.optimization || {};
                      let objective = p.objective || debug.message?.split('using ')[1]?.split(' method')[0] || '';
                      if (!objective && debug.message) objective = debug.message;
                      return (
                        <tr key={run.id} className={idx % 2 === 0 ? "bg-white dark:bg-gray-800/50" : "bg-gray-50 dark:bg-gray-700/50"}>
                          <td className="px-2 py-2">
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(run.id)}
                                onChange={() => handleSelect(run.id)}
                                className="form-checkbox h-4 w-4 text-green-600"
                              />
                              <Link 
                                to={`/analyze/${run.id}`}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded flex items-center transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Analyze
                              </Link>
                            </div>
                          </td>
                          <td className="px-2 py-2 font-mono text-gray-700 dark:text-gray-300">{run.id}</td>
                          <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{run.timestamp}</td>
                          <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{objective}</td>
                          <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">{p.gamma !== undefined && p.gamma !== null ? p.gamma : '-'}</td>
                          <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">{p.target_return !== undefined ? p.target_return : '-'}</td>
                          <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">{p.target_risk !== undefined ? p.target_risk : '-'}</td>
                          <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">{p.lower_bound !== undefined ? p.lower_bound : '-'}</td>
                          <td className="px-2 py-2 text-right text-gray-700 dark:text-gray-300">{p.upper_bound !== undefined ? p.upper_bound : '-'}</td>
                          <td className="px-2 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{r.expected_return !== undefined ? (r.expected_return * 100).toFixed(2) + '%' : '-'}</td>
                          <td className="px-2 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{r.volatility !== undefined ? (r.volatility * 100).toFixed(2) + '%' : '-'}</td>
                          <td className="px-2 py-2 text-right font-medium text-gray-700 dark:text-gray-300">{r.sharpe_ratio !== undefined ? r.sharpe_ratio.toFixed(3) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsExplorer; 
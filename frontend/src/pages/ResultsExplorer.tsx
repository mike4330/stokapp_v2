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
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareRuns, setCompareRuns] = useState<RunDetail[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Fetch details for a single run
  const fetchRunDetail = async (runId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repository/runs/${runId}`);
      const data = await res.json();
      setSelectedRun(data.run);
    } catch {
      setError('Failed to load run details');
    } finally {
      setLoading(false);
    }
  };

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

  // Render weights as pie chart
  const renderWeightsPie = (weights: Record<string, number>) => {
    const data = Object.entries(weights).map(([k, v]) => ({ name: k, value: +(v * 100).toFixed(4) }));
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => `${v.toFixed(4)}%`} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  // Render sector weights as bar chart
  const renderSectorBar = (sectorWeights: Record<string, number>) => {
    const data = Object.entries(sectorWeights).map(([k, v]) => ({ sector: k, weight: +(v * 100).toFixed(4) }));
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">MPT Results Explorer</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="bg-green-800 py-3 px-6 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Saved MPT Modeling Results</h2>
          {compareMode && (
            <button className="text-white underline" onClick={() => { setCompareMode(false); setCompareRuns([]); setSelectedIds([]); }}>Back to List</button>
          )}
        </div>
        <div className="p-6">
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}

          {/* Comparison View */}
          {compareMode && compareRuns.length > 1 && (
            <div>
              <h3 className="text-lg font-bold mb-4">Comparison</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full mb-6">
                  <thead>
                    <tr>
                      <th className="px-4 py-2">Run</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Objective</th>
                      <th className="px-4 py-2">Exp. Return</th>
                      <th className="px-4 py-2">Volatility</th>
                      <th className="px-4 py-2">Sharpe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRuns.map(run => (
                      <tr key={run.id} className="bg-gray-50 dark:bg-gray-700">
                        <td className="px-4 py-2 font-mono">{run.id}</td>
                        <td className="px-4 py-2">{run.timestamp}</td>
                        <td className="px-4 py-2">{run.parameters?.objective || run.results?.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0]}</td>
                        <td className="px-4 py-2">{(run.results?.expected_return * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2">{(run.results?.volatility * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2">{run.results?.sharpe_ratio?.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {compareRuns.map((run, idx) => (
                  <div key={run.id} className="bg-gray-100 dark:bg-gray-900 p-4 rounded shadow">
                    <h4 className="font-semibold mb-2">{run.name} ({run.id})</h4>
                    <div className="mb-2">Exp. Return: <span className="font-mono">{(run.results?.expected_return * 100).toFixed(2)}%</span></div>
                    <div className="mb-2">Volatility: <span className="font-mono">{(run.results?.volatility * 100).toFixed(2)}%</span></div>
                    <div className="mb-2">Sharpe Ratio: <span className="font-mono">{run.results?.sharpe_ratio?.toFixed(3)}</span></div>
                    <div className="mb-2">Objective: <span className="font-mono">{run.parameters?.objective || run.results?.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0]}</span></div>
                    <div className="mb-4">{renderSectorBar(run.results?.sector_weights || {})}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detail View */}
          {selectedRun && !compareMode && (
            <div>
              <button className="mb-4 text-green-700 dark:text-green-400 underline" onClick={() => setSelectedRun(null)}>&larr; Back to List</button>
              <h3 className="text-lg font-bold mb-2">Run Details</h3>
              <div className="mb-2">Run ID: <span className="font-mono">{selectedRun.id}</span></div>
              <div className="mb-2">Date: {selectedRun.timestamp}</div>
              <div className="mb-2">Objective: <span className="font-mono">{selectedRun.parameters?.objective || selectedRun.results?.debug_info?.optimization?.message?.split('using ')[1]?.split(' method')[0]}</span></div>
              <div className="mb-2">Exp. Return: <span className="font-mono">{(selectedRun.results?.expected_return * 100).toFixed(2)}%</span></div>
              <div className="mb-2">Volatility: <span className="font-mono">{(selectedRun.results?.volatility * 100).toFixed(2)}%</span></div>
              <div className="mb-2">Sharpe Ratio: <span className="font-mono">{selectedRun.results?.sharpe_ratio?.toFixed(3)}</span></div>
              <div className="mb-4">{renderSectorBar(selectedRun.results?.sector_weights || {})}</div>
              <div className="mb-4">{renderWeightsPie(selectedRun.results?.weights || {})}</div>
              <div className="mb-4">
                <h4 className="font-semibold mb-2">Asset Weights</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="px-2 py-1">Ticker</th>
                        <th className="px-2 py-1">Weight (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedRun.results?.weights || {})
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([ticker, weight]) => (
                          <tr key={ticker}>
                            <td className="px-2 py-1 font-mono">{ticker}</td>
                            <td className="px-2 py-1">{((weight as number) * 100).toFixed(4)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold mb-2">Parameters</h4>
                <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(selectedRun.parameters, null, 2)}
                </pre>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold mb-2">Debug Info</h4>
                <pre className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs overflow-x-auto">
                  {JSON.stringify(selectedRun.results?.debug_info, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* List View */}
          {!selectedRun && !compareMode && (
            <div>
              {/* Objective Filter Toggles */}
              <div className="mb-4 flex flex-wrap gap-4 items-center">
                <span className="font-medium text-gray-700 dark:text-gray-200 mr-2">Filter by Objective:</span>
                {OBJECTIVE_KEYS.map(key => (
                  <label key={key} className="flex items-center space-x-1 text-sm">
                    <input
                      type="checkbox"
                      checked={objectiveFilters[key]}
                      onChange={() => setObjectiveFilters(f => ({ ...f, [key]: !f[key] }))}
                      className="form-checkbox h-4 w-4 text-green-600"
                    />
                    <span>{OBJECTIVE_LABELS[key]}</span>
                  </label>
                ))}
              </div>
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-600 dark:text-gray-300">{runs.length} runs saved</div>
                <button
                  className="px-3 py-1 bg-green-700 text-white rounded shadow text-sm disabled:opacity-50"
                  disabled={selectedIds.length < 2}
                  onClick={() => fetchCompareRuns(selectedIds)}
                >
                  Compare Selected ({selectedIds.length})
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Run ID</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Timestamp</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Objective</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Gamma</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Target Return</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Target Risk</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Lower Bound</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Upper Bound</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Expected Return</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Volatility</th>
                      <th className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">Sharpe Ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runDetails.filter(run => objectiveFilters[getObjectiveKey(run)] !== false).map(run => {
                      const p = run.parameters || {};
                      const r = run.results || {};
                      const debug = r.debug_info?.optimization || {};
                      let objective = p.objective || debug.message?.split('using ')[1]?.split(' method')[0] || '';
                      if (!objective && debug.message) objective = debug.message;
                      return (
                        <tr key={run.id} className="bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          <td className="px-2 py-1 font-mono">{run.id}</td>
                          <td className="px-2 py-1">{run.timestamp}</td>
                          <td className="px-2 py-1">{objective}</td>
                          <td className="px-2 py-1">{p.gamma !== undefined && p.gamma !== null ? p.gamma : '-'}</td>
                          <td className="px-2 py-1">{p.target_return !== undefined ? p.target_return : '-'}</td>
                          <td className="px-2 py-1">{p.target_risk !== undefined ? p.target_risk : '-'}</td>
                          <td className="px-2 py-1">{p.lower_bound !== undefined ? p.lower_bound : '-'}</td>
                          <td className="px-2 py-1">{p.upper_bound !== undefined ? p.upper_bound : '-'}</td>
                          <td className="px-2 py-1">{r.expected_return !== undefined ? (r.expected_return * 100).toFixed(2) + '%' : '-'}</td>
                          <td className="px-2 py-1">{r.volatility !== undefined ? (r.volatility * 100).toFixed(2) + '%' : '-'}</td>
                          <td className="px-2 py-1">{r.sharpe_ratio !== undefined ? r.sharpe_ratio.toFixed(3) : '-'}</td>
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
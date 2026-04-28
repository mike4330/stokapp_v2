/*
 * Copyright (C) 2025-2026 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MPT model parameters editor.
 *
 * Replaces the legacy "what-if" optimizer UI (872 lines, in-process job runner)
 * with a dense form bound to the three config tables seeded by migration 001:
 *   mpt_model_params       — single-row optimizer scalars
 *   mpt_sector_constraints — per-sector lower/upper bounds
 *   mpt_universe           — symbol universe + sector classification
 *
 * Read-only at this stage; save is wired in a follow-up.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Helmet } from 'react-helmet-async';

interface ModelParams {
  gamma: number;
  target_risk: number;
  weight_lower: number;
  weight_upper: number;
  gamma_smooth: number;
  updated_at: string;
  updated_by: string | null;
  notes: string | null;
}

interface SectorConstraint {
  sector: string;
  lower: number;
  upper: number;
  updated_at: string;
}

interface UniverseRow {
  symbol: string;
  sector: string;
  in_modeling: boolean;
  notes: string | null;
  updated_at: string;
}

interface ParamsResponse {
  params: ModelParams | null;
  sector_constraints: SectorConstraint[];
  universe: UniverseRow[];
}

const fmtPct = (v: number) => (v * 100).toFixed(2) + '%';
// Bound values are stored to 6dp in the DB; display matches.
const fmt6 = (v: number) => v.toFixed(6);

const MPTModelling: React.FC = () => {
  const [data, setData] = useState<ParamsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [universeFilter, setUniverseFilter] = useState<'modeling' | 'all'>('modeling');

  useEffect(() => {
    axios.get<ParamsResponse>('/api/mpt/params')
      .then(r => { setData(r.data); setLoading(false); })
      .catch(e => { setError(e?.message || 'load failed'); setLoading(false); });
  }, []);

  const visibleUniverse = useMemo(() => {
    if (!data) return [];
    if (universeFilter === 'modeling') return data.universe.filter(r => r.in_modeling);
    return data.universe;
  }, [data, universeFilter]);

  const sectorTotals = useMemo(() => {
    if (!data) return { lower: 0, upper: 0 };
    return data.sector_constraints.reduce(
      (acc, r) => ({ lower: acc.lower + r.lower, upper: acc.upper + r.upper }),
      { lower: 0, upper: 0 }
    );
  }, [data]);

  if (loading) return <div className="p-4 text-sm text-gray-600 dark:text-gray-400">Loading…</div>;
  if (error)   return <div className="p-4 text-sm text-red-600">Error: {error}</div>;
  if (!data || !data.params) return <div className="p-4 text-sm text-red-600">No params row found (migration 001 not applied?)</div>;

  const p = data.params;
  const inputCls = "w-full px-2 py-0.5 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelCls = "block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5";
  const cardCls = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md";
  const hdrCls = "px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 flex items-center justify-between";

  return (
    <div className="p-4 space-y-3 text-gray-900 dark:text-gray-100">
      <Helmet><title>MPT Model · Params</title></Helmet>

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">MPT Model Parameters</h1>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          last updated {p.updated_at} by {p.updated_by || '—'}
        </span>
      </div>

      {/* Optimizer scalars */}
      <div className={cardCls}>
        <div className={hdrCls}>
          <span>Optimizer scalars (mpt_model_params)</span>
          <span className="font-normal normal-case tracking-normal text-gray-500">single row</span>
        </div>
        <div className="p-3 grid grid-cols-5 gap-3">
          <div>
            <label className={labelCls}>γ (L2 reg)</label>
            <input type="number" step="0.0001" defaultValue={p.gamma} className={inputCls} readOnly />
          </div>
          <div>
            <label className={labelCls}>target risk (rgoal)</label>
            <input type="number" step="0.0001" defaultValue={p.target_risk} className={inputCls} readOnly />
          </div>
          <div>
            <label className={labelCls}>weight lower (lb)</label>
            <input type="number" step="0.00001" defaultValue={p.weight_lower} className={inputCls} readOnly />
          </div>
          <div>
            <label className={labelCls}>weight upper (ub)</label>
            <input type="number" step="0.0001" defaultValue={p.weight_upper} className={inputCls} readOnly />
          </div>
          <div>
            <label className={labelCls}>γ smooth (L2_with_smoothing)</label>
            <input type="number" step="0.01" defaultValue={p.gamma_smooth} className={inputCls} readOnly />
          </div>
        </div>
        {p.notes && (
          <div className="px-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400">{p.notes}</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Sector constraints */}
        <div className={cardCls}>
          <div className={hdrCls}>
            <span>Sector constraints ({data.sector_constraints.length} sectors)</span>
            <span className="font-normal normal-case tracking-normal text-gray-500">
              Σ lower {fmtPct(sectorTotals.lower)} · Σ upper {fmtPct(sectorTotals.upper)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Sector</th>
                  <th className="px-2 py-1 text-right font-semibold">Lower</th>
                  <th className="px-2 py-1 text-right font-semibold">Upper</th>
                  <th className="px-2 py-1 text-right font-semibold">Range</th>
                  <th className="px-2 py-1 text-right font-semibold">Mid</th>
                </tr>
              </thead>
              <tbody>
                {data.sector_constraints.map(s => (
                  <tr key={s.sector} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-2 py-1 font-medium">{s.sector}</td>
                    <td className="px-2 py-1 text-right font-mono">
                      <input type="number" step="0.000001" defaultValue={fmt6(s.lower)} readOnly
                        className="w-28 px-1 py-0 text-right font-mono bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"/>
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      <input type="number" step="0.000001" defaultValue={fmt6(s.upper)} readOnly
                        className="w-28 px-1 py-0 text-right font-mono bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"/>
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-gray-500">
                      {fmt6(s.upper - s.lower)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-gray-500">
                      {fmt6((s.upper + s.lower) / 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Universe */}
        <div className={cardCls}>
          <div className={hdrCls}>
            <span>Universe ({data.universe.filter(r => r.in_modeling).length} modeling / {data.universe.length} total)</span>
            <div className="flex items-center gap-1 font-normal normal-case tracking-normal">
              <button
                onClick={() => setUniverseFilter('modeling')}
                className={`px-2 py-0.5 text-[11px] rounded ${universeFilter === 'modeling' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                Modeling
              </button>
              <button
                onClick={() => setUniverseFilter('all')}
                className={`px-2 py-0.5 text-[11px] rounded ${universeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                All
              </button>
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '480px' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Symbol</th>
                  <th className="px-2 py-1 text-left font-semibold">Sector</th>
                  <th className="px-2 py-1 text-center font-semibold">Modeling</th>
                </tr>
              </thead>
              <tbody>
                {visibleUniverse.map(u => (
                  <tr key={u.symbol} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-2 py-0.5 font-mono font-medium">{u.symbol}</td>
                    <td className="px-2 py-0.5 text-gray-600 dark:text-gray-400">{u.sector}</td>
                    <td className="px-2 py-0.5 text-center">
                      <input type="checkbox" defaultChecked={u.in_modeling} disabled className="cursor-not-allowed opacity-70"/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-gray-500 dark:text-gray-400 italic">
        Read-only preview. Edit/save and "Run Now" wiring next.
      </div>
    </div>
  );
};

export default MPTModelling;

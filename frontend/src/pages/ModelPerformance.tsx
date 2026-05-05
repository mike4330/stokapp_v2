/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { LineChart, Line, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Plot from 'react-plotly.js';
import TimeFrameSelector, { TimeFrame } from '../components/TimeFrameSelector';

interface MPTResultData {
  timestamp: string;
  expected_return: number | null;
  volatility: number | null;
  sharpe_ratio: number | null;
}

interface MPTScatterData {
  expected_return: number;
  lower_bound: number;
  timestamp: string;
}

interface MPTGammaScatterData {
  gamma: number;
  expected_return: number;
  timestamp: string;
}

interface ValidationRow {
  run_date: string;
  forward_date: string;
  predicted_pct: number | null;
  held_through_pct: number | null;
  as_traded_pct: number | null;
  trading_delta: number | null;
  n_held: number;
  n_sold: number;
  is_keystone: boolean;
  regime_run_count: number | null;
  regime_signature: string | null;
}

interface ValidationResponse {
  horizon_days: number;
  rows: ValidationRow[];
}

// Shared chart palette — matches the Recharts stroke/grid tokens used below.
const CHART_AXIS_COLOR = '#9CA3AF'; // gray-400
const CHART_GRID_COLOR = '#374151'; // gray-700
const CHART_TICK_FONT_SIZE = 11;
const CHART_TOOLTIP_BG = 'rgba(17, 24, 39, 0.9)';
const CHART_TOOLTIP_BORDER = '#374151';
const CHART_TOOLTIP_TEXT = '#F3F4F6';

const plotlyAxis = (title: string, tickformat: string) => ({
  title: { text: title, font: { color: CHART_AXIS_COLOR, size: 12 } },
  gridcolor: CHART_GRID_COLOR,
  linecolor: CHART_GRID_COLOR,
  zerolinecolor: CHART_GRID_COLOR,
  tickcolor: CHART_AXIS_COLOR,
  tickfont: { color: CHART_AXIS_COLOR, size: CHART_TICK_FONT_SIZE },
  tickformat,
});

const plotlyLayoutBase = {
  autosize: true,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { color: CHART_AXIS_COLOR, size: CHART_TICK_FONT_SIZE },
  margin: { t: 20, r: 20, b: 50, l: 60 },
  hovermode: 'closest' as const,
  hoverlabel: {
    bgcolor: CHART_TOOLTIP_BG,
    bordercolor: CHART_TOOLTIP_BORDER,
    font: { color: CHART_TOOLTIP_TEXT },
  },
};

interface PerformanceData {
  // Define your performance data structure here
  // This will depend on what backend API you create
}

const ModelPerformance: React.FC = () => {
  // Grid Layout Configuration
  // Each row defines: cols (number of columns) and cards (array of card identifiers)
  const gridLayout = [
    { cols: 2, cards: ['expected-return-time', 'expected-return-lower-bound-contour'] },
    { cols: 2, cards: ['gamma-expected-return-contour', 'validation-table'] },
  ];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<MPTResultData[]>([]);
  const [scatterData, setScatterData] = useState<MPTScatterData[]>([]);
  const [gammaScatterData, setGammaScatterData] = useState<MPTGammaScatterData[]>([]);
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);
  const [validationLoading, setValidationLoading] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1Y');

  // Fetch MPT results data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Calculate days based on timeFrame
        let days = 365;
        switch (timeFrame) {
          case '1M':
            days = 30;
            break;
          case '3M':
            days = 90;
            break;
          case '6M':
            days = 180;
            break;
          case '1Y':
            days = 365;
            break;
          case '2Y':
            days = 730;
            break;
          case 'ALL':
            days = 3650;
            break;
        }

        // Fetch time series and scatter data in parallel
        const [timeSeriesResponse, scatterResponse, gammaScatterResponse] = await Promise.all([
          fetch(`/api/mpt-results/time-series?days=${days}`),
          fetch(`/api/mpt-results/scatter?days=${days}`),
          fetch(`/api/mpt-results/gamma-scatter?days=${days}`)
        ]);

        if (!timeSeriesResponse.ok) {
          throw new Error('Failed to fetch MPT results time series');
        }
        if (!scatterResponse.ok) {
          throw new Error('Failed to fetch MPT results scatter data');
        }
        if (!gammaScatterResponse.ok) {
          throw new Error('Failed to fetch MPT results gamma scatter data');
        }

        const timeSeriesData = await timeSeriesResponse.json();
        const scatterData = await scatterResponse.json();
        const gammaScatterData = await gammaScatterResponse.json();

        setTimeSeriesData(timeSeriesData);
        setScatterData(scatterData);
        setGammaScatterData(gammaScatterData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model performance data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeFrame]);

  // Validation table is independent of timeFrame (always 1y forward horizon, 6 evenly-spaced run dates)
  useEffect(() => {
    const fetchValidation = async () => {
      setValidationLoading(true);
      setValidationError(null);
      try {
        const r = await fetch('/api/mpt-results/validation?horizon_days=365&n_periods=8&n_keystones=3');
        if (!r.ok) throw new Error('Failed to fetch validation data');
        setValidationData(await r.json());
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Failed to load validation');
      } finally {
        setValidationLoading(false);
      }
    };
    fetchValidation();
  }, []);

  // Render individual card based on cardId
  const renderCard = (cardId: string) => {
    switch (cardId) {
      case 'expected-return-time':
        return (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Expected Return Over Time
            </h3>
            <div className="mb-4">
              <TimeFrameSelector
                timeFrame={timeFrame}
                onTimeFrameChange={setTimeFrame}
              />
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={timeSeriesData}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(timestamp) => {
                      const date = new Date(timestamp);
                      return date.toLocaleDateString();
                    }}
                    stroke={CHART_AXIS_COLOR}
                    tick={{ fontSize: CHART_TICK_FONT_SIZE }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                    stroke={CHART_AXIS_COLOR}
                    tick={{ fontSize: CHART_TICK_FONT_SIZE }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: CHART_TOOLTIP_BG,
                      border: `1px solid ${CHART_TOOLTIP_BORDER}`,
                      borderRadius: '0.375rem',
                    }}
                    labelStyle={{ color: CHART_TOOLTIP_TEXT }}
                    formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Expected Return']}
                    labelFormatter={(timestamp) => {
                      const date = new Date(timestamp);
                      return date.toLocaleString();
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expected_return"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'expected-return-lower-bound-contour':
        return (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Expected Return vs Lower Bound (Contour)
            </h3>
            <div className="mb-4">
              <TimeFrameSelector
                timeFrame={timeFrame}
                onTimeFrameChange={setTimeFrame}
              />
            </div>
            <div className="h-80">
              {scatterData.length > 0 ? (
                <Plot
                  data={[
                    {
                      type: 'histogram2dcontour',
                      x: scatterData.map(d => d.lower_bound * 100),
                      y: scatterData.map(d => d.expected_return * 100),
                      colorscale: [
                        [0, 'rgba(5, 150, 105, 0)'],
                        [0.1, 'rgba(5, 150, 105, 0.05)'],
                        [0.2, 'rgba(20, 83, 45, 0.2)'],
                        [0.3, 'rgba(21, 128, 61, 0.3)'],
                        [0.4, 'rgba(22, 163, 74, 0.4)'],
                        [0.5, 'rgba(34, 197, 94, 0.5)'],
                        [0.6, 'rgba(74, 222, 128, 0.6)'],
                        [0.7, 'rgba(134, 239, 172, 0.75)'],
                        [0.85, 'rgba(187, 247, 208, 0.85)'],
                        [1, 'rgba(220, 252, 231, 0.95)']
                      ],
                      reversescale: false,
                      showscale: false,
                      contours: {
                        coloring: 'fill',
                        showlabels: true,
                      },
                    }
                  ]}
                  layout={{
                    ...plotlyLayoutBase,
                    xaxis: plotlyAxis('Lower Bound (%)', '.4f'),
                    yaxis: plotlyAxis('Expected Return (%)', '.2f'),
                  }}
                  config={{
                    displayModeBar: false,
                    responsive: true,
                  }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  No data available
                </div>
              )}
            </div>
          </div>
        );

      case 'gamma-expected-return-contour':
        return (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Gamma vs Expected Return (Contour)
            </h3>
            <div className="mb-4">
              <TimeFrameSelector
                timeFrame={timeFrame}
                onTimeFrameChange={setTimeFrame}
              />
            </div>
            <div className="h-80">
              {gammaScatterData.length > 0 ? (
                <Plot
                  data={[
                    {
                      type: 'histogram2dcontour',
                      x: gammaScatterData.map(d => d.gamma),
                      y: gammaScatterData.map(d => d.expected_return * 100),
                      colorscale: [
                        [0, 'rgba(5, 150, 105, 0)'],
                        [0.1, 'rgba(5, 150, 105, 0.05)'],
                        [0.2, 'rgba(20, 83, 45, 0.2)'],
                        [0.3, 'rgba(21, 128, 61, 0.3)'],
                        [0.4, 'rgba(22, 163, 74, 0.4)'],
                        [0.5, 'rgba(34, 197, 94, 0.5)'],
                        [0.6, 'rgba(74, 222, 128, 0.6)'],
                        [0.7, 'rgba(134, 239, 172, 0.75)'],
                        [0.85, 'rgba(187, 247, 208, 0.85)'],
                        [1, 'rgba(220, 252, 231, 0.95)']
                      ],
                      reversescale: false,
                      showscale: false,
                      contours: {
                        coloring: 'fill',
                        showlabels: true,
                      },
                    }
                  ]}
                  layout={{
                    ...plotlyLayoutBase,
                    xaxis: plotlyAxis('Gamma', '.2f'),
                    yaxis: plotlyAxis('Expected Return (%)', '.2f'),
                  }}
                  config={{
                    displayModeBar: false,
                    responsive: true,
                  }}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  No data available
                </div>
              )}
            </div>
          </div>
        );

      case 'validation-table': {
        const fmtPct = (v: number | null) =>
          v === null || v === undefined ? '—' : `${v.toFixed(2)}%`;
        const surpriseColor = (predicted: number | null, realized: number | null) => {
          if (predicted === null || realized === null) return '';
          const diff = realized - predicted;
          if (Math.abs(diff) < 2) return 'text-gray-600 dark:text-gray-300';
          return diff > 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400';
        };
        const deltaColor = (delta: number | null) => {
          if (delta === null || delta === undefined) return '';
          if (Math.abs(delta) < 1) return 'text-gray-600 dark:text-gray-300';
          return delta > 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400';
        };
        return (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Predicted vs Realized (1y horizon)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              <span className="font-medium">Held-through</span> = survivor cohort, renormalized (cleanest read on model quality).{' '}
              <span className="font-medium">As-traded</span> = full t0 basket, sold positions exit at last observed price.{' '}
              Rows marked{' '}
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-amber-500 text-white text-[10px] font-bold align-middle">K</span>{' '}
              are anchored to keystone regimes (param clusters with many runs); others are evenly-spaced fills.
            </p>
            <div className="h-80 overflow-auto">
              {validationLoading && (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  Loading validation…
                </div>
              )}
              {validationError && (
                <div className="text-rose-600 dark:text-rose-400 p-2 text-sm">{validationError}</div>
              )}
              {!validationLoading && !validationError && validationData && (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
                    <tr className="text-left text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700">
                      <th className="py-2 pr-2 font-medium">Run date</th>
                      <th className="py-2 px-2 font-medium text-right">Predicted</th>
                      <th className="py-2 px-2 font-medium text-right">Held-through</th>
                      <th className="py-2 px-2 font-medium text-right">As-traded</th>
                      <th className="py-2 px-2 font-medium text-right">Δ trade</th>
                      <th className="py-2 pl-2 font-medium text-right">Held / Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationData.rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-gray-500 dark:text-gray-400">
                          No runs old enough for 1y forward window yet.
                        </td>
                      </tr>
                    )}
                    {validationData.rows.map((row) => (
                      <tr
                        key={row.run_date}
                        className={`border-b border-gray-200 dark:border-gray-800 ${
                          row.is_keystone
                            ? 'bg-amber-50/60 dark:bg-amber-900/10 border-l-4 border-l-amber-500'
                            : ''
                        }`}
                      >
                        <td className="py-2 pr-2 font-mono text-gray-800 dark:text-gray-200">
                          {row.is_keystone && (
                            <span
                              title={
                                row.regime_signature
                                  ? `Keystone regime: ${row.regime_signature}\n${row.regime_run_count} validatable run dates in this regime`
                                  : 'Keystone regime'
                              }
                              className="inline-flex items-center justify-center w-4 h-4 mr-1.5 rounded-sm bg-amber-500 text-white text-[10px] font-bold align-middle cursor-help"
                            >
                              K
                            </span>
                          )}
                          {row.run_date}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-800 dark:text-gray-200">
                          {fmtPct(row.predicted_pct)}
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-medium ${surpriseColor(
                            row.predicted_pct,
                            row.held_through_pct
                          )}`}
                        >
                          {fmtPct(row.held_through_pct)}
                        </td>
                        <td className="py-2 px-2 text-right text-gray-800 dark:text-gray-200">
                          {fmtPct(row.as_traded_pct)}
                        </td>
                        <td className={`py-2 px-2 text-right font-medium ${deltaColor(row.trading_delta)}`}>
                          {row.trading_delta === null
                            ? '—'
                            : `${row.trading_delta > 0 ? '+' : ''}${row.trading_delta.toFixed(2)}`}
                        </td>
                        <td className="py-2 pl-2 text-right text-gray-600 dark:text-gray-400 tabular-nums">
                          {row.n_held} / {row.n_sold}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="-mx-8 md:-mx-12 xl:-mx-16 px-2 py-6">
      <Helmet>
        <title>Model Performance | MPM</title>
      </Helmet>
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Model Performance</h1>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="bg-green-800 py-3 px-6">
          <h2 className="text-lg font-semibold text-white">Portfolio Model Performance Analysis</h2>
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
          {!loading && !error && (
            <div className="space-y-3">
              {gridLayout.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={`grid grid-cols-1 md:grid-cols-${row.cols} gap-3`}
                >
                  {row.cards.map((cardId) => (
                    <div key={cardId}>{renderCard(cardId)}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelPerformance;

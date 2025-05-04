import React, { useEffect, useState } from 'react';
import SymbolWeightChart from '../components/SymbolWeightChart';

const colorPalette = [
  '#fe1111', '#f472b6', '#fbcfe8', '#ec4899', '#c4b5fd', '#8b5cf6', '#60a5fa', '#4ade80',
  '#facc15', '#f87171', '#38bdf8', '#fbbf24', '#34d399', '#f472b6', '#818cf8', '#f59e42',
  '#f472b6', '#a3e635', '#f87171', '#fbbf24', '#f472b6', '#f472b6', '#f472b6', '#f472b6',
];

interface WeightDataPoint {
  date: string;
  weight: number;
  target: number;
}

type SymbolState = {
  data: WeightDataPoint[] | null;
  loading: boolean;
  error: string | null;
};

interface Holding {
  symbol: string;
}

const AllocationGrid: React.FC = () => {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbolStates, setSymbolStates] = useState<Record<string, SymbolState>>({});

  useEffect(() => {
    fetch('/api/holdings')
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data: Holding[]) => {
        setSymbols(data.map((h) => h.symbol));
      })
      .catch((err) => {
        // Optionally handle error for symbol list
      });
  }, []);

  useEffect(() => {
    symbols.forEach((symbol) => {
      setSymbolStates((prev) => ({
        ...prev,
        [symbol]: { data: null, loading: true, error: null },
      }));
      fetch(`/api/weights?symbol=${encodeURIComponent(symbol)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          return res.json();
        })
        .then((json) => {
          setSymbolStates((prev) => ({
            ...prev,
            [symbol]: { data: json, loading: false, error: null },
          }));
        })
        .catch((err) => {
          setSymbolStates((prev) => ({
            ...prev,
            [symbol]: { data: null, loading: false, error: err.message },
          }));
        });
    });
  }, [symbols]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-100">Allocation Grid</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-6">
        {symbols.map((symbol, i) => {
          const state = symbolStates[symbol] || { data: null, loading: true, error: null };
          const color = colorPalette[i % colorPalette.length];
          return (
            <div
              key={symbol}
              className="rounded-xl bg-gray-900/80 dark:bg-gray-800/80 border border-gray-700 shadow-lg p-4 h-72 flex flex-col transition hover:ring-2 hover:ring-primary-500"
            >
              <div className="flex items-center mb-2">
                <span className="font-semibold text-lg text-gray-100 mr-2">{symbol}</span>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-center">
                {state.loading && <span className="text-gray-400 italic">Loading...</span>}
                {state.error && <span className="text-red-500 text-xs">{state.error}</span>}
                {state.data && state.data.length > 0 && (
                  <SymbolWeightChart symbol={symbol} color={color} data={state.data} />
                )}
                {state.data && state.data.length === 0 && !state.loading && !state.error && (
                  <span className="text-gray-400 italic">No data</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AllocationGrid; 

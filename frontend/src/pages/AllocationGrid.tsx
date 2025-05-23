/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import SymbolWeightChart from '../components/SymbolWeightChart';

const colorPalette = [
'#0000dd',
'#226922',
'#cc1111',
'#1111ee', 
'#115811',
'#df1c1c',
'#2222ff', 
'#337a33',
'#3333ff', 
'#ef2d2d' ,
'#4444ff',
'#448b44',
    
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
        const symbolList = data.map((h) => h.symbol);
        setSymbols(symbolList);
        
        // Initialize states for all symbols
        const initialStates = symbolList.reduce((acc, symbol) => ({
          ...acc,
          [symbol]: { data: null, loading: true, error: null }
        }), {});
        setSymbolStates(initialStates);
        
        // Make a single batch request for all symbols
        if (symbolList.length > 0) {
          const symbolsParam = symbolList.join(',');
          fetch(`/api/weights?symbols=${encodeURIComponent(symbolsParam)}`)
            .then((res) => {
              if (!res.ok) throw new Error(`API error: ${res.status}`);
              return res.json();
            })
            .then((dataBySymbol) => {
              setSymbolStates((prev) => {
                const newStates = { ...prev };
                Object.entries(dataBySymbol).forEach(([symbol, data]) => {
                  newStates[symbol] = {
                    data: data as WeightDataPoint[],
                    loading: false,
                    error: null
                  };
                });
                return newStates;
              });
            })
            .catch((err) => {
              setSymbolStates((prev) => {
                const newStates = { ...prev };
                Object.keys(prev).forEach((symbol) => {
                  newStates[symbol] = {
                    data: null,
                    loading: false,
                    error: err.message
                  };
                });
                return newStates;
              });
            });
        }
      })
      .catch((err) => {
        // Optionally handle error for symbol list
      });
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-100">Allocation Grid</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-5">
        {symbols.map((symbol, i) => {
          const state = symbolStates[symbol] || { data: null, loading: true, error: null };
          const color = colorPalette[i % colorPalette.length];
          return (
            <div
              key={symbol}
              className="rounded-xl bg-gray-900/80 dark:bg-gray-900/80 border border-gray-700 shadow-lg p-4 h-72 flex flex-col transition hover:ring-2 hover:ring-primary-500"
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

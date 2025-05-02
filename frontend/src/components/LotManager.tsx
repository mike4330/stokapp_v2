/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * LotManager Component
 * 
 * A sortable table interface for managing investment lots. Displays open lots with their
 * current status, including basis, P/L, and term status. Supports filtering by term
 * length and P/L percentage, with real-time client-side sorting on all columns.
 */

import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import axios from 'axios';
import { useCombobox } from 'downshift';

// Viridis color palette (10 colors, from matplotlib)
const viridisPalette = [
  '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
  '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'
];

export interface OpenLot {
  id: number;
  acct: string;
  symbol: string;
  date_new: string;
  units: number | null;
  units_remaining: number | null;
  price: number | null;
  term: string | null;
  lot_basis: number | null;
  current_value: number | null;
  profit_loss: number | null;
  pl_pct: number | null;
}

type SortField = keyof OpenLot;
type SortDirection = 'asc' | 'desc';
type TermFilter = 'all' | 'long' | 'short';

export interface LotManagerRef {
  refresh: () => Promise<void>;
}

interface LotManagerProps {
  onEditLot?: (lot: OpenLot) => void;
  onCloseLot?: (lot: OpenLot) => void;
}

const LotManager = forwardRef<LotManagerRef, LotManagerProps>((props, ref) => {
  const [lots, setLots] = useState<OpenLot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [termFilter, setTermFilter] = useState<TermFilter>('all');
  const [plFilter, setPlFilter] = useState<number>(-100);
  const [basisFilter, setBasisFilter] = useState<number>(0);
  const [symbolDrilldown, setSymbolDrilldown] = useState<string | null>(null);
  const [symbolInput, setSymbolInput] = useState('');
  const [symbolSuggestions, setSymbolSuggestions] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Calculate min and max basis values from the data
  const { minBasis, maxBasis } = useMemo(() => {
    if (lots.length === 0) return { minBasis: 0, maxBasis: 10000 };
    
    const validBasis = lots
      .map((lot: OpenLot) => lot.lot_basis)
      .filter((basis: number | null): basis is number => basis !== null);
    
    if (validBasis.length === 0) return { minBasis: 0, maxBasis: 10000 };
    
    const min = Math.floor(Math.min(...validBasis));
    const max = Math.ceil(Math.max(...validBasis));
    
    return { minBasis: min, maxBasis: max };
  }, [lots]);

  const fetchLots = async () => {
    console.log('Starting to fetch lots...');
    try {
      setIsLoading(true);
      const response = await axios.get('/api/open-lots');
      console.log('Received lots data:', response.data);
      console.log('Current lots count:', lots.length);
      console.log('New lots count:', response.data.length);
      
      setLots(response.data);
      
      // Initialize basis filter to minimum value if we have data
      if (response.data.length > 0) {
        const minBasis = Math.floor(Math.min(...response.data
          .map((lot: OpenLot) => lot.lot_basis)
          .filter((basis: number | null): basis is number => basis !== null)));
        console.log('Setting new basis filter:', minBasis);
        setBasisFilter(minBasis);
      }
      
      setError(null);
    } catch (err) {
      console.error('Failed to fetch lots:', err);
      setError('Failed to fetch open lots');
    } finally {
      setIsLoading(false);
      console.log('Finished fetching lots');
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: fetchLots
  }));

  useEffect(() => {
    console.log('LotManager mounted, fetching initial data...');
    fetchLots();
  }, []);

  useEffect(() => {
    console.log('Lots data updated, new count:', lots.length);
  }, [lots]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Symbol autocomplete setup using downshift
  const {
    isOpen: isComboboxOpen,
    getMenuProps,
    getInputProps,
    getLabelProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    items: symbolSuggestions,
    inputValue: symbolInput,
    onInputValueChange: async ({ inputValue }) => {
      setSymbolInput(inputValue || '');
      if (inputValue) {
        try {
          const response = await axios.get<string[]>(`/api/symbols/search?q=${inputValue}`);
          setSymbolSuggestions(response.data);
        } catch (error) {
          setSymbolSuggestions([]);
        }
      } else {
        setSymbolSuggestions([]);
      }
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        setSelectedSymbol(selectedItem);
        setSymbolInput(selectedItem);
        setSymbolSuggestions([]);
      }
    },
  });

  const filteredLots = lots.filter(lot => {
    // Symbol drilldown filter
    if (symbolDrilldown && lot.symbol !== symbolDrilldown) return false;
    // Symbol typeahead filter
    if (selectedSymbol && lot.symbol !== selectedSymbol) return false;
    // Term filter
    if (termFilter !== 'all') {
      const purchaseDate = new Date(lot.date_new);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const isLongTerm = purchaseDate < oneYearAgo;
      
      if (termFilter === 'long' && !isLongTerm) return false;
      if (termFilter === 'short' && isLongTerm) return false;
    }

    // P/L percentage filter
    if (lot.pl_pct === null) return false;
    if (lot.pl_pct < plFilter) return false;

    // Cost basis filter
    if (lot.lot_basis === null) return false;
    return lot.lot_basis >= basisFilter;
  });

  const sortedLots = [...filteredLots].sort((a, b) => {
    let aValue = a[sortField];
    let bValue = b[sortField];

    // Handle null values
    if (aValue === null) return sortDirection === 'asc' ? -1 : 1;
    if (bValue === null) return sortDirection === 'asc' ? 1 : -1;

    // Special handling for dates
    if (sortField === 'date_new') {
      aValue = new Date(aValue as string).getTime();
      bValue = new Date(bValue as string).getTime();
    }

    // Compare values
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (field !== sortField) return <span className="ml-1 text-gray-400">↕</span>;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const handleEditLot = (lot: OpenLot) => {
    if (props.onEditLot) {
      props.onEditLot(lot);
    }
  };

  // Helper to get max pl_pct in filteredLots
  const maxPLPct = useMemo(() => {
    const validPL = filteredLots
      .map(lot => lot.pl_pct)
      .filter((v): v is number => v !== null && v >= 10);
    return validPL.length > 0 ? Math.max(...validPL) : 10;
  }, [filteredLots]);

  // Helper to map pl_pct to palette index
  function getViridisColor(pl_pct: number | null): string {
    if (pl_pct === null || pl_pct < 10) return 'transparent';
    const min = 10;
    const max = maxPLPct;
    if (max === min) return viridisPalette[viridisPalette.length - 1];
    const idx = Math.min(
      viridisPalette.length - 1,
      Math.floor(((pl_pct - min) / (max - min)) * (viridisPalette.length - 1))
    );
    return viridisPalette[idx];
  }

  // Helper to determine text color for contrast
  function getTextColor(bgColor: string): string {
    if (bgColor === 'transparent') return 'inherit';
    // Simple luminance check
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // Perceived luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#222' : '#fff';
  }

  // Loading spinner display while fetching data
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Error message display if data fetch fails
  if (error) {
    return (
      <div className="text-center text-red-600 p-4">
        {error}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 py-4">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Open Lots Manager</h1>
      {/* Drilldown chip below title */}
      {symbolDrilldown && (
        <div className="mt-2 mb-4 flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-sm font-semibold">
            Symbol: {symbolDrilldown}
            <button
              className="ml-2 text-blue-600 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100 font-bold"
              onClick={() => setSymbolDrilldown(null)}
              title="Clear symbol filter"
            >
              ×
            </button>
          </span>
        </div>
      )}
      {/* Sticky filter box below navbar */}
      <div className="flex justify-between items-start mb-4">
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Term Filter</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setTermFilter('all')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    termFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTermFilter('long')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    termFilter === 'long'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Long Term
                </button>
                <button
                  onClick={() => setTermFilter('short')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    termFilter === 'short'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Short Term
                </button>
              </div>
              {/* Symbol type-ahead filter */}
              <div className="mt-3">
                <label {...getLabelProps()} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Symbol Filter</label>
                <div className="relative">
                  <input
                    {...getInputProps()}
                    className="block w-full rounded-md bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Type to search symbol..."
                  />
                  {selectedSymbol && (
                    <button
                      className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold focus:outline-none"
                      onClick={() => { setSelectedSymbol(null); setSymbolInput(''); setSymbolSuggestions([]); }}
                      title="Clear symbol filter"
                      type="button"
                    >
                      ×
                    </button>
                  )}
                  <ul {...getMenuProps()} 
                    className={`absolute z-50 w-full bg-white dark:bg-gray-700 mt-1 rounded-md shadow-lg max-h-60 overflow-auto border border-gray-300 dark:border-gray-600 ${
                      isComboboxOpen && symbolSuggestions.length > 0 ? 'block' : 'hidden'
                    }`}
                  >
                    {isComboboxOpen &&
                      symbolSuggestions.map((item, index) => (
                        <li
                          key={item}
                          {...getItemProps({ item, index })}
                          className={`px-3 py-2 cursor-pointer text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600 text-sm ${
                            highlightedIndex === index ? 'bg-gray-200 dark:bg-gray-600' : ''
                          }`}
                        >
                          {item}
                        </li>
                      ))
                    }
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4 min-w-[250px]">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">P/L Filter</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap w-24">
                    ≥ {plFilter}%
                  </span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={plFilter}
                    onChange={(e) => setPlFilter(Number(e.target.value))}
                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 
                      [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0
                      [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full 
                      [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-0"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Basis Filter</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap w-24">
                    ≥ ${basisFilter.toLocaleString()}
                  </span>
                  <input
                    type="range"
                    min={minBasis}
                    max={maxBasis}
                    step={5}
                    value={basisFilter}
                    onChange={(e) => setBasisFilter(Number(e.target.value))}
                    className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 
                      [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0
                      [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full 
                      [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full bg-white dark:bg-gray-800 shadow-md text-sm">
          {/* Table header with sortable columns */}
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {[
                // Column definitions with fixed widths for responsive layout
                { field: 'id' as const, label: 'ID', className: 'w-12' },
                { field: 'symbol' as const, label: 'Sym', className: 'w-16' },
                { field: 'acct' as const, label: 'Acct', className: 'w-16' },
                { field: 'date_new' as const, label: 'Date', className: 'w-20' },
                { field: 'units' as const, label: 'Units', className: 'w-16' },
                { field: 'units_remaining' as const, label: 'Rem', className: 'w-16' },
                { field: 'price' as const, label: 'Price', className: 'w-16' },
                { field: 'lot_basis' as const, label: 'Basis', className: 'w-20' },
                { field: 'current_value' as const, label: 'Value', className: 'w-20' },
                { field: 'profit_loss' as const, label: 'P/L$', className: 'w-20' },
                { field: 'pl_pct' as const, label: 'P/L%', className: 'w-16' },
                { field: 'term' as const, label: 'Term', className: 'w-16' },
              ].map(({ field, label, className }) => (
                <th
                  key={field}
                  onClick={() => handleSort(field)}
                  className={`px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 ${className}`}
                >
                  {label}
                  <SortIcon field={field} />
                </th>
              ))}
            </tr>
          </thead>
          {/* Table body with formatted lot data */}
          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
            {sortedLots.map((lot) => (
              <tr 
                key={lot.id}
                className="hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  <button
                    className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 cursor-pointer"
                    title="Close this lot"
                    onClick={() => props.onCloseLot && props.onCloseLot(lot)}
                  >
                    {lot.id}
                  </button>
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                  <button
                    className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 cursor-pointer focus:outline-none"
                    onClick={() => setSymbolDrilldown(lot.symbol)}
                    title={`Drill down to ${lot.symbol}`}
                  >
                    {lot.symbol}
                  </button>
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{lot.acct}</td>
                {/* Format date to locale string */}
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.date_new || '-'}
                </td>
                {/* Format numerical values with appropriate precision */}
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.units !== null && lot.units !== undefined ? lot.units.toFixed(4) : '-'}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.units_remaining !== null && lot.units_remaining !== undefined ? lot.units_remaining.toFixed(4) : '-'}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.price ? `$${lot.price.toFixed(2)}` : '-'}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.lot_basis ? `$${lot.lot_basis.toFixed(2)}` : '-'}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.current_value ? `$${lot.current_value.toFixed(2)}` : '-'}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.profit_loss ? `$${lot.profit_loss.toFixed(2)}` : '-'}
                </td>
                <td
                  className={`px-2 py-2 whitespace-nowrap text-sm${(lot.pl_pct === null || lot.pl_pct < 10 ? ' text-gray-500 dark:text-gray-300' : '')}`}
                  style={{
                    background: getViridisColor(lot.pl_pct),
                    color: (lot.pl_pct === null || lot.pl_pct < 10)
                      ? undefined
                      : getTextColor(getViridisColor(lot.pl_pct)),
                    transition: 'background 0.2s',
                  }}
                >
                  {lot.pl_pct ? `${lot.pl_pct.toFixed(2)}%` : '-'}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {lot.term ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default LotManager; 
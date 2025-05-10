/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * PositionDetails Component
 * 
 * Displays detailed information for a single investment position, including
 * current value, cost basis, unrealized gains/losses, and performance metrics.
 * Includes navigation controls to move between different holdings.
 */

import React from 'react';

interface Position {
  symbol: string;
  units: number;
  current_price: number;
  position_value: number;
  cost_basis: number;
  unrealized_gain: number;
  unrealized_gain_percent: number;
  realized_pl: number;
  total_dividends: number;
}

interface PositionDetailsProps {
  position: Position;
  currentIndex: number;
  totalPositions: number;
  onNavigate: (direction: 'next' | 'prev') => void;
}

export const PositionDetails: React.FC<PositionDetailsProps> = ({ 
  position, 
  currentIndex, 
  totalPositions,
  onNavigate 
}) => {
  const totalReturn = position.unrealized_gain + position.realized_pl + position.total_dividends;
  const totalReturnPercent = (totalReturn / (position.cost_basis * position.units)) * 100;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => onNavigate('prev')}
          disabled={currentIndex === 0}
          className={`px-4 py-2 rounded-lg ${
            currentIndex === 0 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          Previous <span className="text-xs ml-1 opacity-75">(A)</span>
        </button>
        <div className="text-gray-400">
          {currentIndex + 1} of {totalPositions}
        </div>
        <button
          onClick={() => onNavigate('next')}
          disabled={currentIndex === totalPositions - 1}
          className={`px-4 py-2 rounded-lg ${
            currentIndex === totalPositions - 1 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          Next <span className="text-xs ml-1 opacity-75">(Z)</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 border border-gray-700 rounded-lg p-4">
        {/* Left Column - Labels */}
        <div className="space-y-1 border-r border-gray-700 pr-2">
          <div className="text-left text-gray-400 whitespace-nowrap">Units:</div>
          <div className="text-left text-gray-400 whitespace-nowrap">Current Price:</div>
          <div className="text-left text-gray-400 whitespace-nowrap">Position Value:</div>
          <div className="text-left text-gray-400 whitespace-nowrap">Cost Basis:</div>
          <div className="text-left text-gray-400 whitespace-nowrap">Total Return:</div>
          <div className="text-left text-gray-400 whitespace-nowrap">Unrealized P/L:</div>
          <div className="text-left text-gray-400 whitespace-nowrap">Realized P/L:</div>
          <div className="text-left text-gray-400 whitespace-nowrap">Total Dividends:</div>
        </div>

        {/* Right Column - Values */}
        <div className="space-y-1 pl-2">
          <div className="text-left whitespace-nowrap font-mono">{position.units.toLocaleString()}</div>
          
          <div className="text-left whitespace-nowrap font-mono">
            ${position.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="text-left whitespace-nowrap font-mono">
            ${position.position_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="text-left whitespace-nowrap font-mono">
            ${position.cost_basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className={`text-left whitespace-nowrap font-mono ${totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${totalReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({totalReturnPercent.toFixed(2)}%)
          </div>
          
          <div className={`text-left whitespace-nowrap font-mono ${position.unrealized_gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${position.unrealized_gain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({position.unrealized_gain_percent.toFixed(2)}%)
          </div>
          
          <div className={`text-left whitespace-nowrap font-mono ${position.realized_pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${position.realized_pl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="text-left font-mono text-green-400 whitespace-nowrap">
            ${position.total_dividends.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
};

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
}

export const PositionDetails: React.FC<PositionDetailsProps> = ({ position }) => {
  const totalReturn = position.unrealized_gain + position.realized_pl + position.total_dividends;
  const totalReturnPercent = (totalReturn / (position.cost_basis * position.units)) * 100;

  return (
    <div>
      <div className="grid grid-cols-2 gap-6 border border-gray-600 rounded-lg p-4">
        {/* Left Column - Labels */}
        <div className="space-y-2 border-r border-gray-600 pr-4">
          <div className="text-left text-gray-400">Units:</div>
          <div className="text-left text-gray-400">Current Price:</div>
          <div className="text-left text-gray-400">Position Value:</div>
          <div className="text-left text-gray-400">Cost Basis:</div>
          <div className="text-left text-gray-400">Total Return:</div>
          <div className="text-left text-gray-400">Unrealized P/L:</div>
          <div className="text-left text-gray-400">Realized P/L:</div>
          <div className="text-left text-gray-400">Total Dividends:</div>
        </div>

        {/* Right Column - Values */}
        <div className="space-y-2 pl-2">
          <div className="text-left">{position.units.toLocaleString()}</div>
          
          <div className="text-left">
            ${position.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="text-left">
            ${position.position_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="text-left">
            ${position.cost_basis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className={`text-left ${totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${totalReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({totalReturnPercent.toFixed(2)}%)
          </div>
          
          <div className={`text-left ${position.unrealized_gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${position.unrealized_gain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({position.unrealized_gain_percent.toFixed(2)}%)
          </div>
          
          <div className={`text-left ${position.realized_pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${position.realized_pl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          
          <div className="text-left text-green-400">
            ${position.total_dividends.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
};

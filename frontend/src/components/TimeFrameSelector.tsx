/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * TimeFrameSelector Component
 *
 * Reusable time frame selector with button group for filtering time-based data.
 * Supports common time frames: 1M, 3M, 6M, 1Y, 2Y, ALL
 */

import React from 'react';

export type TimeFrame = '1M' | '3M' | '6M' | '1Y' | '2Y' | 'ALL';

interface TimeFrameSelectorProps {
  timeFrame: TimeFrame;
  onTimeFrameChange: (timeFrame: TimeFrame) => void;
  options?: TimeFrame[]; // Allow custom subset of options
  className?: string;
}

const defaultOptions: TimeFrame[] = ['1M', '3M', '6M', '1Y', '2Y', 'ALL'];

export const TimeFrameSelector: React.FC<TimeFrameSelectorProps> = ({
  timeFrame,
  onTimeFrameChange,
  options = defaultOptions,
  className = '',
}) => {
  return (
    <div className={`flex space-x-2 ${className}`}>
      {options.map((tf) => (
        <button
          key={tf}
          onClick={() => onTimeFrameChange(tf)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            timeFrame === tf
              ? 'bg-green-700 text-white'
              : 'bg-gray-700 dark:bg-gray-600 text-gray-300 hover:bg-gray-600 dark:hover:bg-gray-500'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
};

export default TimeFrameSelector;

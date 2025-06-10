/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SunburstData {
  symbol: string;
  sector: string;
  industry: string;
  market_cap: string;
  value: number;
}

interface SunburstResponse {
  data: SunburstData[];
  total_value: number;
}

const PortfolioVisualization: React.FC = () => {
  return (
    <div className="flex flex-col items-center p-4">
      <h1 className="text-2xl font-bold mb-4">Portfolio Visualization</h1>
      <div className="bg-white rounded-lg shadow-lg p-4">
        <p className="text-gray-600">Sunburst chart has been removed due to performance issues.</p>
      </div>
    </div>
  );
};

export default PortfolioVisualization; 
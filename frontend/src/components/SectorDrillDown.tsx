/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * SectorDrillDown Component
 * 
 * Detailed breakdown view of holdings within a specific market sector.
 * Shows individual positions, their weights, and performance metrics
 * with sorting and filtering capabilities.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';

interface DrillDownProps {
  sector: string;
}

interface HoldingData {
  symbol: string;
  position_value: number;
  percentage: number;
}

interface RawHolding {
  symbol: string;
  units: number;
  current_price: number;
  position_value: number;
}

interface MPTData {
  symbol: string;
  sector: string;
}

// Ensure this matches the mapping in SectorAllocationChart.tsx
const SECTOR_NAME_MAP: Record<string, string> = {
  'Health Care': 'Healthcare',
  // Add more mappings here if needed
};

// Function to normalize sector names for consistency
const normalizeSectorName = (sector: string): string => {
  return SECTOR_NAME_MAP[sector] || sector;
};

const COLORS = [
  'rgba(0, 136, 254, 0.7)',    // Blue
  'rgba(0, 196, 159, 0.7)',    // Teal
  'rgba(255, 187, 40, 0.7)',   // Amber
  'rgba(255, 128, 66, 0.7)',   // Orange
  'rgba(136, 132, 216, 0.7)',  // Purple
  'rgba(236, 72, 153, 0.7)',   // Pink
  'rgba(52, 211, 153, 0.7)',   // Emerald
  'rgba(251, 146, 60, 0.7)',   // Orange
  'rgba(124, 58, 237, 0.7)',   // Violet
  'rgba(239, 68, 68, 0.7)',    // Red
];

const SectorDrillDown: React.FC<DrillDownProps> = ({ sector }) => {
  const [data, setData] = useState<HoldingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Normalize sector name for lookup
  const normalizedSector = normalizeSectorName(sector);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch both holdings and MPT data in parallel
        const [holdingsResponse, mptResponse] = await Promise.all([
          axios.get<RawHolding[]>('/api/holdings'),
          axios.get<MPTData[]>('/api/mpt')  // You'll need to ensure this endpoint exists
        ]);

        // Create a map of symbol to sector from MPT data
        const sectorMap = new Map(
          mptResponse.data.map(item => [item.symbol, normalizeSectorName(item.sector)])
        );

        // Filter holdings by normalized sector and calculate percentages
        const sectorHoldings = holdingsResponse.data.filter(holding => 
          sectorMap.get(holding.symbol) === normalizedSector
        );

        if (sectorHoldings.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }

        const totalSectorValue = sectorHoldings.reduce(
          (sum, holding) => sum + holding.position_value, 
          0
        );

        const processedData = sectorHoldings.map(holding => ({
          symbol: holding.symbol,
          position_value: holding.position_value,
          percentage: (holding.position_value / totalSectorValue) * 100
        }));

        // Sort by position value descending
        processedData.sort((a, b) => b.position_value - a.position_value);

        setData(processedData);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch holdings data');
        setLoading(false);
        console.error('Error fetching data:', err);
      }
    };

    fetchData();
  }, [normalizedSector]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-gray-100">{data.symbol}</p>
          <p className="text-gray-500 dark:text-gray-400">
            Value: ${data.position_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Percentage: {data.percentage.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        No holdings found in {normalizedSector} sector
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="position_value"
          nameKey="symbol"
          cx="50%"
          cy="50%"
          outerRadius="80%"
          innerRadius="40%"
          label={({ symbol, percentage }) => `${symbol} (${percentage.toFixed(1)}%)`}
          labelLine={true}
          animationDuration={750}
        >
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default SectorDrillDown; 
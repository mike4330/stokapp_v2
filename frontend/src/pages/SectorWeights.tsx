/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';

interface SectorWeightData {
  date: string;
  [sector: string]: number | string;
}

interface SectorConfig {
  name: string;
  key: string;
  color: string;
  targetAllocation?: number;
}

interface TargetAllocation {
  sector: string;
  target_percentage: number;
}

// Base sector configurations without hardcoded target allocations
const baseSectorConfigs: Omit<SectorConfig, 'targetAllocation'>[] = [
  { name: 'Commodities', key: 'commodities', color: '#eb220f' },
  { name: 'Consumer Disc.', key: 'consumer_discretionary', color: '#f57822' },
  { name: 'Consumer Staples', key: 'consumer_staples', color: '#209c9c' },
  { name: 'Energy', key: 'energy', color: '#202dff' },
  { name: 'Financials', key: 'financials', color: '#ff0c0c' },
  { name: 'Healthcare', key: 'healthcare', color: '#0ccd0c' },
  { name: 'Industrials', key: 'industrials', color: '#8178f0' },
  { name: 'Materials', key: 'materials', color: '#8080be' },
  { name: 'Precious Metals', key: 'precious_metals', color: '#808020' },
  { name: 'Technology', key: 'technology', color: '#787808' },
  { name: 'Utilities', key: 'utilities', color: '#76b800' },
  { name: 'Communications', key: 'communications', color: '#9a9a9a' },
  { name: 'Bonds', key: 'bonds', color: '#328432' },
  { name: 'Real Estate', key: 'real_estate', color: '#ffaaaa' },
];

// Mapping from database sector names to our keys
const sectorNameMapping: { [dbName: string]: string } = {
  'Commodities': 'commodities',
  'Consumer Discretionary': 'consumer_discretionary',
  'Consumer Staples': 'consumer_staples',
  'Energy': 'energy',
  'Financials': 'financials',
  'Healthcare': 'healthcare',
  'Industrials': 'industrials',
  'Materials': 'materials',
  'Precious Metals': 'precious_metals',
  'Tech': 'technology',
  'Utilities': 'utilities',
  'Communication Services': 'communications',
  'Bonds': 'bonds',
  'Real Estate': 'real_estate',
};

const SectorChart: React.FC<{ 
  config: SectorConfig; 
  data: SectorWeightData[]; 
  loading: boolean;
}> = ({ config, data, loading }) => {
  if (loading) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800/90 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
        <div className="h-40 flex items-center justify-center">
          <div className="text-sm text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  // Filter data that has valid values for this sector
  const validData = data.filter(d => 
    typeof d[config.key] === 'number' && !isNaN(d[config.key] as number)
  );

  if (validData.length === 0) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800/90 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
        <div className="text-xs font-medium mb-2 text-gray-900 dark:text-white">{config.name}</div>
        <div className="h-40 flex items-center justify-center">
          <div className="text-xs text-gray-500">No data</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 dark:bg-gray-800/90 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
      <div className="text-xs font-medium mb-2 text-gray-900 dark:text-white">
        {config.name} {config.targetAllocation && `(Target: ${config.targetAllocation.toFixed(1)}%)`}
      </div>
      <ResponsiveContainer width="100%" height={225}>
        <LineChart data={validData} margin={{ top: 5, right: 15, left: 25, bottom: 20 }}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#424242" 
            horizontal={true}
            vertical={false}
          />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 9, fill: '#9CA3AF' }}
            axisLine={{ stroke: '#6B7280' }}
            tickLine={{ stroke: '#6B7280' }}
            tickFormatter={(date) => {
              // Format date to show MM/DD
              const d = new Date(date);
              return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
            }}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis 
            tick={{ fontSize: 9, fill: '#9CA3AF' }}
            axisLine={{ stroke: '#6B7280' }}
            tickLine={{ stroke: '#6B7280' }}
            tickFormatter={(value) => `${value.toFixed(1)}%`}
            domain={([dataMin, dataMax]: [number, number]) => {
              // Include target allocation in the domain calculation
              const targetValue = config.targetAllocation || 0;
              const min = Math.min(dataMin, targetValue);
              const max = Math.max(dataMax, targetValue);
              // Add 10% padding to ensure reference line is clearly visible
              const padding = (max - min) * 0.1;
              return [Math.max(0, min - padding), max + padding];
            }}
          />
          <Line
            type="monotone"
            dataKey={config.key}
            stroke={config.color}
            strokeWidth={1.8}
            dot={false}
            connectNulls={false}
          />
          {config.targetAllocation && (
            <ReferenceLine 
              y={config.targetAllocation} 
              stroke="#808080"
              strokeDasharray="6 2"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const SectorWeights: React.FC = () => {
  const [data, setData] = useState<SectorWeightData[]>([]);
  const [sectorConfigs, setSectorConfigs] = useState<SectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/charts/sector-weights').then(r => r.json()),
      fetch('/api/charts/sector-target-allocations').then(r => r.json())
    ])
      .then(([weightsData, targetAllocations]: [SectorWeightData[], TargetAllocation[]]) => {
        // Create sector configs with dynamic target allocations
        const configsWithTargets: SectorConfig[] = baseSectorConfigs.map(baseConfig => {
          // Find matching target allocation from database
          const dbSectorName = Object.keys(sectorNameMapping).find(
            dbName => sectorNameMapping[dbName] === baseConfig.key
          );
          const targetAlloc = targetAllocations.find(ta => ta.sector === dbSectorName);
          
          
          return {
            ...baseConfig,
            targetAllocation: targetAlloc?.target_percentage || undefined
          };
        });

        setData(weightsData);
        setSectorConfigs(configsWithTargets);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching data:', err);
        setError('Failed to load sector data');
        setLoading(false);
      });
  }, []);

  if (error) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Sector Weights</h1>
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Sector Weight Analysis</h1>
      <div className="grid grid-cols-2 gap-4">
        {sectorConfigs.map((config) => (
          <SectorChart 
            key={config.key}
            config={config}
            data={data}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
};

export default SectorWeights;

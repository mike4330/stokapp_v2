/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * SectorAllocationChart Component
 * 
 * Interactive pie chart visualization showing portfolio allocation across different
 * market sectors. Includes drill-down capability to view individual holdings
 * within each sector.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import SectorDrillDown from './SectorDrillDown';

interface SectorData {
  sector: string;
  value: number;
  percentage: number;
}

interface SectorAllocationResponse {
  sectors: SectorData[];
  total_value: number;
}

interface FilterOptions {
  bonds: boolean;
  misc: boolean;
  preciousMetals: boolean;
  commodities: boolean;
}

// Sector name normalization mapping
const SECTOR_NAME_MAP: Record<string, string> = {
  'Health Care': 'Healthcare',
  // Add more mappings here if needed
};

const alpha = 0.5;  // Set your alpha value here
const COLORS = [
  `rgba(2, 138, 255, ${alpha})`,    // Blue
  `rgba(2, 198, 161, ${alpha})`,    // Teal
  `rgba(255, 187, 40, ${alpha})`,   // Amber
  `rgba(255, 128, 66, ${alpha})`,   // Orange
  `rgba(136, 132, 216, ${alpha})`,  // Purple
  `rgba(236, 72, 153, ${alpha})`,   // Pink
  `rgba(52, 211, 153, ${alpha})`,   // Emerald
  `rgba(251, 146, 60, ${alpha})`,   // Orange
  `rgba(124, 58, 237, ${alpha})`,   // Violet
  `rgba(239, 68, 68, ${alpha})`,    // Red
  `rgba(16, 185, 129, ${alpha})`,   // Green
  `rgba(59, 130, 246, ${alpha})`    // Light Blue
];

const SectorAllocationChart: React.FC = () => {
  const [data, setData] = useState<SectorData[]>([]);
  const [filteredData, setFilteredData] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    bonds: true,
    misc: true,
    preciousMetals: true,
    commodities: true
  });

  useEffect(() => {
    const fetchSectorData = async () => {
      try {
        const response = await axios.get<SectorAllocationResponse>('/api/sector-allocation');
        
        // Normalize sector names and merge duplicates
        const sectorMap = new Map<string, number>();
        
        response.data.sectors.forEach(sectorData => {
          // Normalize sector name using the mapping if it exists
          const normalizedSector = SECTOR_NAME_MAP[sectorData.sector] || sectorData.sector;
          
          // Add value to existing sector or create new entry
          const currentValue = sectorMap.get(normalizedSector) || 0;
          sectorMap.set(normalizedSector, currentValue + sectorData.value);
        });
        
        // Calculate percentages based on the merged values
        const totalValue = response.data.total_value;
        const normalizedSectors = Array.from(sectorMap.entries()).map(([sector, value]) => ({
          sector,
          value,
          percentage: (value / totalValue) * 100
        }));
        
        // Sort sectors by value in descending order
        const sortedSectors = normalizedSectors.sort((a, b) => b.value - a.value);
        
        setData(sortedSectors);
        setFilteredData(sortedSectors);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch sector allocation data');
        setLoading(false);
        console.error('Error fetching sector data:', err);
      }
    };

    fetchSectorData();
  }, []);

  useEffect(() => {
    let newFilteredData = [...data];
    
    if (!filters.bonds) {
      newFilteredData = newFilteredData.filter(item => item.sector.toLowerCase() !== 'bonds');
    }
    
    if (!filters.misc) {
      newFilteredData = newFilteredData.filter(item => item.sector.toLowerCase() !== 'misc');
    }
    
    if (!filters.preciousMetals) {
      newFilteredData = newFilteredData.filter(item => item.sector.toLowerCase() !== 'precious metals');
    }
    
    if (!filters.commodities) {
      newFilteredData = newFilteredData.filter(item => item.sector.toLowerCase() !== 'commodities');
    }
    
    setFilteredData(newFilteredData);
  }, [filters, data]);

  const handleFilterChange = (filterName: keyof FilterOptions) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: !prev[filterName]
    }));
  };

  const handleSectorClick = (data: any) => {
    if (data && data.sector) {
      setSelectedSector(selectedSector === data.sector ? null : data.sector);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
            <div className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-gray-100">{label}</p>
          <p className="text-gray-500 dark:text-gray-400">
            Value: ${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Percentage: {data.percentage.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full space-y-4">
      <div className="h-[800px] p-4 bg-white dark:bg-gray-900">
        <div className="flex flex-col mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Sector Allocation
          </h2>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.bonds}
                onChange={() => handleFilterChange('bonds')}
                className="form-checkbox h-4 w-4 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
              />
              <span>Show Bonds</span>
            </label>
            <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.misc}
                onChange={() => handleFilterChange('misc')}
                className="form-checkbox h-4 w-4 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
              />
              <span>Show Misc</span>
            </label>
            <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.preciousMetals}
                onChange={() => handleFilterChange('preciousMetals')}
                className="form-checkbox h-4 w-4 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
              />
              <span>Show Precious Metals</span>
            </label>
            <label className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.commodities}
                onChange={() => handleFilterChange('commodities')}
                className="form-checkbox h-4 w-4 text-blue-600 dark:text-blue-500 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
              />
              <span>Show Commodities</span>
            </label>
          </div>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={filteredData}
            margin={{
              top: 20,
              right: 30,
              left: 40,
              bottom: 90,
            }}
          >
            <CartesianGrid 
              //strokeDasharray="3 3" 
              stroke="#374151"  // dark:border-gray-700
              strokeOpacity={0.5} 
              vertical={false}
              horizontal={true}
            />
            <XAxis
              dataKey="sector"
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
              tick={{ 
                fontSize: 11,
                fill: '#9CA3AF'  // text-gray-400
              }}
              axisLine={{ stroke: '#374151', strokeWidth: 1 }}  // dark:border-gray-700
            />
            <YAxis
              tickFormatter={(value) => `${value.toFixed(1)}%`}
              tickCount={13} 
              //interval={0}
              tick={{ 
                fontSize: 11,
                fill: '#9CA3AF'  // text-gray-400
              }}
              axisLine={{ stroke: '#374151', strokeWidth: 1 }}  // dark:border-gray-700
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="percentage" 
              name="Percentage"
              radius={[4, 4, 0, 0]}
              onClick={handleSectorClick}
              style={{ cursor: 'pointer' }}
            >
              {filteredData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.sector === selectedSector ? 
                    COLORS[index % COLORS.length].replace('0.7', '1') : 
                    COLORS[index % COLORS.length]}
                  style={{ cursor: 'pointer' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {selectedSector && (
        <div className="p-4 bg-white dark:bg-gray-900 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Holdings in {selectedSector}
          </h3>
          <div className="h-[400px]">
            <SectorDrillDown sector={selectedSector} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SectorAllocationChart; 

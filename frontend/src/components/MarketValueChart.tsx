import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceDot
} from 'recharts';

interface MarketValueData {
  timestamp: string;
  close: number;
  shares: number;
  market_value: number;
  raw_timestamp: string;
}

interface MarketValueChartProps {
  symbol: string;
}

type TimeFrame = '6M' | '1Y' | '2Y' | 'ALL';

const MarketValueChart: React.FC<MarketValueChartProps> = ({ symbol }) => {
  const [data, setData] = useState<MarketValueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1Y');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`/api/positions/${symbol}/market-value-history`);
        const transformedData = response.data.map((item: any) => ({
          ...item,
          market_value: parseFloat(item.close) * item.shares,
          raw_timestamp: item.timestamp,
          timestamp: new Date(item.timestamp).toLocaleDateString()
        }));
        setData(transformedData);
        setError(null);
      } catch (err) {
        setError('Failed to load market value data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);

  const getFilteredData = () => {
    if (!data.length) return [];
    const now = new Date();
    let cutoffDate = new Date();
    switch (timeFrame) {
      case '6M':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case '1Y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case '2Y':
        cutoffDate.setFullYear(now.getFullYear() - 2);
        break;
      case 'ALL':
        return data;
    }
    return data.filter(item => new Date(item.raw_timestamp) >= cutoffDate);
  };

  const filteredData = getFilteredData();

  // Find min/max points for markers
  const minPoint = useMemo(() => {
    if (!filteredData.length) return null;
    let minIdx = 0;
    let minVal = filteredData[0].market_value;
    filteredData.forEach((d, i) => {
      if (d.market_value < minVal) {
        minVal = d.market_value;
        minIdx = i;
      }
    });
    return filteredData[minIdx];
  }, [filteredData]);

  const maxPoint = useMemo(() => {
    if (!filteredData.length) return null;
    let maxIdx = 0;
    let maxVal = filteredData[0].market_value;
    filteredData.forEach((d, i) => {
      if (d.market_value > maxVal) {
        maxVal = d.market_value;
        maxIdx = i;
      }
    });
    return filteredData[maxIdx];
  }, [filteredData]);

  // Improved Y-axis domain logic with rounding
  const yAxisDomain = useMemo(() => {
    if (!filteredData.length) return [0, 0];
    const values = filteredData.map(d => d.market_value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      // Flat line, add some padding and round
      const pad = min < 100 ? 5 : 10;
      return [
        Math.max(0, Math.floor(min * 0.95 / pad) * pad),
        Math.ceil(max * 1.05 / pad) * pad
      ];
    }
    // Start Y-axis at 95% of min, but never below zero, and round
    const pad = min < 100 ? 5 : 10;
    const yMin = Math.max(0, Math.floor((min * 0.95) / pad) * pad);
    const yMax = Math.ceil((max * 1.05) / pad) * pad;
    return [yMin, yMax];
  }, [filteredData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 text-red-500 rounded-lg h-[400px] flex items-center justify-center">
        {error}
      </div>
    );
  }

  return (
    <div className="h-[400px] bg-gray-900/50 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">Position Market Value History</h2>
        <div className="flex space-x-2">
          {(['6M', '1Y', '2Y', 'ALL'] as TimeFrame[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeFrame(tf)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                timeFrame === tf
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={filteredData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <defs>
            <linearGradient id="colorMarketValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#60A5FA" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="timestamp" 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
          />
          <YAxis 
            stroke="#9CA3AF"
            tick={{ fill: '#9CA3AF' }}
            tickFormatter={(value) => `$${Math.round(value).toLocaleString()}`}
            domain={yAxisDomain}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: 'none',
              borderRadius: '0.375rem',
              color: '#E5E7EB'
            }}
            formatter={(value: number) => [`$${Math.round(value).toLocaleString()}`, 'Market Value']}
          />
          {/* Min/Max markers */}
          {minPoint && (
            <ReferenceDot
              x={minPoint.timestamp}
              y={minPoint.market_value}
              r={5}
              fill="#F87171"
              stroke="#fff"
              strokeWidth={1}
              label={{
                value: `Min $${Math.round(minPoint.market_value)}`,
                position: 'left',
                fill: '#F87171',
                fontSize: 12,
                offset: 10
              }}
            />
          )}
          {maxPoint && (
            <ReferenceDot
              x={maxPoint.timestamp}
              y={maxPoint.market_value}
              r={5}
              fill="#34D399"
              stroke="#fff"
              strokeWidth={1}
              label={{
                value: `Max $${Math.round(maxPoint.market_value)}`,
                position: 'right',
                fill: '#34D399',
                fontSize: 12,
                offset: 10
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="market_value"
            stroke="#60A5FA"
            fillOpacity={1}
            fill="url(#colorMarketValue)"
            name="Market Value"
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="market_value"
            stroke="#60A5FA"
            strokeWidth={2}
            dot={false}
            name="Market Value"
            animationDuration={300}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MarketValueChart;

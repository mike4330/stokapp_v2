import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import axios from 'axios';
import { format, parseISO } from 'date-fns';

interface ReturnsDataPoint {
  date: string;
  return: number;
  WMA24: number;
  YMA1: number;
  YMA2: number;
  YMA3: number;
  YMA4: number;
}

// Define all available series for the chart
interface SeriesConfig {
  dataKey: string;
  name: string;
  color: string;
  strokeWidth: number;
  visible: boolean;
}

const ReturnsChart: React.FC = () => {
  const [returnsData, setReturnsData] = useState<ReturnsDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Define and manage series visibility state
  const [series, setSeries] = useState<SeriesConfig[]>([
    { dataKey: "return", name: "Return", color: "#a1a1aa", strokeWidth: 2, visible: true },
    { dataKey: "WMA24", name: "24-Month MA", color: "#2563eb", strokeWidth: 2, visible: true },
    { dataKey: "YMA1", name: "1-Year MA", color: "#dc2626", strokeWidth: 2, visible: true },
    { dataKey: "YMA2", name: "2-Year MA", color: "#16a34a", strokeWidth: 2, visible: true },
    { dataKey: "YMA3", name: "3-Year MA", color: "#ca8a04", strokeWidth: 2, visible: true },
    { dataKey: "YMA4", name: "4-Year MA", color: "#0891b2", strokeWidth: 2, visible: true }
  ]);

  useEffect(() => {
    const fetchReturnsData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('Fetching returns data');
        const response = await axios.get('/api/portfolio/returns');
        
        console.log('Returns API response:', response.data);
        console.log('Response data length:', response.data.length);
        
        // Check if data is empty
        if (!response.data || response.data.length === 0) {
          console.error('Received empty data from API');
          setError('No historical returns data available.');
          setIsLoading(false);
          return;
        }
        
        // Log first data point
        if (response.data.length > 0) {
          console.log('First data point:', response.data[0]);
        }
        
        // Format the data for the chart
        const formattedData = response.data.map((item: any) => ({
          date: item.date,
          // Ensure numbers with fallbacks
          return: item.return !== null ? parseFloat(item.return) : 0,
          WMA24: item.WMA24 !== null ? parseFloat(item.WMA24) : undefined,
          YMA1: item.YMA1 !== null ? parseFloat(item.YMA1) : undefined,
          YMA2: item.YMA2 !== null ? parseFloat(item.YMA2) : undefined,
          YMA3: item.YMA3 !== null ? parseFloat(item.YMA3) : undefined,
          YMA4: item.YMA4 !== null ? parseFloat(item.YMA4) : undefined,
        }));
        
        console.log('Formatted returns data length:', formattedData.length);
        
        setReturnsData(formattedData);
      } catch (err) {
        console.error("Failed to fetch returns data", err);
        setError("Failed to load returns data. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReturnsData();
  }, []);
  
  // Format date for tooltip and x-axis
  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'MMM dd, yyyy');
    } catch (e) {
      return dateStr;
    }
  };
  
  // Calculate a good Y-axis domain after the data is loaded
  const calculateYDomain = (data: ReturnsDataPoint[]): [number, number] => {
    if (!data || data.length === 0) return [0, 0];
    
    // Find min and max values - include only numeric values and only for visible series
    const visibleSeriesKeys = series.filter(s => s.visible).map(s => s.dataKey);
    
    const allValues = data.flatMap(d => 
      Object.entries(d)
        .filter(([key]) => visibleSeriesKeys.includes(key) && key !== 'date')
        .map(([_, value]) => value as number)
        .filter(v => v !== undefined && !isNaN(v))
    );
    
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    
    // Calculate the data range
    const range = max - min;
    
    // Set the bottom of the domain to something less than min to exaggerate changes
    const bottomDomain = Math.max(0, min - (range * 0.15));
    
    // Give a little room at the top too
    const topDomain = max + (range * 0.05);
    
    return [bottomDomain, topDomain];
  };
  
  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 shadow-md rounded-md">
          <p className="font-semibold">{formatDate(label)}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} style={{ color: item.color }}>
              <span className="font-medium">{item.name}:</span> {item.value?.toFixed(2)}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Handle toggling series visibility
  const handleSeriesClick = (dataKey: string) => {
    setSeries(prevSeries => 
      prevSeries.map(s => 
        s.dataKey === dataKey ? { ...s, visible: !s.visible } : s
      )
    );
  };

  // Custom legend that supports toggling
  const CustomLegend = () => (
    <div className="flex flex-wrap justify-center gap-4 pt-1 pb-2">
      {series.map((s, index) => (
        <div 
          key={index}
          className={`flex items-center cursor-pointer px-2 py-1 rounded transition-opacity ${s.visible ? '' : 'opacity-40'}`}
          onClick={() => handleSeriesClick(s.dataKey)}
        >
          <div 
            className="w-6 h-1 mr-2" 
            style={{ backgroundColor: s.color }}
          />
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{s.name}</span>
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Loading returns data...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center h-64 flex items-center justify-center">{error}</div>;
  }

  const yDomain = calculateYDomain(returnsData);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-3 h-full flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Returns</h2>
      </div>
      
      <CustomLegend />
      
      <div className="flex-grow h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={returnsData}
            margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" strokeOpacity={0.5} vertical={false} />
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => {
                try {
                  const date = parseISO(value);
                  return format(date, 'MM/dd/yy');
                } catch (e) {
                  return value;
                }
              }}
              tick={{ fontSize: 11 }}
              padding={{ left: 5, right: 5 }}
              minTickGap={30}
              stroke="#888"
              axisLine={{ stroke: '#444', strokeWidth: 0.5 }}
              tickLine={{ stroke: '#444', strokeWidth: 0.5 }}
            />
            <YAxis 
              tickFormatter={value => `${value.toFixed(1)}%`}
              tick={{ fontSize: 11 }}
              domain={yDomain}
              stroke="#888"
              width={45}
              axisLine={{ stroke: '#444', strokeWidth: 0.5 }}
              tickLine={{ stroke: '#444', strokeWidth: 0.5 }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Render only visible series */}
            {series.filter(s => s.visible).map((s, index) => (
              <Line 
                key={index}
                type="monotone" 
                dataKey={s.dataKey} 
                name={s.name} 
                stroke={s.color} 
                dot={false}
                strokeWidth={s.strokeWidth}
                activeDot={{ r: 6 }} 
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ReturnsChart; 
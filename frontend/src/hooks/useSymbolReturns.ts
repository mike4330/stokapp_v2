import { useState, useEffect } from 'react';
import axios from 'axios';

interface ReturnData {
  date: string;
  return_percent: number;
}

export function useSymbolReturns(symbol: string | undefined) {
  const [data, setData] = useState<ReturnData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!symbol) return;
      
      try {
        setIsLoading(true);
        const response = await axios.get(`/api/positions/${symbol}/returns`);
        
        // Transform the data to match our interface
        const transformedData = response.data.map((item: any) => ({
          date: item.date,
          return_percent: item.return_percent,
        }));
        
        setData(transformedData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching return data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [symbol]);

  return { data, isLoading, error };
} 
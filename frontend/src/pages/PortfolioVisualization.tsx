import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
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
  const [data, setData] = useState<SunburstResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get<SunburstResponse>('/api/portfolio/sunburst');
        setData(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to fetch portfolio data');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // Get unique sectors and industries
  const sectors = Array.from(new Set(data.data.map(item => item.sector)));
  const industries = Array.from(new Set(data.data.map(item => item.industry)));

  // Create arrays for Plotly
  const labels: string[] = [];
  const parents: string[] = [];
  const values: number[] = [];

  // Add root
  labels.push('Portfolio');
  parents.push('');
  values.push(0); // Let Plotly calculate the total

  // Add sectors
  sectors.forEach(sector => {
    labels.push(sector);
    parents.push('Portfolio');
    values.push(0); // Let Plotly calculate sector totals
  });

  // Add industries
  industries.forEach(industry => {
    labels.push(industry);
    // Find the sector for this industry
    const sector = data.data.find(item => item.industry === industry)?.sector || 'Unknown';
    parents.push(sector);
    values.push(0); // Let Plotly calculate industry totals
  });

  // Add symbols with their actual values
  data.data.forEach(item => {
    labels.push(item.symbol);
    parents.push(item.industry);
    values.push(item.value);
  });

  const plotData = [{
    type: 'sunburst' as const,
    labels,
    parents,
    values,
    branchvalues: 'remainder' as const,
    hovertemplate: '%{label}<br>Value: $%{value:,.2f}<br>%{percentParent:.1%} of parent<br>%{percentRoot:.1%} of total',
    maxdepth: 3
  }];

  const layout = {
    title: 'Portfolio Allocation Sunburst',
    width: 1000,
    height: 1000,
    sunburstcolorway: [
      '#636efa', '#EF553B', '#00cc96', '#ab63fa', '#FFA15A',
      '#19d3f3', '#FF6692', '#B6E880', '#FF97FF', '#FECB52'
    ],
  };

  return (
    <div className="flex flex-col items-center p-4">
      <h1 className="text-2xl font-bold mb-4">Portfolio Visualization</h1>
      <div className="bg-white rounded-lg shadow-lg p-4">
        <Plot
          data={plotData}
          layout={layout}
          config={{ responsive: true }}
        />
      </div>
      <div className="mt-4 text-gray-600">
        Total Portfolio Value: ${data.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
};

export default PortfolioVisualization; 
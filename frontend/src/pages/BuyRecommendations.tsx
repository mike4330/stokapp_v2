/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useEffect, useState } from 'react';

interface Recommendation {
  symbol: string;
  sectorshort: string;
  z_score: number;
  overamt: number;
}

const BuyRecommendations: React.FC = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/model-recommendations');
      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      const data = await response.json();
      setRecommendations(data);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  return (
    <div className="py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
          Buy Recommendations
        </h1>
        <button
          onClick={fetchRecommendations}
          className="px-4 py-2 bg-green-800 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors duration-200 flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Refresh Data
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="bg-blue-800 py-3 px-6">
          <h2 className="text-lg font-semibold text-white">Buy Recommendations</h2>
        </div>
        {loading ? (
          <div className="p-6 text-gray-500 dark:text-gray-400">Loading recommendations...</div>
        ) : error ? (
          <div className="p-6 text-red-500">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sector</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Z-Score</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Overamt</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {recommendations.map((rec) => (
                  <tr key={rec.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-3 font-mono text-sm text-gray-900 dark:text-gray-100">{rec.symbol}</td>
                    <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-300">{rec.sectorshort}</td>
                    <td className="px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{rec.z_score.toFixed(6)}</td>
                    <td className="px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{rec.overamt.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyRecommendations; 
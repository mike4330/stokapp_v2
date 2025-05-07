/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getDividendStyle } from '../utils/colorUtils';

interface DividendPrediction {
  symbol: string;
  is_monthly: boolean;
  last_three: {
    date: string;
    symbol: string;
    cost: number;
  }[];
}

interface DividendSummary {
  total_monthly: number;
  total_quarterly: number;
  total_yearly: number;
  total_yearly_formatted: string;
}

interface PredictionsResponse {
  predictions: Record<string, DividendPrediction>;
  summary: DividendSummary;
}

const DividendPredictions: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [predictions, setPredictions] = useState<Record<string, DividendPrediction>>({});
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Define the max amount for color scaling - can be adjusted based on data
  const [maxColorAmount, setMaxColorAmount] = useState<number>(100);

  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        setLoading(true);
        const response = await axios.get<PredictionsResponse>('/api/dividends/predictions');
        setPredictions(response.data.predictions);
        setSummary(response.data.summary);
        
        // Calculate a reasonable max value for color scaling (95th percentile of all values)
        const allCosts = Object.values(response.data.predictions)
          .flatMap(pred => pred.last_three.map(entry => entry.cost))
          .filter(cost => cost > 0); // Filter out zeros
          
        if (allCosts.length > 0) {
          allCosts.sort((a, b) => a - b);
          const p95Index = Math.floor(allCosts.length * 0.95);
          const p95Value = allCosts[p95Index];
          // Round up to nearest 5 for cleaner scale
          setMaxColorAmount(Math.ceil(p95Value / 5) * 5);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching dividend predictions:', err);
        setError('Failed to load dividend predictions. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
  }, []);

  // Filter predictions and remove any empty ones
  const validPredictions = Object.entries(predictions).filter(
    ([_, pred]) => pred.last_three && pred.last_three.length > 0
  );
  
  // Group predictions by payment frequency
  const monthlyPredictions = validPredictions.filter(([_, pred]) => pred.is_monthly);
  const quarterlyPredictions = validPredictions.filter(([_, pred]) => !pred.is_monthly);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-200 px-4 py-3 rounded relative" role="alert">
        <span className="block sm:inline">{error}</span>
      </div>
    );
  }

  // Check if we have any predictions at all
  if (validPredictions.length === 0) {
    return (
      <>
        <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Dividend Predictions</h1>
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-400 text-yellow-700 dark:text-yellow-200 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">No valid dividend predictions available. This could be due to the prediction date limit (Nov 1, 2038).</span>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">Dividend Predictions</h1>
      
      {/* Summary Section */}
      {summary && (
        <div className="mb-8 bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">Retirement Income Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Monthly Income</p>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">${summary.total_monthly.toFixed(2)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Quarterly Income</p>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">${summary.total_quarterly.toFixed(2)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900 p-4 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">Yearly Income</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">${summary.total_yearly_formatted}</p>
            </div>
          </div>
          
          {/* Color Legend */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Dividend Amount Color Scale</h3>
            <div className="flex h-6 rounded-md overflow-hidden w-full">
              {Array.from({ length: 10 }).map((_, i) => {
                const value = (i + 1) * (maxColorAmount / 10);
                return (
                  <div 
                    key={i} 
                    className="flex-1" 
                    style={getDividendStyle(value)}
                  >
                    {i === 0 && <span className="text-xs px-1">${1}</span>}
                    {i === 9 && (
                      <span className="text-xs px-1 float-right">${maxColorAmount}+</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Monthly Dividends */}
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">Monthly Dividends</h2>
          {monthlyPredictions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No monthly dividend predictions available.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {monthlyPredictions.map(([symbol, prediction]) => (
                <div key={symbol} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2">
                    <h3 className="font-medium text-gray-800 dark:text-gray-200">{symbol}</h3>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {prediction.last_three.map((entry, index) => (
                      <div 
                        key={index} 
                        className="flex justify-between items-center p-1.5"
                      >
                        <span className="text-xs text-gray-600 dark:text-gray-400 mr-1">{entry.date}</span>
                        <span 
                          className="text-xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={getDividendStyle(entry.cost)}
                        >
                          ${entry.cost.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Quarterly Dividends */}
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-700 dark:text-gray-300">Quarterly Dividends</h2>
          {quarterlyPredictions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No quarterly dividend predictions available.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {quarterlyPredictions.map(([symbol, prediction]) => (
                <div key={symbol} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2">
                    <h3 className="font-medium text-gray-800 dark:text-gray-200">{symbol}</h3>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {prediction.last_three.map((entry, index) => (
                      <div 
                        key={index} 
                        className="flex justify-between items-center p-1.5"
                      >
                        <span className="text-xs text-gray-600 dark:text-gray-400 mr-1">{entry.date}</span>
                        <span 
                          className="text-xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={getDividendStyle(entry.cost)}
                        >
                          ${entry.cost.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DividendPredictions; 
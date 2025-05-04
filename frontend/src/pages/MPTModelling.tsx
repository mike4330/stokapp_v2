import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface OptimizationConstraints {
  gamma: number;
  target_return: number;
  lower_bound: number;
  upper_bound: number;
  refresh_data: boolean;
  sector_lower: { [key: string]: number };
  sector_upper: { [key: string]: number };
}

interface SectorConstraint {
  min: number;
  max: number;
}

interface SectorConstraints {
  [key: string]: SectorConstraint;
}

interface OptimizationDebugInfo {
  config_files: {
    status: string;
    message?: string;
    error?: string;
    tickers_count: number;
    sectors_count: number;
  };
  optimization: {
    status: string;
    solver_status?: string;
    message?: string;
    data_shape?: string;
    constraints: {
      gamma: number;
      target_return: number;
      lower_bound: number;
      upper_bound: number;
      refresh_data: boolean;
      sector_constraints?: {
        [key: string]: {
          min: number;
          max: number;
        };
      };
    };
  };
}

interface ModelingResult {
  weights: { [key: string]: number };
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  sector_weights: { [key: string]: number };
  debug_info: OptimizationDebugInfo;
}

interface SaveToRepoResponse {
  success: boolean;
  run_id?: string;
  error?: string;
}

const DEFAULT_SECTOR_CONSTRAINTS: SectorConstraints = {
  'DBonds': { min: 0.225875, max: 0.235875 },
  'FBonds': { min: 0.099125, max: 0.109125 },
  'Commodities': { min: 0.025, max: 0.063 },
  'Misc': { min: 0.0125, max: 0.0125 },
  'Communication Services': { min: 0.0531, max: 0.063 },
  'Consumer Discretionary': { min: 0.0534, max: 0.063 },
  'Consumer Staples': { min: 0.0534, max: 0.063 },
  'Energy': { min: 0.0438, max: 0.063 },
  'Financials': { min: 0.0534, max: 0.063 },
  'Healthcare': { min: 0.0534, max: 0.08 },
  'Industrials': { min: 0.0534, max: 0.063 },
  'Materials': { min: 0.0534, max: 0.063 },
  'Tech': { min: 0.0674, max: 0.20 },
  'Real Estate': { min: 0.0534, max: 0.063 },
  'Precious Metals': { min: 0.05, max: 0.05 },
  'Utilities': { min: 0.0494, max: 0.063 },
};

const MPTModelling: React.FC = () => {
  const [gamma, setGamma] = useState('1.98');
  const [targetReturn, setTargetReturn] = useState('0.07');
  const [targetRisk, setTargetRisk] = useState('0.1286');
  const [lowerBound, setLowerBound] = useState('0.00131');
  const [upperBound, setUpperBound] = useState('0.0482');
  const [objective, setObjective] = useState('max_sharpe');
  const [useSectorConstraints, setUseSectorConstraints] = useState(false);
  const [modelingResult, setModelingResult] = useState<ModelingResult | null>(null);
  const [modelingLoading, setModelingLoading] = useState(false);
  const [modelingError, setModelingError] = useState<string | null>(null);
  const [refreshData, setRefreshData] = useState(false);
  const [dataStatus, setDataStatus] = useState<string>('Data file status unknown');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sectorConstraints, setSectorConstraints] = useState<SectorConstraints>(DEFAULT_SECTOR_CONSTRAINTS);
  const [savingToRepo, setSavingToRepo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const [isSectorConstraintsExpanded, setIsSectorConstraintsExpanded] = useState(true);

  // Check data file status on component mount
  useEffect(() => {
    const checkDataFileStatus = async () => {
      try {
        setDataStatus('Checking data file status...');
        // Placeholder for future API call
        // const response = await fetch('/api/check-data-file');
        // if (!response.ok) throw new Error('Failed to check data file status');
        // const data = await response.json();
        // setDataStatus(data.available ? 'Data file available: pricedataset.csv' : 'Data file not found');
        // For now, simulate a check
        setTimeout(() => {
          setDataStatus('Data file available: pricedataset.csv');
        }, 1000);
      } catch (err) {
        setDataStatus('Error checking data file status');
      }
    };
    checkDataFileStatus();
  }, []);

  // Effect to update data status when refresh toggle changes
  useEffect(() => {
    if (refreshData) {
      setDataStatus('Data will be refreshed from Yahoo Finance when running the model');
      setIsRefreshing(true);
    } else {
      setDataStatus('Using existing data from pricedataset.csv');
      setIsRefreshing(false);
    }
  }, [refreshData]);

  const handleSectorConstraintChange = (sector: string, type: 'min' | 'max', value: string) => {
    setSectorConstraints(prev => ({
      ...prev,
      [sector]: {
        ...prev[sector],
        [type]: parseFloat(value)
      }
    }));
  };

  const handleRunModeling = async () => {
    try {
      setModelingLoading(true);
      setModelingError(null);
      setModelingResult(null);

      // Build request body conditionally
      const requestBody: any = {
        gamma: objective === 'max_sharpe' ? null : parseFloat(gamma),
        targetRisk: parseFloat(targetRisk),
        lowerBound: parseFloat(lowerBound),
        upperBound: parseFloat(upperBound),
        objective: objective,
        refreshData: refreshData,
        useSectorConstraints: useSectorConstraints,
        sectorConstraints: useSectorConstraints ? sectorConstraints : null
      };
      if (objective !== 'efficient_risk') {
        requestBody.targetReturn = parseFloat(targetReturn);
      }

      const response = await fetch('/api/run-mpt-modeling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate MPT modeling task');
      }

      const data = await response.json();
      setTaskId(data.task_id);
      // Start polling for status
      pollTaskStatus(data.task_id);
    } catch (err: any) {
      setModelingError(err.message || 'Unknown error');
      setModelingLoading(false);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/task-status/${taskId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to check task status');
        }

        const statusData = await response.json();
        if (statusData.status === 'completed') {
          setModelingResult(statusData.result);
          setModelingLoading(false);
          clearInterval(interval);
          if (refreshData) {
            setDataStatus('Data refreshed from pricedataset.csv');
          } else {
            setDataStatus('Data file used: pricedataset.csv (not refreshed)');
          }
        } else if (statusData.status === 'failed') {
          setModelingError(statusData.error || 'Task failed');
          setModelingLoading(false);
          clearInterval(interval);
        } else if (statusData.status === 'not_found') {
          setModelingError('Task not found');
          setModelingLoading(false);
          clearInterval(interval);
        }
        // If still running, continue polling
      } catch (err: any) {
        setModelingError(err.message || 'Error checking task status');
        setModelingLoading(false);
        clearInterval(interval);
      }
    }, 2000); // Poll every 2 seconds
  };

  const handleSaveToRepository = async () => {
    if (!taskId || !modelingResult) return;

    try {
      setSavingToRepo(true);
      setSaveError(null);

      const response = await fetch(`/api/save-to-repository/${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})  // Empty object since we removed name and description
      });

      const data: SaveToRepoResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save to repository');
      }
      
      // Show success message
      alert('Successfully saved to repository!');
      
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save to repository');
    } finally {
      setSavingToRepo(false);
    }
  };

  // Prepare data for the weights chart
  const prepareWeightsChartData = (weights: { [key: string]: number }) => {
    return Object.entries(weights)
      .sort(([, a], [, b]) => b - a) // Sort by weight descending
      .map(([ticker, weight]) => ({
        ticker,
        weight: +(weight * 100).toFixed(4)  // Convert to percentage and fix precision
      }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          MPT Modelling
        </h1>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="bg-green-800 py-3 px-6">
          <h2 className="text-lg font-semibold text-white">On-Demand MPT Modeling</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
            {/* Row 1 */}
            <div>
              <label htmlFor="objective" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Optimization Objective
              </label>
              <select
                id="objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="max_sharpe">Maximize Sharpe Ratio</option>
                <option value="min_volatility">Minimize Volatility</option>
                <option value="efficient_risk">Efficient Risk (Target Risk)</option>
                <option value="efficient_return">Efficient Return (Target Return)</option>
              </select>
            </div>

            <div>
              <label htmlFor="gamma" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Gamma (L2 Regularization)
              </label>
              <input
                type="number"
                id="gamma"
                step="0.1"
                value={gamma}
                onChange={(e) => setGamma(e.target.value)}
                disabled={objective === 'max_sharpe'}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white ${objective === 'max_sharpe' ? 'opacity-50' : ''}`}
              />
            </div>

            <div>
              <label htmlFor="targetReturn" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Return (Annual)
              </label>
              <input
                type="number"
                id="targetReturn"
                step="0.01"
                value={targetReturn}
                onChange={(e) => setTargetReturn(e.target.value)}
                disabled={objective !== 'efficient_return'}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white ${objective !== 'efficient_return' ? 'opacity-50' : ''}`}
              />
            </div>

            {/* Row 2 */}
            <div>
              <label htmlFor="lowerBound" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Lower Weight Bound
              </label>
              <input
                type="number"
                id="lowerBound"
                step="0.00001"
                value={lowerBound}
                onChange={(e) => setLowerBound(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="upperBound" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Upper Weight Bound
              </label>
              <input
                type="number"
                id="upperBound"
                step="0.00001"
                value={upperBound}
                onChange={(e) => setUpperBound(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="targetRisk" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Risk (Annual Volatility)
              </label>
              <input
                type="number"
                id="targetRisk"
                step="0.01"
                value={targetRisk}
                onChange={(e) => setTargetRisk(e.target.value)}
                disabled={objective !== 'efficient_risk'}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white ${objective !== 'efficient_risk' ? 'opacity-50' : ''}`}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={refreshData}
                onChange={(e) => setRefreshData(e.target.checked)}
                className="form-checkbox h-5 w-5 text-green-600"
              />
              <span className="text-gray-700 dark:text-gray-300">Refresh Data from Yahoo Finance</span>
            </label>
            <div className="mt-2 flex items-center">
              {isRefreshing && (
                <div className="animate-pulse mr-2 h-2 w-2 rounded-full bg-green-500"></div>
              )}
              <span className={`text-sm ${isRefreshing ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {dataStatus}
              </span>
            </div>
          </div>
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={useSectorConstraints}
                onChange={(e) => setUseSectorConstraints(e.target.checked)}
                className="mr-2"
              />
              <span className="text-gray-700 dark:text-gray-300">Use Sector Constraints</span>
            </label>
          </div>
          {useSectorConstraints && (
            <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
              <button
                onClick={() => setIsSectorConstraintsExpanded(!isSectorConstraintsExpanded)}
                className="w-full bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors duration-200"
              >
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Sector Constraints</h4>
                <svg
                  className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${isSectorConstraintsExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div
                className={`transition-all duration-300 ease-in-out ${
                  isSectorConstraintsExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(sectorConstraints).map(([sector, { min, max }]) => (
                      <div key={sector} className="p-2 bg-white dark:bg-gray-600 rounded border border-gray-300 dark:border-gray-700">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{sector}</div>
                        <div className="flex justify-between items-center mt-1">
                          <label className="text-sm text-gray-700 dark:text-gray-300">
                            Min:
                            <input
                              type="number"
                              step="0.0001"
                              value={min}
                              onChange={(e) => handleSectorConstraintChange(sector, 'min', e.target.value)}
                              className="w-20 ml-1 px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                            />
                          </label>
                          <label className="text-sm text-gray-700 dark:text-gray-300">
                            Max:
                            <input
                              type="number"
                              step="0.0001"
                              value={max}
                              onChange={(e) => handleSectorConstraintChange(sector, 'max', e.target.value)}
                              className="w-20 ml-1 px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-white"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={handleRunModeling}
            disabled={modelingLoading}
            className="px-4 py-2 bg-green-800 hover:bg-green-700 text-white rounded-md shadow-sm transition-colors duration-200 flex items-center"
          >
            {modelingLoading ? (
              <span>Running...</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                </svg>
                Run MPT Modeling
              </>
            )}
          </button>

          {modelingError && (
            <div className="mt-4 text-red-500">{modelingError}</div>
          )}

          {modelingResult && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Modeling Results</h3>
              
              {/* Performance Metrics */}
              <div className="mb-3">
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Performance Metrics:</h5>
                <div className="pl-4 grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Optimization Method</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {(() => {
                        switch(objective) {
                          case 'max_sharpe':
                            return 'Maximum Sharpe';
                          case 'min_volatility':
                            return 'Minimum Volatility';
                          case 'efficient_risk':
                            return 'Efficient Risk';
                          case 'efficient_return':
                            return 'Efficient Return';
                          default:
                            return objective;
                        }
                      })()}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Expected Return</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {(modelingResult.expected_return * 100).toFixed(4)}%
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Volatility</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {(modelingResult.volatility * 100).toFixed(4)}%
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Sharpe Ratio</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {modelingResult.sharpe_ratio.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Debug Information Section */}
              {modelingResult.debug_info && (
                <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                  <button
                    onClick={() => setIsDebugExpanded(!isDebugExpanded)}
                    className="w-full bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors duration-200"
                  >
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Debug Information</h4>
                    <svg
                      className={`w-5 h-5 text-gray-500 transform transition-transform duration-200 ${isDebugExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div
                    className={`transition-all duration-300 ease-in-out ${
                      isDebugExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="p-4 space-y-4">
                      {/* Config Files Section */}
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Configuration Files:</h5>
                        <div className="pl-4 space-y-1">
                          <div className="flex items-center">
                            <div className={`w-2 h-2 rounded-full mr-2 ${
                              modelingResult.debug_info.config_files.status === 'success' 
                                ? 'bg-green-500' 
                                : modelingResult.debug_info.config_files.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-yellow-500'
                            }`} />
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              Status: {modelingResult.debug_info.config_files.status}
                            </span>
                          </div>
                          {modelingResult.debug_info.config_files.message && (
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {modelingResult.debug_info.config_files.message}
                            </div>
                          )}
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Tickers loaded: {modelingResult.debug_info.config_files.tickers_count}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Sector mappings: {modelingResult.debug_info.config_files.sectors_count}
                          </div>
                        </div>
                      </div>

                      {/* Optimization Section */}
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Optimization Process:</h5>
                        <div className="pl-4 space-y-1">
                          <div className="flex items-center">
                            <div className={`w-2 h-2 rounded-full mr-2 ${
                              modelingResult.debug_info.optimization.status === 'success' 
                                ? 'bg-green-500' 
                                : modelingResult.debug_info.optimization.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-yellow-500'
                            }`} />
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              Status: {modelingResult.debug_info.optimization.status}
                            </span>
                          </div>
                          {modelingResult.debug_info.optimization.solver_status && (
                            <div className={`text-sm ${
                              modelingResult.debug_info.optimization.solver_status === 'optimal'
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-500'
                            }`}>
                              Solver status: {modelingResult.debug_info.optimization.solver_status}
                            </div>
                          )}
                          {modelingResult.debug_info.optimization.message && (
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {modelingResult.debug_info.optimization.message}
                            </div>
                          )}
                          {modelingResult.debug_info.optimization.data_shape && (
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {modelingResult.debug_info.optimization.data_shape}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Applied Parameters Section */}
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Applied Parameters:</h5>
                        <div className="pl-4 space-y-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Gamma: {modelingResult.debug_info.optimization.constraints.gamma}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Target Return: {modelingResult.debug_info.optimization.constraints.target_return}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Weight Bounds: [{modelingResult.debug_info.optimization.constraints.lower_bound}, {modelingResult.debug_info.optimization.constraints.upper_bound}]
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Refresh Data: {modelingResult.debug_info.optimization.constraints.refresh_data ? 'Yes' : 'No'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Optimized Weights */}
              <div className="mb-3">
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Optimized Portfolio Weights:</h5>
                
                {/* Add the bar chart */}
                <div className="mb-4 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={prepareWeightsChartData(modelingResult.weights)}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <XAxis
                        dataKey="ticker"
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        interval={0}
                        tick={{ fill: 'currentColor', fontSize: 12 }}
                      />
                      <YAxis
                        tickFormatter={(value) => `${value}%`}
                        tick={{ fill: 'currentColor', fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value.toFixed(4)}%`, 'Weight']}
                        contentStyle={{
                          backgroundColor: 'rgb(31, 41, 55)',
                          border: 'none',
                          borderRadius: '0.375rem',
                          color: 'white'
                        }}
                      />
                      <Bar
                        dataKey="weight"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Existing weights grid */}
                <div className="pl-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(modelingResult.weights)
                      .sort(([, a], [, b]) => b - a)
                      .map(([ticker, weight]) => (
                        <div key={ticker} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ticker}</span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">{(weight * 100).toFixed(4)}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Sector Weights - Only show if sector constraints were used */}
              {useSectorConstraints && modelingResult.sector_weights && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sector Allocations:</h5>
                  <div className="pl-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(modelingResult.sector_weights)
                        .sort(([, a], [, b]) => b - a) // Sort by weight descending
                        .map(([sector, weight]) => (
                          <div key={sector} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{sector}</span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{(weight * 100).toFixed(4)}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Add Repository Save Section at the end */}
              <div className="mt-6 flex items-center justify-end space-x-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                {saveError && (
                  <span className="text-sm text-red-500">{saveError}</span>
                )}
                <button
                  onClick={handleSaveToRepository}
                  disabled={savingToRepo}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm transition-colors duration-200 flex items-center disabled:opacity-50"
                >
                  {savingToRepo ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                      </svg>
                      Save to Repository
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MPTModelling; 
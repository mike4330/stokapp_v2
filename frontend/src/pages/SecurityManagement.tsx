/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Security {
  symbol: string;
  asset_class: string;
  sector: string;
  industry: string;
  price: number;
  dividend_frequency?: 'monthly' | 'quarterly' | null;
}

interface TaskStatus {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  security: Partial<Security>;
  steps: {
    name: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
  }[];
  current_step: number;
  message: string;
  created_at: string;
  completed_at: string | null;
}

const SecurityManagement: React.FC = () => {
  const [securities, setSecurities] = useState<Security[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [currentTask, setCurrentTask] = useState<TaskStatus | null>(null);
  const [newSecurity, setNewSecurity] = useState<Partial<Security>>({
    symbol: '',
    asset_class: '',
    sector: '',
    industry: '',
    price: 0,
    dividend_frequency: null
  });

  useEffect(() => {
    fetchSecurities();
    fetchAssetClasses();
  }, []);

  // Poll for task status if we have an active task
  useEffect(() => {
    if (currentTask && currentTask.status === 'pending' && showProgressModal) {
      const interval = setInterval(() => {
        pollTaskStatus(currentTask.id);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [currentTask, showProgressModal]);

  const fetchSecurities = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/securities');
      setSecurities(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch securities');
      console.error('Error fetching securities:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetClasses = async () => {
    try {
      const response = await axios.get('/api/asset-classes');
      setAssetClasses(response.data);
    } catch (err) {
      console.error('Error fetching asset classes:', err);
      // Fallback to default values if API call fails
      setAssetClasses(['Equity', 'Fixed Income', 'Commodity', 'Currency']);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    try {
      const response = await axios.get(`/api/securities/tasks/${taskId}`);
      setCurrentTask(response.data);
      
      // If task completed or failed, refresh securities list
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        fetchSecurities();
      }
    } catch (err) {
      console.error('Error polling task status:', err);
    }
  };

  const handleAddSecurityConfirm = () => {
    // Validate required fields before showing confirmation
    if (!newSecurity.symbol || !newSecurity.asset_class || !newSecurity.sector) {
      setError('Symbol, Asset Class, and Sector are required fields');
      return;
    }
    setShowAddModal(false);
    setShowConfirmationModal(true);
  };

  const handleAddSecurity = async () => {
    try {
      setShowConfirmationModal(false);
      setShowProgressModal(true);
      
      const response = await axios.post('/api/securities', newSecurity);
      
      // Set the current task for tracking
      setCurrentTask({
        id: response.data.task_id,
        status: 'pending',
        security: newSecurity,
        steps: [],
        current_step: 0,
        message: response.data.message,
        created_at: new Date().toISOString(),
        completed_at: null
      });
      
      // Immediately poll for initial status
      await pollTaskStatus(response.data.task_id);
      
      // Reset form
      setNewSecurity({
        symbol: '',
        asset_class: '',
        sector: '',
        industry: '',
        price: 0,
        dividend_frequency: null
      });
    } catch (err) {
      setError('Failed to add security');
      console.error('Error adding security:', err);
      setShowProgressModal(false);
    }
  };

  const handleDeleteSecurity = async (symbol: string) => {
    if (!window.confirm(`Are you sure you want to delete ${symbol}?`)) {
      return;
    }

    try {
      await axios.delete(`/api/securities/${symbol}`);
      fetchSecurities();
    } catch (err) {
      setError('Failed to delete security');
      console.error('Error deleting security:', err);
    }
  };

  const handleCloseProgressModal = () => {
    setShowProgressModal(false);
    setCurrentTask(null);
  };

  const getStepStatusClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Security Management</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
        >
          Add Security
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Symbol</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Asset Class</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sector</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Industry</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Dividend Frequency</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {securities.map((security) => (
              <tr key={security.symbol}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{security.symbol}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{security.asset_class}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{security.sector}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{security.industry}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">${security.price.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">{security.dividend_frequency || 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                  <button
                    onClick={() => handleDeleteSecurity(security.symbol)}
                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Security Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Add New Security</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Symbol</label>
                <input
                  type="text"
                  value={newSecurity.symbol}
                  onChange={(e) => setNewSecurity({ ...newSecurity, symbol: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Asset Class</label>
                <select
                  value={newSecurity.asset_class}
                  onChange={(e) => setNewSecurity({ ...newSecurity, asset_class: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">Select Asset Class</option>
                  {assetClasses.map(assetClass => (
                    <option key={assetClass} value={assetClass}>{assetClass}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sector</label>
                <input
                  type="text"
                  value={newSecurity.sector}
                  onChange={(e) => setNewSecurity({ ...newSecurity, sector: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Industry</label>
                <input
                  type="text"
                  value={newSecurity.industry}
                  onChange={(e) => setNewSecurity({ ...newSecurity, industry: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={newSecurity.price}
                  onChange={(e) => setNewSecurity({ ...newSecurity, price: parseFloat(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Dividend Frequency</label>
                <select
                  value={newSecurity.dividend_frequency || ''}
                  onChange={(e) => setNewSecurity({ ...newSecurity, dividend_frequency: e.target.value as 'monthly' | 'quarterly' | null })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">None</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSecurityConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Confirm Security Addition</h2>
            <div className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You are about to add the security <span className="font-bold text-gray-900 dark:text-white">{newSecurity.symbol}</span>. 
                The following operations will be performed:
              </p>
              
              <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>Add entry to <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">prices</code> table with symbol, asset class, sector, industry, and price</li>
                <li>Add entry to <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">sectors</code> table with sector and industry classification</li>
                <li>Add entry to <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">asset_classes</code> table with asset class "{newSecurity.asset_class}"</li>
                <li>Add entry to <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">MPT</code> table with initial allocation data</li>
                {newSecurity.dividend_frequency && (
                  <li>Add entry to <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">dividends</code> table with {newSecurity.dividend_frequency} frequency</li>
                )}
              </ul>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-400 p-4 mb-6">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    This operation cannot be easily undone. Make sure all information is correct before proceeding.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowConfirmationModal(false);
                  setShowAddModal(true);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Back to Form
              </button>
              <button
                onClick={handleAddSecurity}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
              >
                Confirm and Add Security
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      {showProgressModal && currentTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              Adding Security: {currentTask.security.symbol}
            </h2>
            
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Progress</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  currentTask.status === 'completed' ? 'bg-green-100 text-green-800' : 
                  currentTask.status === 'failed' ? 'bg-red-100 text-red-800' : 
                  'bg-blue-100 text-blue-800'
                }`}>
                  {currentTask.status === 'completed' ? 'Completed' : 
                   currentTask.status === 'failed' ? 'Failed' : 
                   'In Progress'}
                </span>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div 
                  className={`h-2.5 rounded-full ${
                    currentTask.status === 'completed' ? 'bg-green-500' :
                    currentTask.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                  }`} 
                  style={{ 
                    width: `${currentTask.status === 'completed' ? 100 : 
                            currentTask.status === 'failed' ? 100 :
                            Math.round((currentTask.current_step / currentTask.steps.length) * 100)}%` 
                  }}
                ></div>
              </div>
            </div>
            
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Steps:</h3>
              <ul className="space-y-2">
                {currentTask.steps.map((step, index) => (
                  <li key={index} className={`flex items-center justify-between p-2 border rounded ${getStepStatusClass(step.status)}`}>
                    <span>{step.name}</span>
                    <span className="text-xs font-medium">
                      {step.status === 'completed' ? '✓ Done' :
                       step.status === 'in_progress' ? '● Working' :
                       step.status === 'failed' ? '✗ Failed' : '○ Pending'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            
            {currentTask.message && (
              <div className={`p-4 mb-6 rounded ${
                currentTask.status === 'completed' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                currentTask.status === 'failed' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              }`}>
                <p>{currentTask.message}</p>
              </div>
            )}
            
            <div className="flex justify-end">
              <button
                onClick={handleCloseProgressModal}
                disabled={currentTask.status === 'pending'}
                className={`px-4 py-2 text-sm font-medium rounded-md ${
                  currentTask.status === 'pending' ? 
                  'bg-gray-300 text-gray-500 cursor-not-allowed' : 
                  'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {currentTask.status === 'pending' ? 'Please wait...' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityManagement; 
/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import EditTransactionModal from '../components/EditTransactionModal';
import PriceHistoryChart from '../components/PriceHistoryChart';
import { ReturnChart } from '../components/ReturnChart';
import { useSymbolReturns } from '../hooks/useSymbolReturns';
import { PositionDetails } from '../components/PositionDetails';
import MarketValueChart from '../components/MarketValueChart';

interface Position {
  symbol: string;
  units: number;
  current_price: number;
  position_value: number;
  ma50: number | null;
  ma200: number | null;
  cost_basis: number;
  unrealized_gain: number;
  unrealized_gain_percent: number;
  sector: string;
  dividend_yield: number;
  annual_dividend: number;
  logo_url: string;
  realized_pl: number;
  total_dividends: number;
}

interface Transaction {
  id: number;
  date_new: string;
  symbol: string;
  xtype: string;
  acct: string;
  units: number;
  price: number;
  units_remaining: number | null;
  gain: number | null;
  disposition: string | null;
}

const PositionInfo: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [position, setPosition] = useState<Position | null>(null);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTransactions, setShowTransactions] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const { data: returnData, isLoading: returnDataLoading } = useSymbolReturns(symbol);

  const handleNavigate = useCallback(async (direction: 'next' | 'prev') => {
    if (direction === 'next' && currentIndex < allPositions.length - 1) {
      const nextSymbol = allPositions[currentIndex + 1].symbol;
      navigate(`/positions/${nextSymbol}`);
      // Fetch new position data immediately
      try {
        const response = await axios.get(`/api/positions/${nextSymbol}`);
        setPosition(response.data);
      } catch (err) {
        console.error('Failed to fetch new position data:', err);
      }
    } else if (direction === 'prev' && currentIndex > 0) {
      const prevSymbol = allPositions[currentIndex - 1].symbol;
      navigate(`/positions/${prevSymbol}`);
      // Fetch new position data immediately
      try {
        const response = await axios.get(`/api/positions/${prevSymbol}`);
        setPosition(response.data);
      } catch (err) {
        console.error('Failed to fetch new position data:', err);
      }
    }
  }, [currentIndex, allPositions, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [positionResponse, transactionsResponse, allPositionsResponse] = await Promise.all([
          axios.get(`/api/positions/${symbol}`),
          axios.get(`/api/positions/${symbol}/transactions`),
          axios.get('/api/holdings')
        ]);
        
        setPosition(positionResponse.data);
        const transformedTransactions = transactionsResponse.data.map((t: any) => ({
          ...t,
          date_new: t.date,
          xtype: t.type,
          acct: t.account
        }));
        setTransactions(transformedTransactions);
        
        // Set all positions and find current index
        const positions = allPositionsResponse.data;
        setAllPositions(positions);
        const index = positions.findIndex((p: Position) => p.symbol === symbol);
        setCurrentIndex(index >= 0 ? index : 0);
        
        setError(null);
      } catch (err) {
        setError('Failed to load position data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbol]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only handle if not typing in an input or textarea
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key.toLowerCase() === 'a') {
        handleNavigate('prev');
      } else if (event.key.toLowerCase() === 'z') {
        handleNavigate('next');
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentIndex, allPositions, handleNavigate]);

  const handleEditClick = (transaction: Transaction) => {
    if (!symbol) return; // Guard against undefined symbol
    setEditingTransaction({
      ...transaction,
      symbol: symbol
    });
    setShowEditModal(true);
  };

  const handleEditModalClose = () => {
    setShowEditModal(false);
    setEditingTransaction(null);
  };

  const handleTransactionUpdated = async () => {
    try {
      const response = await axios.get(`/api/positions/${symbol}/transactions`);
      const transformedTransactions = response.data.map((t: any) => ({
        ...t,
        date_new: t.date,
        xtype: t.type,
        acct: t.account
      }));
      setTransactions(transformedTransactions);
    } catch (err) {
      console.error('Failed to refresh transactions:', err);
    }
  };

  // Reset logo error state when position changes
  useEffect(() => {
    setLogoError(false);
  }, [position?.symbol]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-4 bg-red-500/10 text-red-500 rounded-lg">
        {error}
      </div>
    );
  }
  
  if (!position) return <div className="p-4 text-gray-300">Position not found</div>;

  return (
    <div className="text-gray-300">
      <div className="mb-4">
        <Link to="/holdings" className="text-primary-400 hover:text-primary-300 flex items-center">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Holdings
        </Link>
      </div>
      
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 mb-6">
        <div className="flex items-center mb-6">
          {!logoError && position.logo_url && (
            <img 
              src={position.logo_url} 
              alt={`${position.symbol} logo`} 
              className="w-16 h-16 mr-4 rounded-lg"
              onError={(e) => {
                setLogoError(true);
                (e.target as HTMLImageElement).style.display = 'none';
              }}
              onLoad={(e) => {
                (e.target as HTMLImageElement).style.display = 'block';
              }}
            />
          )}
          <h1 className="text-2xl font-bold text-white">{position.symbol}</h1>
        </div>

        <div
          className="grid grid-cols-1 gap-6"
          style={{
            gridTemplateColumns: '1.5fr 1fr 1fr',
            minWidth: 0,
          }}
        >
          <div className="bg-gray-900/50 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4 text-white">Position Details</h2>
            <PositionDetails 
              position={position} 
              currentIndex={currentIndex}
              totalPositions={allPositions.length}
              onNavigate={handleNavigate}
            />
          </div>

          <div className="bg-gray-900/50 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4 text-white">Dividend Information</h2>
            <div className="space-y-1">
              <p><span className="text-gray-400">Dividend Yield:</span> {position.dividend_yield.toFixed(2)}%</p>
              <p><span className="text-gray-400">Annual Dividend:</span> ${position.annual_dividend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-gray-900/50 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4 text-white">Technical Indicators</h2>
            <div className="space-y-1">
              <p><span className="text-gray-400">50-Day MA:</span> {position.ma50 ? `$${position.ma50.toFixed(2)}` : 'N/A'}</p>
              <p><span className="text-gray-400">200-Day MA:</span> {position.ma200 ? `$${position.ma200.toFixed(2)}` : 'N/A'}</p>
              <p><span className="text-gray-400">Sector:</span> {position.sector}</p>
            </div>
          </div>
        </div>

        {/* Charts Section - Side by Side */}
        <div className="mt-6 mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[400px]">
            <PriceHistoryChart symbol={symbol || ''} />
          </div>
          <ReturnChart data={returnData} isLoading={returnDataLoading} symbol={symbol || ''} />
        </div>

        {/* Market Value Chart */}
        <div className="mt-6 mb-6">
          <MarketValueChart symbol={symbol || ''} />
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        <button
          onClick={() => setShowTransactions(!showTransactions)}
          className="w-full px-6 py-4 flex items-center justify-between text-white hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-lg font-semibold">Transaction History</h2>
          <svg
            className={`w-5 h-5 transform transition-transform ${showTransactions ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showTransactions && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-900">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">ID</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Account</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Units</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Price</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Unrealized P/L</th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {transaction.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {transaction.date_new}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex rounded-md px-2 text-xs font-semibold leading-5 ${
                        transaction.xtype.toLowerCase() === 'buy' 
                          ? 'bg-green-900 text-green-200'
                          : transaction.xtype.toLowerCase() === 'sell'
                          ? 'bg-red-900 text-red-200'
                          : 'bg-blue-900 text-blue-200'
                      }`}>
                        {transaction.xtype}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{transaction.acct}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{transaction.units}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">${transaction.price.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      ${(transaction.units * transaction.price).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {transaction.xtype.toLowerCase() === 'buy' && transaction.units_remaining ? (
                        <span className={`
                          ${position.unrealized_gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                        `}>
                          {position.unrealized_gain > 0 ? '+' : ''}
                          ${position.unrealized_gain.toFixed(2)}
                          <span className="text-xs ml-1">
                            ({position.unrealized_gain_percent > 0 ? '+' : ''}
                            {position.unrealized_gain_percent.toFixed(2)}%)
                          </span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                      <button 
                        onClick={() => handleEditClick(transaction)}
                        className="text-primary-400 hover:text-primary-300"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EditTransactionModal
        transaction={editingTransaction}
        isOpen={showEditModal}
        onClose={handleEditModalClose}
        onTransactionUpdated={handleTransactionUpdated}
      />
    </div>
  );
};

export default PositionInfo;

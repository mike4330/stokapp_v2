/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TransactionForm from '../components/TransactionForm';
import EditTransactionModal from '../components/EditTransactionModal';
import styles from './Transactions.module.css';

interface Transaction {
  id: number;
  date_new: string;
  symbol: string;
  xtype: string;
  units: number;
  price: number;
  acct: string;
  units_remaining: number | null;
  gain: number | null;
  lotgain: number | null;
  term: string | null;
  disposition: string | null;
  datetime: string | null;
  fee: number | null;
  note: string | null;
  tradetype: string | null;
}

const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchTransactions = async () => {
    console.log('Fetching transactions...');
    try {
      setLoading(true);
      const response = await axios.get('/api/transactions');
      console.log('Received transactions:', response.data.length);
      setTransactions(response.data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to fetch transactions');
    } finally {
      setLoading(false);
      console.log('Finished fetching transactions');
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const calculateTotal = (units: number, price: number) => {
    return units * price;
  };

  const handleTransactionCreated = () => {
    console.log('Transaction created, refreshing list...');
    setShowForm(false);
    fetchTransactions();
  };

  const handleEditClick = (transaction: Transaction) => {
    console.log('Opening edit modal for transaction:', transaction.id);
    setEditingTransaction(transaction);
    setShowEditModal(true);
  };

  const handleEditModalClose = () => {
    console.log('Closing edit modal');
    setShowEditModal(false);
    setEditingTransaction(null);
  };

  const handleTransactionUpdated = async () => {
    console.log('Transaction updated, refreshing list...');
    await fetchTransactions();
    console.log('Transaction list refreshed');
    handleEditModalClose();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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

  return (
    <div className="py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Transactions</h1>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            A list of all transactions including their symbol, type, units, price, and date.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:w-auto"
          >
            {showForm ? 'Hide Form' : 'Add Transaction'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mt-6">
          <TransactionForm onTransactionCreated={handleTransactionCreated} />
        </div>
      )}
      
      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className={styles['table-header']}>ID</th>
                    <th scope="col" className={styles['table-header']}>Date</th>
                    <th scope="col" className={styles['table-header']}>Account</th>
                    <th scope="col" className={styles['table-header']}>Symbol</th>
                    <th scope="col" className={styles['table-header']}>Type</th>
                    <th scope="col" className={styles['table-header']}>Status</th>
                    <th scope="col" className={styles['table-header']}>Units</th>
                    <th scope="col" className={styles['table-header']}>Price</th>
                    <th scope="col" className={styles['table-header']}>Total</th>
                    <th scope="col" className={styles['table-header']}>P/L</th>
                    <th scope="col" className="relative py-2 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
                  {transactions.map((transaction) => {
                    const total = calculateTotal(transaction.units, transaction.price);
                    
                    return (
                      <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150">
                        <td className={`${styles['table-cell']} font-medium text-gray-900 dark:text-white`}>
                          {transaction.id}
                        </td>
                        <td className={`${styles['table-cell']} font-medium text-gray-900 dark:text-white`}>
                          {transaction.date_new}
                        </td>
                        <td className={styles['table-cell']}>{transaction.acct || '-'}</td>
                        <td className={styles['table-cell']}>{transaction.symbol}</td>
                        <td className={styles['table-cell']}>
                          <span className={`${styles['status-badge']} ${
                            transaction.xtype.toLowerCase() === 'buy' 
                              ? styles['status-badge-green']
                              : transaction.xtype.toLowerCase() === 'sell'
                              ? styles['status-badge-red']
                              : styles['status-badge-blue']
                          }`}>
                            {transaction.xtype}
                          </span>
                        </td>
                        <td className={styles['table-cell']}>
                          {transaction.disposition && (
                            <span className={`${styles['status-badge']} ${
                              transaction.disposition === 'sold'
                                ? styles['status-badge-gray']
                                : styles['status-badge-yellow']
                            }`}>
                              {transaction.disposition}
                            </span>
                          )}
                        </td>
                        <td className={`${styles['table-cell']} font-mono`}>{transaction.units}</td>
                        <td className={`${styles['table-cell']} font-mono`}>${transaction.price.toFixed(2)}</td>
                        <td className={`${styles['table-cell']} font-mono`}>${total.toFixed(2)}</td>
                        <td className={styles['table-cell']}>
                          {transaction.xtype === 'Sell' && transaction.gain !== null && (
                            <span className={`${
                              transaction.gain >= 0 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                              {transaction.gain >= 0 ? '+' : ''}${transaction.gain.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="relative whitespace-nowrap py-2 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <button 
                            onClick={() => handleEditClick(transaction)}
                            className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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

export default Transactions; 

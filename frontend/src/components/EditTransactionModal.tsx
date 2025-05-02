/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * EditTransactionModal Component
 * 
 * A modal dialog for editing investment transactions. Provides form fields for all
 * transaction properties, symbol autocomplete, and special handling for buy/sell
 * transactions including P/L tracking and lot disposition.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useCombobox } from 'downshift';

// Define the shape of a transaction object
interface Transaction {
  id: number;
  date_new: string;
  symbol: string;
  xtype: string;
  units: number;
  price: number;
  acct: string;
  gain?: number | null;
  disposition?: string | null;
}

// Props interface for the EditTransactionModal component
interface EditTransactionModalProps {
  transaction: Transaction | null;     // The transaction to edit, null when creating new
  isOpen: boolean;                    // Controls modal visibility
  onClose: () => void;               // Callback when modal is closed
  onTransactionUpdated: () => Promise<void>;  // Callback after successful update
}

// Available account types in the system
const ACCOUNTS = ['FID', 'FIDRI', 'TT'];
// Available transaction types
const TRANSACTION_TYPES = ['Buy', 'Sell', 'Div'];

/**
 * Modal component for editing transaction details
 * Supports:
 * - Editing existing transactions
 * - Symbol autocomplete
 * - Mark as sold functionality for Buy transactions
 * - P/L tracking for Sell transactions
 */
const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onTransactionUpdated
}) => {
  // Form state management
  const [formData, setFormData] = useState({
    date: '',
    account: '',
    symbol: '',
    type: '',
    units: '',
    price: '',
    gain: ''
  });
  
  // Error handling state
  const [error, setError] = useState<string | null>(null);
  // Symbol autocomplete suggestions
  const [symbols, setSymbols] = useState<string[]>([]);
  // Controls visibility of mark sold confirmation dialog
  const [showMarkSoldConfirmation, setShowMarkSoldConfirmation] = useState(false);

  // Initialize form data when transaction prop changes
  useEffect(() => {
    if (transaction) {
      setFormData({
        date: new Date(transaction.date_new).toISOString().split('T')[0],
        account: transaction.acct,
        symbol: transaction.symbol,
        type: transaction.xtype,
        units: transaction.units.toString(),
        price: transaction.price.toString(),
        gain: transaction.gain?.toString() || ''
      });
    }
  }, [transaction]);

  // Symbol autocomplete setup using downshift
  const {
    isOpen: isComboboxOpen,
    getMenuProps,
    getInputProps,
    getLabelProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    items: symbols,
    inputValue: formData.symbol,
    // Handle symbol search and autocomplete
    onInputValueChange: async ({ inputValue }) => {
      if (inputValue) {
        setFormData(prev => ({ ...prev, symbol: inputValue }));
        try {
          const response = await axios.get<string[]>(`/api/symbols/search?q=${inputValue}`);
          setSymbols(response.data);
        } catch (error) {
          console.error('Failed to fetch symbols:', error);
          setSymbols([]);
        }
      } else {
        setFormData(prev => ({ ...prev, symbol: '' }));
        setSymbols([]);
      }
    },
    // Handle symbol selection from dropdown
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        setFormData(prev => ({ ...prev, symbol: selectedItem }));
        setSymbols([]);
      }
    }
  });

  /**
   * Handles form submission for updating transaction details
   * @param e - Form submission event
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!transaction) return;
    
    try {
      // Prepare transaction data for API
      const updatedTransaction = {
        date: formData.date,
        account: formData.account,
        symbol: formData.symbol,
        type: formData.type,
        units: parseFloat(formData.units),
        price: parseFloat(formData.price),
        gain: formData.type === 'Sell' && formData.gain ? parseFloat(formData.gain) : 0
      };
      
      // Debug logging
      console.log('Original transaction:', transaction);
      console.log('Form data:', formData);
      console.log('Sending update payload:', updatedTransaction);
      
      // Send update request
      const response = await axios.put(`/api/transactions/${transaction.id}`, updatedTransaction);
      console.log('Update response:', response.data);
      
      // Refresh transaction list and close modal
      await onTransactionUpdated();
      onClose();
    } catch (error) {
      console.error('Failed to update transaction:', error);
      // Enhanced error handling with detailed messages
      let errorMessage = 'Failed to update transaction';
      
      if (axios.isAxiosError(error) && error.response) {
        console.log('Error response data:', error.response.data);
        console.log('Error response status:', error.response.status);
        console.log('Error response headers:', error.response.headers);
        
        const responseData = error.response.data;
        if (typeof responseData === 'string') {
          errorMessage = responseData;
        } else if (responseData && typeof responseData.detail === 'string') {
          errorMessage = responseData.detail;
        } else if (responseData && typeof responseData.message === 'string') {
          errorMessage = responseData.message;
        } else if (responseData) {
          errorMessage = JSON.stringify(responseData);
        }
      }
      
      setError(errorMessage);
    }
  };

  /**
   * Handles changes to form input fields
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /**
   * Handles marking a transaction as sold
   * Only available for Buy transactions
   */
  const handleMarkSold = async () => {
    if (!transaction) return;
    
    try {
      console.log(`Marking transaction ${transaction.id} as sold...`);
      // Update transaction with sold disposition
      await axios.put(`/api/transactions/${transaction.id}`, {
        date: transaction.date_new,
        account: transaction.acct,
        symbol: transaction.symbol,
        type: transaction.xtype,
        units: transaction.units,
        price: transaction.price,
        gain: transaction.gain,
        disposition: 'sold'
      });
      console.log(`Successfully marked transaction ${transaction.id} (${transaction.symbol}) as sold`);
      await onTransactionUpdated();
      onClose();
    } catch (error) {
      console.error('Failed to mark transaction as sold:', error);
      let errorMessage = 'Failed to mark transaction as sold';
      
      if (axios.isAxiosError(error) && error.response?.data) {
        errorMessage = typeof error.response.data === 'string' 
          ? error.response.data 
          : error.response.data.detail || error.response.data.message || JSON.stringify(error.response.data);
      }
      
      setError(errorMessage);
    }
    setShowMarkSoldConfirmation(false);
  };

  // Don't render if modal is closed
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-gray-800 bg-opacity-90 p-6 rounded-lg shadow-xl w-5/6 max-w-2xl animate-slideIn">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">
            Edit Transaction {transaction?.id ? `(ID: ${transaction.id})` : ''}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500 text-white p-3 rounded-md mb-4 text-sm">
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm py-2 px-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Account</label>
              <select
                name="account"
                value={formData.account}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm py-2 px-1"
                required
              >
                {ACCOUNTS.map(account => (
                  <option key={account} value={account}>{account}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm py-2 px-1"
                required
              >
                {TRANSACTION_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <label {...getLabelProps()} className="block text-sm font-medium text-gray-300 mb-1">Symbol</label>
              <div className="relative">
                <input
                  {...getInputProps()}
                  name="symbol"
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm py-2 px-3"
                  required
                />
                <ul {...getMenuProps()} 
                  className={`absolute z-50 w-full bg-gray-700 mt-1 rounded-md shadow-lg max-h-60 overflow-auto ${
                    isComboboxOpen && symbols.length > 0 ? 'block' : 'hidden'
                  }`}
                >
                  {isComboboxOpen &&
                    symbols.map((item, index) => (
                      <li
                        key={item}
                        {...getItemProps({ item, index })}
                        className={`px-3 py-2 cursor-pointer text-white hover:bg-gray-600 text-sm ${
                          highlightedIndex === index ? 'bg-gray-600' : ''
                        }`}
                      >
                        {item}
                      </li>
                    ))
                  }
                </ul>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Units</label>
              <input
                type="number"
                name="units"
                value={formData.units}
                onChange={handleInputChange}
                step="any"
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm py-2 px-3"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Price</label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleInputChange}
                step="any"
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm py-2 px-3"
                required
              />
            </div>
          </div>

          {formData.type === 'Sell' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">Profit/Loss (P/L)</label>
              <input
                type="number"
                name="gain"
                value={formData.gain}
                onChange={handleInputChange}
                step="any"
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm py-2 px-3"
                placeholder="Enter realized profit/loss amount"
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter the total profit or loss for this sale. This value will be stored in the 'gain' column.
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <div>
              {formData.type === 'Buy' && (
                <button
                  type="button"
                  onClick={() => setShowMarkSoldConfirmation(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                >
                  Mark Sold
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>

        {/* Mark Sold Confirmation Dialog */}
        {showMarkSoldConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
              <h3 className="text-lg font-medium text-white mb-4">Confirm Mark Sold</h3>
              <p className="text-gray-300 mb-6">
                Are you sure you want to mark this transaction as sold? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowMarkSoldConfirmation(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkSold}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditTransactionModal;
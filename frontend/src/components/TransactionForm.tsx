/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * TransactionForm Component
 * 
 * Form for creating new investment transactions. Provides input validation,
 * symbol autocomplete, and specialized handling for different transaction
 * types (buy, sell, dividend).
 */

import React, { useState } from 'react';
import { useCombobox } from 'downshift';
import axios from 'axios';

interface TransactionFormProps {
    onTransactionCreated?: () => void;
}

interface FormData {
    date: string;
    account: string;
    symbol: string;
    type: 'Buy' | 'Sell' | 'Div';
    units: string;
    price: string;
}

const ACCOUNTS = ['FID', 'FIDRI', 'TT'];

const TransactionForm: React.FC<TransactionFormProps> = ({ onTransactionCreated }) => {
    const [symbols, setSymbols] = useState<string[]>([]);
    const [formData, setFormData] = useState<FormData>({
        date: new Date().toISOString().split('T')[0],
        account: 'FIDRI',
        symbol: '',
        type: 'Buy',
        units: '',
        price: ''
    });
    const [error, setError] = useState<string | null>(null);

    const {
        isOpen,
        getMenuProps,
        getInputProps,
        getLabelProps,
        highlightedIndex,
        getItemProps,
    } = useCombobox({
        items: symbols,
        inputValue: formData.symbol,
        onInputValueChange: async ({ inputValue }) => {
            if (inputValue) {
                setFormData(prev => ({ ...prev, symbol: inputValue }));
                try {
                    const response = await axios.get<string[]>(`/api/crud/symbols/search?q=${inputValue}`);
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
        onSelectedItemChange: ({ selectedItem }) => {
            if (selectedItem) {
                setFormData(prev => ({ ...prev, symbol: selectedItem }));
                setSymbols([]); // Clear suggestions after selection
            }
        }
    });

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        
        try {
            const response = await axios.post('/api/transactions', {
                ...formData,
                units: parseFloat(formData.units),
                price: parseFloat(formData.price)
            });
            
            // Reset form
            setFormData({
                date: new Date().toISOString().split('T')[0],
                account: 'FIDRI',
                symbol: '',
                type: 'Buy',
                units: '',
                price: ''
            });
            
            if (onTransactionCreated) {
                onTransactionCreated();
            }
        } catch (error) {
            console.error('Failed to create transaction:', error);
            if (axios.isAxiosError(error) && error.response) {
                setError(error.response.data.detail || 'Failed to create transaction');
            } else {
                setError('Failed to create transaction');
            }
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value as string }));
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto bg-gray-800 p-4 rounded-lg">
            {error && (
                <div className="bg-red-500 text-white p-2 rounded-md mb-3 text-sm">
                    {error}
                </div>
            )}
            
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="block text-sm font-medium text-gray-300">Date</label>
                    <input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Account</label>
                    <select
                        name="account"
                        value={formData.account}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm"
                        required
                    >
                        {ACCOUNTS.map(account => (
                            <option key={account} value={account}>{account}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Type</label>
                    <select
                        name="type"
                        value={formData.type}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm"
                        required
                    >
                        <option value="Buy">Buy</option>
                        <option value="Sell">Sell</option>
                        <option value="Div">Dividend</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                    <label {...getLabelProps()} className="block text-sm font-medium text-gray-300">Symbol</label>
                    <div className="relative">
                        <input
                            {...getInputProps()}
                            name="symbol"
                            className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm"
                            required
                        />
                        <ul {...getMenuProps()} 
                            className={`absolute z-50 w-full bg-gray-700 mt-1 rounded-md shadow-lg max-h-60 overflow-auto ${
                                isOpen && symbols.length > 0 ? 'block' : 'hidden'
                            }`}
                        >
                            {isOpen &&
                                symbols.map((item, index) => (
                                    <li
                                        key={item}
                                        {...getItemProps({ item, index })}
                                        className={`px-3 py-1 cursor-pointer text-white hover:bg-gray-600 text-sm ${
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
                    <label className="block text-sm font-medium text-gray-300">Units</label>
                    <input
                        type="number"
                        name="units"
                        value={formData.units}
                        onChange={handleInputChange}
                        step="any"
                        className="mt-1 pt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-300">Price</label>
                    <input
                        type="number"
                        name="price"
                        value={formData.price}
                        onChange={handleInputChange}
                        step="any"
                        className="mt-1 pt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white text-sm"
                        required
                    />
                </div>
            </div>

            <div className="flex justify-end mt-3">
                <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                    Add Transaction
                </button>
            </div>
        </form>
    );
};

export default TransactionForm; 

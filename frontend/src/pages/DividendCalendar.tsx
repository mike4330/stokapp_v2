/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getDividendStyle, generateColorStops } from '../utils/colorUtils';

interface DividendPayment {
  symbol: string;
  payment_date: string;
  amount: number;
  current_price: number;
  dividend_yield: number;
  net_units: number;
  expected_payment: number;
}

const DividendCalendar: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [payments, setPayments] = useState<DividendPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [maxAmount, setMaxAmount] = useState<number>(100);
  const [colorStops, setColorStops] = useState<Array<{value: number, color: string, text: string}>>([]);

  const handlePreviousMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1); // month is 0-based in JS Date
    setSelectedMonth(date.toISOString().slice(0, 7));
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month, 1); // month is 0-based in JS Date
    setSelectedMonth(date.toISOString().slice(0, 7));
  };

  const formatMonthYear = (monthYear: string) => {
    const [year, month] = monthYear.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const isCurrentMonth = (monthYear: string) => {
    const today = new Date();
    const [year, month] = monthYear.split('-').map(Number);
    return year === today.getFullYear() && month === today.getMonth() + 1;
  };

  // Update color stops whenever maxAmount changes
  useEffect(() => {
    setColorStops(generateColorStops(maxAmount));
  }, [maxAmount]);

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        setLoading(true);
        const [year, month] = selectedMonth.split('-');
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${year}-${month}-${lastDay}`;
        
        const response = await axios.get<DividendPayment[]>(`/api/dividends/calendar?start_date=${startDate}&end_date=${endDate}`);
        
        // Filter out past dividends if viewing current month
        let filteredPayments = response.data;
        if (isCurrentMonth(selectedMonth)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          filteredPayments = response.data.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            paymentDate.setHours(0, 0, 0, 0);
            return paymentDate >= today;
          });
        }
        
        setPayments(filteredPayments);
        
        // Calculate max amount for color scaling based on filtered payments
        if (filteredPayments.length > 0) {
          const maxPayment = Math.max(...filteredPayments.map(p => p.expected_payment || 0));
          // Round up to the nearest nice number for the scale
          const scale = Math.pow(10, Math.floor(Math.log10(maxPayment)));
          const roundedMax = Math.ceil(maxPayment / scale) * scale;
          setMaxAmount(roundedMax > 0 ? roundedMax : 100); // Default if all zero
        } else {
          setMaxAmount(100); // Default if no payments
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching dividend calendar:', err);
        setError('Failed to load dividend calendar. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [selectedMonth]);

  // Group payments by date
  const paymentsByDate = payments.reduce((acc, payment) => {
    const date = payment.payment_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(payment);
    return acc;
  }, {} as Record<string, DividendPayment[]>);

  // Calculate total expected payment for a date
  const getTotalForDate = (date: string) => {
    return paymentsByDate[date].reduce((sum, payment) => sum + (payment.expected_payment || 0), 0);
  };

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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Dividend Calendar</h1>
        
        {/* Enhanced Month Selector */}
        <div className="flex items-center space-x-4 bg-white dark:bg-gray-800 rounded-lg shadow-md p-2">
          <button
            onClick={handlePreviousMonth}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
            aria-label="Previous month"
          >
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex items-center space-x-2">
            <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              {formatMonthYear(selectedMonth)}
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="sr-only"
              aria-label="Select month"
            />
          </div>
          
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
            aria-label="Next month"
          >
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dynamic Color Legend */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          Expected Payment Color Scale (Max: ${maxAmount.toLocaleString()})
        </h3>
        <div className="flex h-6 rounded-md overflow-hidden w-full">
          {colorStops.map((stop, i) => (
            <div 
              key={i} 
              className="flex-1 relative" 
              style={{ backgroundColor: stop.color }}
            >
              {i === 0 && (
                <span className={`text-xs px-1 absolute left-0 bottom-0 ${stop.text}`}>$1</span>
              )}
              {i === colorStops.length - 1 && (
                <span className={`text-xs px-1 absolute right-0 bottom-0 ${stop.text}`}>
                  ${maxAmount.toLocaleString()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.entries(paymentsByDate).length > 0 ? (
          Object.entries(paymentsByDate).map(([date, datePayments]) => (
            <div key={date} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 flex justify-between items-center">
                <h3 className="font-medium text-gray-800 dark:text-gray-200">
                  {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </h3>
                <span 
                  className="text-sm font-medium px-2 py-1 rounded"
                  style={getDividendStyle(getTotalForDate(date), 1, maxAmount)}
                >
                  ${getTotalForDate(date).toFixed(2)}
                </span>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {datePayments.map((payment) => (
                  <div key={`${date}-${payment.symbol}`} className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{payment.symbol}</span>
                      <span 
                        className="text-sm font-medium px-2 py-1 rounded"
                        style={getDividendStyle(payment.expected_payment || 0, 1, maxAmount)}
                      >
                        ${payment.expected_payment?.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <div>Amount: ${payment.amount?.toFixed(2)} per share</div>
                      <div>Shares: {payment.net_units?.toFixed(2)}</div>
                      <div>Yield: {payment.dividend_yield?.toFixed(2)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <p className="text-gray-600 dark:text-gray-400">No dividend payments scheduled for this month.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DividendCalendar;

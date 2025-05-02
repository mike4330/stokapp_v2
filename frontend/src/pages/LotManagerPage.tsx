/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React, { useRef, useState } from 'react';
import LotManager, { LotManagerRef } from '../components/LotManager';
import EditTransactionModal from '../components/EditTransactionModal';
import { OpenLot } from '../components/LotManager';

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

const LotManagerPage: React.FC = () => {
  const lotManagerRef = useRef<LotManagerRef>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lotToClose, setLotToClose] = useState<OpenLot | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const handleTransactionUpdated = async () => {
    console.log('Transaction updated, starting refresh sequence...');
    try {
      if (lotManagerRef.current) {
        await lotManagerRef.current.refresh();
        console.log('Lots refresh completed successfully');
        setRefreshKey(prev => prev + 1);
      } else {
        console.error('LotManager ref is not available');
      }
    } catch (error) {
      console.error('Error refreshing lots:', error);
    }
  };

  const handleCloseModal = () => {
    console.log('Closing modal and clearing selected transaction');
    setIsModalOpen(false);
    setSelectedTransaction(null);
  };

  const handleEditLot = (lot: OpenLot) => {
    console.log('Opening edit modal for lot:', lot);
    const transaction: Transaction = {
      id: lot.id,
      date_new: lot.date_new,
      symbol: lot.symbol,
      xtype: 'Buy',
      units: lot.units || 0,
      price: lot.price || 0,
      acct: lot.acct
    };
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleCloseLot = (lot: OpenLot) => {
    setLotToClose(lot);
    setShowCloseConfirm(true);
    setCloseError(null);
  };

  const confirmCloseLot = async () => {
    if (!lotToClose) return;
    setIsClosing(true);
    setCloseError(null);
    try {
      // Prepare payload
      const payload: any = {
        date: lotToClose.date_new,
        account: lotToClose.acct,
        symbol: lotToClose.symbol,
        type: 'Buy',
        units: lotToClose.units,
        price: lotToClose.price,
        disposition: 'sold'
      };
      // Only include units_remaining if it's a valid number
      if (lotToClose.units_remaining !== undefined && lotToClose.units_remaining !== null && !isNaN(Number(lotToClose.units_remaining))) {
        payload.units_remaining = lotToClose.units_remaining;
      }
      const response = await fetch(`/api/transactions/${lotToClose.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      console.log('Close lot response:', data);
      setShowCloseConfirm(false);
      setLotToClose(null);
      setIsClosing(false);
      await handleTransactionUpdated();
    } catch (error: any) {
      setCloseError(error?.message || 'Failed to close lot');
      setIsClosing(false);
    }
  };

  const cancelCloseLot = () => {
    setShowCloseConfirm(false);
    setLotToClose(null);
    setCloseError(null);
  };

  return (
    <div>
      <LotManager 
        key={refreshKey}
        ref={lotManagerRef}
        onEditLot={handleEditLot}
        onCloseLot={handleCloseLot}
      />
      <EditTransactionModal 
        transaction={selectedTransaction}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onTransactionUpdated={handleTransactionUpdated}
      />
      {showCloseConfirm && lotToClose && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-white mb-4">Confirm Close Lot</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to close this lot (ID: {lotToClose.id}, Symbol: {lotToClose.symbol})? This action cannot be undone.
            </p>
            {closeError && (
              <div className="bg-red-500 text-white p-2 rounded mb-3 text-sm">{closeError}</div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelCloseLot}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md"
                disabled={isClosing}
              >
                Cancel
              </button>
              <button
                onClick={confirmCloseLot}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md"
                disabled={isClosing}
              >
                {isClosing ? 'Closing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LotManagerPage; 
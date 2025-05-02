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

  return (
    <div>
      <LotManager 
        key={refreshKey}
        ref={lotManagerRef}
        onEditLot={handleEditLot}
      />
      <EditTransactionModal 
        transaction={selectedTransaction}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onTransactionUpdated={handleTransactionUpdated}
      />
    </div>
  );
};

export default LotManagerPage; 